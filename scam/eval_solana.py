"""Score the scam check on real Solana messages it was never tuned or trained on.

Usage: uv run python scam/eval_solana.py [--show]

- Scams: scam/solana_test.json, real messages quoted in public sources, each
  with its source URL and the source's own words calling it a scam. Collected
  without reference to the rules, so the set isn't biased toward what we catch.
  "illustrative" ones (written as examples by a guide) are scored separately.
- Normal: scam/data/test_normal.jsonl from scam/fetch_test_normal.py.

A scam counts as caught if the verdict is likely_scam or suspicious. Writes
scam/solana_results.json. --show lists every miss and false alarm.
"""

import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from rektopsy.scam import Blocklists, check_message  # noqa: E402

HERE = Path(__file__).resolve().parent


def rate(verdicts: list[str]) -> dict:
    c = Counter(verdicts)
    return {"n": len(verdicts), "likely_scam": c["likely_scam"], "suspicious": c["suspicious"],
            "no_red_flags": c["no_red_flags"]}


def main() -> None:
    show = "--show" in sys.argv
    lists = Blocklists.load()
    scams = json.loads((HERE / "solana_test.json").read_text())
    normal = [json.loads(line) for line in open(HERE / "data" / "test_normal.jsonl")]

    results: dict = {"scams": {}, "normal": {}, "by_channel": {}, "rules_that_fired": {}}
    fired: Counter = Counter()
    misses = []
    for prov in ("real", "illustrative"):
        part = [s for s in scams if s["provenance"] == prov]
        verdicts = []
        for s in part:
            out = check_message(s["text"], lists)
            verdicts.append(out["verdict"])
            fired.update({f["rule"] for f in out["red_flags"]})
            if out["verdict"] == "no_red_flags":
                misses.append((prov, s, out["model"]["score_pct"]))
            if prov == "real":
                results["by_channel"].setdefault(s["channel"], []).append(out["verdict"])
        results["scams"][prov] = rate(verdicts)
    results["by_channel"] = {k: rate(v) for k, v in results["by_channel"].items()}
    results["rules_that_fired"] = dict(fired.most_common())

    false_alarms = []
    for src in sorted({r["source"] for r in normal}):
        part = [r for r in normal if r["source"] == src]
        verdicts = []
        for r in part:
            out = check_message(r["text"], lists)
            verdicts.append(out["verdict"])
            if out["verdict"] != "no_red_flags":
                false_alarms.append((r, out))
        results["normal"][src] = rate(verdicts)

    for prov, v in results["scams"].items():
        caught = v["likely_scam"] + v["suspicious"]
        print(f"scams ({prov:12}) caught {caught}/{v['n']}  "
              f"(likely scam {v['likely_scam']}, suspicious {v['suspicious']})")
    for src, v in results["normal"].items():
        print(f"normal ({src:15}) flagged {v['likely_scam'] + v['suspicious']}/{v['n']}  "
              f"(likely scam {v['likely_scam']})")
    print("real scams by channel:", {k: f"{v['n'] - v['no_red_flags']}/{v['n']}"
                                     for k, v in results["by_channel"].items()})
    print("rules that fired:", results["rules_that_fired"])
    if show:
        print("\nMISSED:")
        for prov, s, score in misses:
            print(f"  [{prov}] model {score}%  {s['text'][:150]!r}\n     {s['source_url']}")
        print("\nFALSE ALARMS:")
        for r, out in false_alarms:
            print(f"  {out['verdict']} {[f['rule'] for f in out['red_flags']]} {r['text'][:120]!r}")
    (HERE / "solana_results.json").write_text(json.dumps(results, indent=2) + "\n")


if __name__ == "__main__":
    main()
