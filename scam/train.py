"""Train the scam-check text model and score it on held-out messages.

Usage: uv run --group train python scam/train.py

Model: TF-IDF features + logistic regression. Chosen because it is small, runs
without ML libraries at inference, and every score splits into per-word
contributions, which become the evidence ("these words pushed it toward scam").

20% of messages (stratified by source and label) are held out and never seen in
training. Scores are reported overall and per source. Writes scam/results.json.
"""

import json
import random
from pathlib import Path

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import precision_recall_fscore_support
from sklearn.pipeline import FeatureUnion, make_pipeline

HERE = Path(__file__).resolve().parent
SEED = 7

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


def train_model(name: str, train: list[dict]):
    model = make_pipeline(CONFIGS[name](), LogisticRegression(
        C=4.0, class_weight="balanced", max_iter=2000))
    model.fit([r["text"] for r in train], [r["label"] for r in train])
    return model


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
    (HERE / "results.json").write_text(json.dumps(results, indent=2) + "\n")


if __name__ == "__main__":
    main()
