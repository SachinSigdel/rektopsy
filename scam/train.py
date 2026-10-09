"""Train the scam-check text model and score it on held-out messages.

Usage: uv run --group train python scam/train.py

Model: TF-IDF features + logistic regression. Chosen because it is small, runs
without ML libraries at inference, and every score splits into per-word
contributions, which become the evidence ("these words pushed it toward scam").

20% of messages (stratified by source and label) are held out and never seen in
training. Scores are reported overall and per source. The flag threshold is
picked by cross-validation on the training part only, then the shipped model is
refit on all messages and exported to rektopsy/data/scam_model.json, which
rektopsy/scam.py scores in plain Python (no scikit-learn on the server).
Writes scam/results.json.
"""

import json
import random
import sys
from pathlib import Path

import numpy as np

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import precision_recall_fscore_support
from sklearn.model_selection import cross_val_predict
from sklearn.pipeline import FeatureUnion, make_pipeline

HERE = Path(__file__).resolve().parent
SEED = 7
SHIPPED = "words"  # explainable: every feature is a word or word pair
MAX_FALSE_ALARMS = 0.01  # threshold: lowest that flags at most 1% of normal messages
EXPORT = HERE.parent / "rektopsy" / "data" / "scam_model.json"

CONFIGS = {
    "words": lambda: TfidfVectorizer(ngram_range=(1, 2), min_df=2, sublinear_tf=True),
    # Character pieces catch respellings like "fr33 n1tro", but are harder to show as evidence.
    "words+chars": lambda: FeatureUnion([
        ("w", TfidfVectorizer(ngram_range=(1, 2), min_df=2, sublinear_tf=True)),
        ("c", TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), min_df=2, sublinear_tf=True)),
    ]),
}


def split(rows: list[dict], test_share: float = 0.2) -> tuple[list[dict], list[dict]]:
    groups: dict[tuple, list[dict]] = {}
    for r in rows:
        groups.setdefault((r["source"], r["label"]), []).append(r)
    rng = random.Random(SEED)
    train, test = [], []
    for g in groups.values():
        rng.shuffle(g)
        cut = round(len(g) * test_share)
        test += g[:cut]
        train += g[cut:]
    return train, test


def scores(y_true: list[int], y_pred: list[int]) -> dict:
    p, r, f, _ = precision_recall_fscore_support(y_true, y_pred, average="binary", zero_division=0)
    wrong_flags = sum(1 for t, q in zip(y_true, y_pred) if q and not t)
    return {"precision": round(p, 3), "recall": round(r, 3), "f1": round(f, 3),
            "n": len(y_true), "scams": sum(y_true), "false_alarms": wrong_flags}


def make_model(name: str):
    return make_pipeline(CONFIGS[name](), LogisticRegression(
        C=4.0, class_weight="balanced", max_iter=2000))


def train_model(name: str, train: list[dict]):
    model = make_model(name)
    model.fit([r["text"] for r in train], [r["label"] for r in train])
    return model


def pick_threshold(train: list[dict]) -> float:
    """Lowest threshold whose cross-validated false-alarm rate is within budget."""
    texts, labels = [r["text"] for r in train], np.array([r["label"] for r in train])
    proba = cross_val_predict(make_model(SHIPPED), texts, labels, cv=5, method="predict_proba")[:, 1]
    clean = proba[labels == 0]
    for t in np.arange(0.30, 0.96, 0.01):
        if (clean >= t).mean() <= MAX_FALSE_ALARMS:
            return round(float(t), 2)
    return 0.95


def to_json(model, threshold: float, n_rows: int) -> dict:
    vec, clf = model.steps[0][1], model.steps[1][1]
    coef = clf.coef_[0]
    terms = {term: [round(float(vec.idf_[i]), 5), round(float(coef[i]), 5)]
             for term, i in vec.vocabulary_.items()}
    out = {
        "kind": "tfidf_logreg",
        "ngram_range": list(vec.ngram_range),
        "token_pattern": vec.token_pattern,
        "sublinear_tf": vec.sublinear_tf,
        "intercept": round(float(clf.intercept_[0]), 5),
        "threshold": threshold,
        "trained_on": n_rows,
        "sources": ["Discord scam/clean messages (MIT)", "SMS Spam Collection (CC BY 4.0)",
                    "Solana Stack Exchange questions (CC BY-SA)"],
        "terms": terms,
    }
    return out


