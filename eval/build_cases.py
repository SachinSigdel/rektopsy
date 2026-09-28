"""Rebuild eval/cases.json and eval/fixtures/ from the curated list below.

Usage: PYTHONPATH=. uv run python eval/build_cases.py

Labels come from evidence, not from the pipeline under test: the failing
program's own error log line, a published IDL, or (for unknown_custom) the
absence of any error table. Signatures were found with eval/discover.py.
"""

import json
from pathlib import Path

from rektopsy.fetch import fetch_transaction
from rektopsy.parse import extract_facts

EVAL = Path(__file__).resolve().parent
JUP_IDL_REF = ("Jupiter v6 on-chain IDL and https://dev.jup.ag/docs/swap/common-errors: "
               "6001 = SlippageToleranceExceeded")
BOT_NOTE = ("Bot wallet (no real-user example found in a 5000-tx scan; wallets simulate first, so "
            "users rarely hit this). Kept because the failure mechanics are identical.")
SYNTHETIC_NOTE = ("Synthetic: well-formed random signature, never submitted. A real stale-blockhash tx is "
                  "never stored on chain, so getTransaction returns null either way.")

# (category, signature, cause, extra) — extra may set error_name (from IDL) or notes.
CASES = [
    ("slippage", "36V9G2WgBdWsZNdgsb1V2U4jJ9xGfNC5ehv9YeKrGnvhXjKNTgcBoJian5VtRNFBHYegjhbRWtQ1eBwmqXJEgrcg",
     "Jupiter swap at 0.5% slippage: output fell below the minimum", {"error_name": "SlippageToleranceExceeded"}),
    ("slippage", "5Lurd9ZFKC3kRt3NvCCecdZNinzyyfMpwpbGzZeAXgwXdQnXy9MdLTYsUUrfxLgSenbvSyx9maPrMRUCS1ArUFau",
     "Jupiter SOL->token swap at 5% slippage: output fell below the minimum",
     {"error_name": "SlippageToleranceExceeded"}),
    ("slippage", "3uECyVRRnszyFG9R7BMszKn43zn4EncmSYBjVeazowzBq7Tbtys3dnBbMPBQSuDa1vR3cbdXTM7hT6VLJnVpUJKn",
     "Meteora DAMM v2 exact-out swap: exceeded slippage (ExceededSlippage)", {}),
    ("slippage", "5miXGUwa2w8Agg89uKcz55X6pDCn1Ave6S2CM8vcjeCxpyPmqWatgEg2CLwx93Uhttga7rAg7QQ7EFMhZQ35j3Xi",
     "pump.fun buy: needed more SOL than the max allowed (TooMuchSolRequired)", {}),
    ("slippage", "3cjgX3YJQSrnmsa71ydLKTnaTgerCHYX86fvdfkMyrX5xhQ1uxkBE4wmHEhkgAq5puSBEHeLbK55gYUkoBWWm6Z",
     "pump.fun sell: would receive less SOL than the minimum (TooLittleSolReceived)", {}),
    ("slippage", "2KhUjNQsVikHC6JnpigNW4fhspGJYPM7SsgutEXjR6mj8ufLgSdVwA9KZEeMjCdhxGcMMMJG91rUyYM9h32c94zX",
     "Raydium AMM v4: exceeded desired slippage limit (error 30, non-Anchor)", {}),
    ("slippage", "65oXZrLfUpLFrUQky2LUtLAwMqwTAm2GzhttJ7yZhtCYMxqcMceGnMybBJfg3wWKFvpVq715cLuj2hPkPwVG4eLV",
     "PumpSwap AMM buy: tokens out below minimum (BuySlippageBelowMinBaseAmountOut)", {}),
    ("compute_budget", "5qF9ozWpdZoRKwQSxS7GZqn55RiXCtAGRabjZRArXf1TcHKcDwdRUDkaLjzRyR4DgmyJHPgLqEsKpMZ9xR9gLvMb",
     "Jupiter route ran out of compute units: CU limit too low", {"notes": BOT_NOTE}),
    ("compute_budget", "5UkNUm3ped8u1zGMRLEkFn95owU2gPpXttAPEUqGpXA87Qd74Fg5vg5kFSMrWdvvE2PHRzAo5Xjcutp6NWM2di2Z",
     "Jupiter route ran out of compute units (exceeded CUs meter): CU limit too low", {"notes": BOT_NOTE}),
    ("compute_budget", "4oUrVZD2wxgWLsSrfPXqZcdLDGDy5QgdLiqGwmtxJ16wb834TfYiWmKEByyRiEDmMLtfJDmutdZpQFWCgJwhMGSV",
     "pump.fun trade via a trading router ran out of compute units: CU limit too low", {}),
    ("insufficient_funds", "63McbkapdrYPMiYAZJGNCQBL9boY3Fj6winhgchdfiWAiAeY1CRE3XyYEMxXgY3t3W3NRfyUyJwRkU7k5YYdbXvX",
     "Not enough SOL: System transfer needed 987653 lamports, had 914528", {}),
    ("insufficient_funds", "2LwJPE79KPLo1S1BjVX4DkKwECK2s3VSqpJfdgPp5n2Pn6AgcxBjNAmLPW3gHrDF9FwJPLo768BMZwWtfqUUmxXA",
     "Not enough SOL: System transfer needed 10000000 lamports, had 7361293", {}),
    ("insufficient_funds", "4cLUZ92T4dBLJvn2WQBzBUZSjcCjfhmN1jogZs2uStvThM3AK68ddJKyhfRJ419eCftjeWLvrbVCCT3y4BHqcDuJ",
     "Token balance too low for the transfer (SPL Token insufficient funds), inside PumpSwap", {}),
    ("insufficient_funds", "5hvvqJkgMttv52WcqFBJeTT5ttnXmcHXF5ueBzbzyQgzvnKMuz8E6zDThjU2S9jnfReRhSQTESb35dpkkQ2aVhPT",
     "Token balance too low for the transfer (SPL Token-2022 insufficient funds), inside Meteora DBC", {}),
    ("insufficient_funds", "2UzDxGPfV7Jrzmn5o1kjzGdzehr48SDGK7tq8MQTiWE7dmAgShs3VT8M79HL69D38nnqR3fNtEX2i1Bij6zm8J58",
     "Swap succeeded, then a follow-up USDC transfer of 0.359806 needed more than the account held", {}),
    ("account_not_found", "42QVgUmfgKnk7okvry3EjE9YGMT9imMAGckV8ZyMVJqRWbz9kTWQwjXnv4RVBEQtFm1FcT5HP6VNUXMeKdxsD9CC",
     "pump.fun sell: user's token account doesn't exist (AccountNotInitialized: associated_user)", {}),
    ("account_not_found", "3D4YLMZbmGqAjXaQeinspoL6zBcvcsaPyFHbzhYJ9Bnb15UGPhUhZCkWnntZYNhJe7Sz5coe11ELkTd6FZRmm6fT",
     "pump.fun sell: user's token account doesn't exist (AccountNotInitialized: associated_user)", {}),
    ("account_not_found", "qpqJQ3t46W7xAtH93JfUGWtC1d1NLdd2QLKrUofHMhL2ZBrn66HokvaUuX4QD7DnHsyVChfDnD6tnUTjxH1kZ19",
     "Raydium CLMM decrease liquidity: recipient token account not created (AccountNotInitialized)", {}),
    ("unknown_custom", "3jsRdF66upuwiqtngwzXe7maKBF1jsU3N1Vm2huUEtvRyCFcJ62firMQx5BsPvWZ39TDnjqQMdXBRUQ9zGGfQoXq",
     "unknown: custom error 1004 from an unrecognised program", {"notes": "Bot program; tests the no-guess path."}),
    ("unknown_custom", "4pa4Ph3HE8wV4SFc49jVfMg4da2as55U1i3RNdMiwqUhanB3zn8n8ZU7Ux8SvsTTg1yjF4cGUbY7fBL9Pq5c3MUN",
     "unknown: custom error 43008 from an unrecognised program", {"notes": "Bot program; tests the no-guess path."}),
    ("unknown_custom", "3yvNmMPZnygkLGpnfxpbq2PatpLAqVK3A5tLy61yjDwnAjxUQ2MRB5XAAK225e7ob61SNFdSyqymcRS1Goobf6Lp",
     "unknown: custom error 0 from an unrecognised program", {}),
    ("never_landed", "BQDrJ9jGfbFNCkwmdqPtwsf8SNXQtgkZtE4pFMeTYaJcpWZVjtLjHHau4RFJxNBumjNjeCa7UKBLQMms2DuQJx8",
     "never reached the chain: no funds moved, no fee charged; cause not provable", {"notes": SYNTHETIC_NOTE}),
    ("never_landed", "4Q3QXkEmnmLgdnFvy2g6UjxutqtY9PxqVZS6y9FLnqeGuKc95WtgSBoCWL89sn75ZCy2aPQ9iHrw6C4aYVLF8vaY",
     "never reached the chain: no funds moved, no fee charged; cause not provable", {"notes": SYNTHETIC_NOTE}),
    ("succeeded", "37As5ht6VACGBy5xeBcohY8Wh5FtxDfxNBHNCAzdeUZVPqUXo1525vdb96LQSfpth6wKy6t9qhE9urLB5GkkGbtJ",
     "succeeded: Jupiter SOL->token swap; must not be described as failed", {}),
    ("succeeded", "4rR4ovK6U39sE16oFNwTgLEENPo2YdSosm2ZiiHvkQdK8qEpr7k5HCkdi8qHQPagTN5hPxBbHUuRdbWKeE8wt7Wd",
     "succeeded: Jupiter USDC->token swap; must not be described as failed", {}),
]

