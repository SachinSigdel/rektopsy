"""Find candidate eval cases: recent failed txs touching a program.

Usage: PYTHONPATH=. uv run python eval/discover.py <program_or_address> [--limit N] [--ok]
                                                  [--per N] [--match TEXT]

--match keeps only errors whose text contains TEXT (e.g. ComputationalBudget).

Read-only. Paces requests for the public RPC. Prints one summary line per tx;
labels are drafted by hand from these, then confirmed by the user.
"""

import sys
import time

import httpx

from rektopsy.decode import jupiter_swap_args, jupiter_swap_mints
from rektopsy.fetch import fetch_transaction, rpc_url
from rektopsy.parse import extract_facts


def recent_signatures(address: str, limit: int) -> list[dict]:
    """Newest first, paging past the RPC's 1000-per-call cap."""
    out: list[dict] = []
    while len(out) < limit:
        opts = {"limit": min(1000, limit - len(out)), "commitment": "confirmed"}
        if out:
            opts["before"] = out[-1]["signature"]
        payload = {"jsonrpc": "2.0", "id": 1, "method": "getSignaturesForAddress", "params": [address, opts]}
        for delay in (1, 2, 4, 8, 0):
            resp = httpx.post(rpc_url(), json=payload, timeout=30)
            if resp.status_code != 429:
                break
            time.sleep(delay)
        resp.raise_for_status()
        page = resp.json()["result"]
        if not page:
            break
        out += page
    return out


JUPITER = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"
TOKEN_PROGRAMS = {"TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"}


def is_bot_like(tx: dict) -> bool:
    """Jupiter traffic that doesn't look like a person using a swap UI.

    Bots route a token back to itself (same user account as source and
    destination, or a second swap leg back), use token-ledger routes, or set
    0% slippage to demand break-even. The Jupiter UI/API sends one swap with
    slippage above 0.
    """
    ixs = [ix for ix in tx["transaction"]["message"]["instructions"] if ix.get("programId") == JUPITER]
    for ix in ixs:
        head = [a for a in ix.get("accounts", [])[:6] if a not in TOKEN_PROGRAMS and a != JUPITER]
        if len(head) != len(set(head)):
            return True
    if not ixs:
        return False
    if len(ixs) > 1:
        return True
    args = jupiter_swap_args(ixs[0])
    if args is None:
        return False
    mints = jupiter_swap_mints(tx, ixs[0])
    if mints and mints[0] == mints[1]:
        return True
    if "ledger" in args["instruction"] or args["slippage_bps"] in (0, 10000):
        return True
    return args.get("in_amount") == args.get("quoted_out_amount")


def summarize(sig: str, facts: dict) -> str:
    f = facts.get("failure") or {}
    err = facts.get("error") or {}
    fp_tokens = {t["mint"][:6] for t in facts["token_changes"] if t["owner"] == facts["fee_payer"]}
    progs = sorted({i["program"][:6] for i in facts["instructions"]})
    last_logs = [l for l in facts["logs"] if l.startswith("Program log:")][-2:]
    return (f"{sig}\n   err={err.get('kind')}:{err.get('custom_code')} "
            f"failed={f.get('program', '')[:8]} depth={f.get('depth')} msg={f.get('message', '')[:70]!r}\n"
            f"   anchor={[a['name'] for a in facts['anchor_errors']]} ixs={progs} "
            f"moved={facts['funds_moved_beyond_fee']} fp_mints={fp_tokens} "
            f"cu={facts['compute']['consumed']}/{(facts['compute']['unit_limit'] or {}).get('value')}\n"
            f"   logs={[l[13:100] for l in last_logs]}")


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    limit = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else 200
    want_ok = "--ok" in sys.argv
    sigs = recent_signatures(args[0], limit)
    per_bucket = int(sys.argv[sys.argv.index("--per") + 1]) if "--per" in sys.argv else 2
    match = sys.argv[sys.argv.index("--match") + 1] if "--match" in sys.argv else None
    picked = [s for s in sigs if (s["err"] is None) == want_ok and (not match or match in str(s["err"]))]
    print(f"{len(sigs)} recent, {sum(s['err'] is not None for s in sigs)} failed")
    buckets: dict[str, int] = {}
    skipped = 0
    for s in picked:
        key = str(s["err"])
        if buckets.get(key, 0) >= per_bucket:
            continue
        time.sleep(0.4)
        tx = fetch_transaction(s["signature"])
        if tx is None:
            print(s["signature"], "-> null")
            continue
        if is_bot_like(tx):
            skipped += 1
            continue
        buckets[key] = buckets.get(key, 0) + 1
        print(summarize(s["signature"], extract_facts(s["signature"], tx)), flush=True)
    print(f"skipped {skipped} bot-like txs")


if __name__ == "__main__":
    main()