def combined(model_json: dict, test: list[dict]) -> dict:
    """Rules + links + model, as the API runs them, with a model that never saw `test`."""
    import re
    from rektopsy import scam
    scam._MODEL = {**model_json, "_token_re": re.compile(model_json["token_pattern"])}
    lists = scam.Blocklists.load()
    out = {}
    for src in sorted({r["source"] for r in test}):
        part = [r for r in test if r["source"] == src]
        verdicts = [scam.check_message(r["text"], lists)["verdict"] for r in part]
        row = {}
        for label, name in [(0, "normal"), (1, "scam")]:
            vs = [v for v, r in zip(verdicts, part) if r["label"] == label]
            if vs:
                row[name] = {v: vs.count(v) for v in ("likely_scam", "suspicious", "no_red_flags")}
        out[src] = row
    scam._MODEL = None
    return out


def main() -> None:
    rows = [json.loads(line) for line in open(HERE / "data" / "messages.jsonl")]
    train, test = split(rows)
    print(f"train {len(train)} ({sum(r['label'] for r in train)} scam), "
          f"test {len(test)} ({sum(r['label'] for r in test)} scam)\n")
    results = {}
    for name in CONFIGS:
        model = train_model(name, train)
        pred = list(model.predict([r["text"] for r in test]))
        res = {"overall": scores([r["label"] for r in test], pred)}
        for src in sorted({r["source"] for r in test}):
            idx = [i for i, r in enumerate(test) if r["source"] == src]
            res[src] = scores([test[i]["label"] for i in idx], [pred[i] for i in idx])
        results[name] = res
        print(name)
        for k, v in res.items():
            print(f"  {k:10} precision {v['precision']:.3f}  recall {v['recall']:.3f}  "
                  f"f1 {v['f1']:.3f}  false alarms {v['false_alarms']}/{v['n'] - v['scams']}  "
                  f"(n={v['n']}, scams={v['scams']})")

    # Threshold from cross-validation on the training part; scored once on the test part.
    threshold = pick_threshold(train)
    model = train_model(SHIPPED, train)
    proba = model.predict_proba([r["text"] for r in test])[:, 1]
    pred = [int(p >= threshold) for p in proba]
    res = {"threshold": threshold, "overall": scores([r["label"] for r in test], pred)}
    for src in sorted({r["source"] for r in test}):
        idx = [i for i, r in enumerate(test) if r["source"] == src]
        res[src] = scores([test[i]["label"] for i in idx], [pred[i] for i in idx])
    results[f"{SHIPPED}@threshold"] = res
    print(f"\n{SHIPPED} at threshold {threshold} (picked by 5-fold CV on train, max "
          f"{MAX_FALSE_ALARMS:.0%} false alarms)")
    for k, v in res.items():
        if k != "threshold":
            print(f"  {k:10} precision {v['precision']:.3f}  recall {v['recall']:.3f}  "
                  f"false alarms {v['false_alarms']}/{v['n'] - v['scams']}")
    sys.path.insert(0, str(HERE.parent))
    results["combined"] = combined(to_json(model, threshold, len(train)), test)
    print("\nrules + links + model on the test part (verdict counts):")
    for src, row in results["combined"].items():
        print(f"  {src:10} {row}")
    (HERE / "results.json").write_text(json.dumps(results, indent=2) + "\n")

    # Ship: refit on everything, export, and check the plain-Python scorer matches.
    final = train_model(SHIPPED, rows)
    EXPORT.parent.mkdir(exist_ok=True)
    EXPORT.write_text(json.dumps(to_json(final, threshold, len(rows)),
                                 separators=(",", ":"), sort_keys=True))
    from rektopsy.scam import model_score
    texts = [r["text"] for r in rows[::25]]
    ref = final.predict_proba(texts)[:, 1]
    worst = max(abs(model_score(t)["score"] - p) for t, p in zip(texts, ref))
    print(f"\nexported {EXPORT.relative_to(HERE.parent)} "
          f"({EXPORT.stat().st_size // 1024} KB); max score difference vs sklearn {worst:.5f}")
    assert worst < 1e-3, "plain-Python scorer disagrees with sklearn"


if __name__ == "__main__":
    main()