EVIDENCE_KEYS = ("Error Code:", "AMM error:", "insufficient", "Computational budget exceeded", "exceeded CUs meter")


def evidence_for(category: str, tx: dict | None, extra: dict) -> dict:
    if category == "never_landed":
        return {"kind": "rpc", "detail": "getTransaction returned null"}
    if category == "succeeded":
        return {"kind": "meta", "detail": "meta.err is null; balances changed"}
    logs = tx["meta"]["logMessages"]
    hit = next(((i, l) for i, l in enumerate(logs) if any(k in l for k in EVIDENCE_KEYS)), None)
    if hit:
        return {"kind": "log", "source": f"logs[{hit[0]}]", "detail": hit[1][:300]}
    if extra.get("error_name") == "SlippageToleranceExceeded":
        return {"kind": "reference", "detail": JUP_IDL_REF}
    return {"kind": "absence", "detail": "No error text in logs; program has no on-chain IDL and no public "
                                         "error table (checked 2026-09-28)."}


def main() -> None:
    fixtures = EVAL / "fixtures"
    fixtures.mkdir(exist_ok=True)
    keep = set()
    out = []
    for n, (category, sig, cause, extra) in enumerate(CASES, 1):
        tx = fetch_transaction(sig, use_cache=True) if category != "never_landed" else None
        (fixtures / f"{sig}.json").write_text(json.dumps(tx))
        keep.add(f"{sig}.json")
        f = extract_facts(sig, tx)
        fl = f.get("failure") or {}
        names = [a["name"] for a in f.get("anchor_errors", []) if a["program"] == fl.get("program")]
        out.append({
            "id": f"case{n:02d}", "category": category, "signature": sig, "label_status": "verified",
            "expected": {
                "found": f["found"], "succeeded": f.get("succeeded"),
                "failing_program": fl.get("program"),
                "error_kind": (f.get("error") or {}).get("kind"),
                "custom_code": fl.get("custom_code"),
                "error_name": extra.get("error_name") or (names[-1] if names else None),
                "funds_moved_beyond_fee": f.get("funds_moved_beyond_fee", False),
                "cause": cause,
            },
            "evidence": evidence_for(category, tx, extra),
            **({"notes": extra["notes"]} if "notes" in extra else {}),
        })
    for stale in fixtures.glob("*.json"):
        if stale.name not in keep:
            stale.unlink()
    (EVAL / "cases.json").write_text(json.dumps(out, indent=2) + "\n")
    print(f"wrote {len(out)} cases")


if __name__ == "__main__":
    main()
