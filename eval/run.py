"""Score the pipeline (and a raw-logs baseline) on eval/cases.json.

Usage: PYTHONPATH=. uv run python eval/run.py [--no-llm] [--baseline] [--only case01,case02]

Reads only fixtures (tx JSON + IDL snapshots), so results don't depend on the
chain. Metrics:
- correct cause: predicted category matches, and the custom error code too
- hallucinated numbers: numbers in the final prose not present in the brief
  (baseline: not present anywhere in the tx it was given). Must be 0.
- fix usefulness: hand scores 0-2 from eval/fix_scores.json
- median latency, tokens per autopsy
"""

import json
import statistics
import sys
import time
from pathlib import Path

from rektopsy import decode
from rektopsy.explain import LLMUnavailable, complete
from rektopsy.pipeline import autopsy
from rektopsy.verify import allowed_numbers, unsupported_numbers

EVAL = Path(__file__).resolve().parent
decode.IDL_CACHE = EVAL / "fixtures" / "idl"

CATEGORIES = ["slippage", "compute_budget", "insufficient_funds", "account_not_found",
              "unknown_custom", "never_landed", "succeeded", "other"]
BASELINE_PROMPT = f"""You explain Solana transactions to beginners. You get the raw transaction (logs and error).
Reply with JSON: {{"category": one of {CATEGORIES}, "cause": "...", "fix": "...", "funds": "..."}}.
If the transaction is null it never landed on chain."""


def load_cases(only: set[str] | None) -> list[dict]:
    cases = json.loads((EVAL / "cases.json").read_text())
    return [c for c in cases if not only or c["id"] in only]


def fixture(sig: str) -> dict | None:
    return json.loads((EVAL / "fixtures" / f"{sig}.json").read_text())


def correct(case: dict, category: str, code) -> bool:
    exp = case["expected"]
    if category != case["category"]:
        return False
    return exp.get("custom_code") is None or exp["custom_code"] == code


def run_pipeline(cases: list[dict], use_llm: bool) -> list[dict]:
    rows = []
    for c in cases:
        out = autopsy(c["signature"], fixture(c["signature"]), fetched=True, use_llm=use_llm)
        text = " ".join([out["cause"], out["fix"], out["funds"]])
        code = (out["brief"].get("cause") or {}).get("custom_code")
        rows.append({
            "id": c["id"], "expected": c["category"], "predicted": out["category"],
            "correct": correct(c, out["category"], code),
            "hallucinated": unsupported_numbers(text, out["brief"]),
            "first_attempt_rejected": bool(out["meta"]["rejected"]),
            "mode": out["meta"]["mode"], "latency_ms": out["meta"]["latency_ms"],
            "tokens": out["meta"]["tokens"], "cause": out["cause"], "fix": out["fix"], "funds": out["funds"],
        })
        print(f"{c['id']} {'ok ' if rows[-1]['correct'] else 'BAD'} {out['category']:18} "
              f"{out['meta']['mode']:8} halluc={rows[-1]['hallucinated']}", flush=True)
    return rows


def run_baseline(cases: list[dict]) -> list[dict]:
    rows = []
    for c in cases:
        tx = fixture(c["signature"])
        given = None if tx is None else {"err": tx["meta"]["err"], "logs": tx["meta"].get("logMessages"),
                                         "fee": tx["meta"]["fee"]}
        started = time.perf_counter()
        content, usage = complete([{"role": "system", "content": BASELINE_PROMPT},
                                   {"role": "user", "content": json.dumps(given)}])
        latency = round((time.perf_counter() - started) * 1000)
        try:
            out = json.loads(content)
        except json.JSONDecodeError:
            out = {}
        text = " ".join(str(out.get(k, "")) for k in ("cause", "fix", "funds"))
        allowed = allowed_numbers(tx) if tx else set()
        rows.append({
            "id": c["id"], "expected": c["category"], "predicted": out.get("category"),
            "correct": out.get("category") == c["category"],
            "hallucinated": unsupported_numbers(text, {"n": list(allowed)}) if text.strip() else [],
            "latency_ms": latency, "tokens": usage.get("total_tokens", 0),
            "cause": out.get("cause"), "fix": out.get("fix"), "funds": out.get("funds"),
        })
        print(f"{c['id']} baseline {'ok ' if rows[-1]['correct'] else 'BAD'} {out.get('category')} "
              f"halluc={rows[-1]['hallucinated']}", flush=True)
    return rows


def summarize(rows: list[dict], scores: dict) -> dict:
    scored = [scores[r["id"]] for r in rows if r["id"] in scores]
    return {
        "cases": len(rows),
        "correct_cause_pct": round(100 * sum(r["correct"] for r in rows) / len(rows), 1),
        "hallucinated_numbers": sum(len(r["hallucinated"]) for r in rows),
        "fix_usefulness_avg": round(statistics.mean(scored), 2) if scored else None,
        "fix_usefulness_scored": len(scored),
        "median_latency_ms": statistics.median(r["latency_ms"] for r in rows),
        "median_tokens": statistics.median(r["tokens"] for r in rows),
    }


def main() -> None:
    only = set(sys.argv[sys.argv.index("--only") + 1].split(",")) if "--only" in sys.argv else None
    cases = load_cases(only)
    scores_path = EVAL / "fix_scores.json"
    scores = json.loads(scores_path.read_text()) if scores_path.exists() else {}
    use_llm = "--no-llm" not in sys.argv

    results = {"pipeline": run_pipeline(cases, use_llm)}
    summary = {"pipeline": summarize(results["pipeline"], scores.get("pipeline", {}))}
    if "--baseline" in sys.argv:
        try:
            results["baseline"] = run_baseline(cases)
            summary["baseline"] = summarize(results["baseline"], scores.get("baseline", {}))
        except LLMUnavailable as e:
            print(f"baseline skipped: {e}")

    (EVAL / "results.json").write_text(json.dumps({"summary": summary, **results}, indent=2) + "\n")
    print("\n| metric | " + " | ".join(summary) + " |\n|---|" + "---|" * len(summary))
    for k in summary["pipeline"]:
        print(f"| {k} | " + " | ".join(str(s[k]) for s in summary.values()) + " |")


if __name__ == "__main__":
    main()
