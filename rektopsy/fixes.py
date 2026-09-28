"""Classify the failure and compute the fix. Every number here comes from the
facts or from a fixed, documented rule, never from the LLM.

`diagnose()` returns the brief that explain.py narrates: category, cause,
fix (with values), funds status and evidence, each claim with its source.
"""

import re
from decimal import ROUND_HALF_UP, Decimal

from .decode import TOKEN, TOKEN_2022, jupiter_swap_args, program_name, resolve_error

ATA_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
MAX_CU_LIMIT = 1_400_000
CU_HEADROOM = Decimal("1.5")  # the tx stopped early, so real need is > consumed
LAMPORTS_PER_SOL = 10**9

SLIPPAGE_NAMES = {"SlippageToleranceExceeded", "ExceededSlippage", "TooMuchSolRequired", "TooLittleSolReceived",
                  "PumpCpiSlippage", "SlippageLimitExceeded"}
# Anchor require_gte!(left, right) fails when left < right, so for these errors:
MIN_OUT_ERRORS = {"TooLittleSolReceived", "BuySlippageBelowMinBaseAmountOut", "BuySlippageBelowMinTokensOut",
                  "SellSlippageBelowMinQuoteAmountOut"}  # left = would receive, right = user's minimum
MAX_IN_ERRORS = {"TooMuchSolRequired", "ExceededSlippageMaxQuoteAmountIn"}  # left = user's maximum, right = needed
COMPUTE_KINDS = {"ComputationalBudgetExceeded", "ProgramFailedToComplete"}
LAMPORTS_RE = re.compile(r"insufficient lamports (\d+), need (\d+)")


def _fmt(d: Decimal, places: int = 2) -> str:
    q = d.quantize(Decimal(1).scaleb(-places), rounding=ROUND_HALF_UP)
    return format(q.normalize(), "f")


def _sol(lamports: int) -> str:
    return format(Decimal(lamports).scaleb(-9).normalize(), "f")


def _ui(raw: int, decimals: int) -> str:
    return format(Decimal(raw).scaleb(-decimals).normalize(), "f")


def categorize(facts: dict, err: dict | None) -> str:
    if not facts["found"]:
        return "never_landed"
    if facts["succeeded"]:
        return "succeeded"
    name = (err or {}).get("name") or ""
    kind = (facts.get("error") or {}).get("kind")
    msg = (facts.get("failure") or {}).get("message", "")
    if kind in COMPUTE_KINDS or "exceeded CUs meter" in msg:
        return "compute_budget"
    if name in SLIPPAGE_NAMES or name in MIN_OUT_ERRORS or name in MAX_IN_ERRORS or "Slippage" in name:
        return "slippage"
    if name in ("InsufficientFunds", "ResultWithNegativeLamports") or kind in ("InsufficientFunds",
                                                                                "InsufficientFundsForRent"):
        return "insufficient_funds"
    if name in ("AccountNotInitialized", "AccountNotFound") or kind == "AccountNotFound":
        return "account_not_found"
    if (err or {}).get("resolved_by") == "unknown":
        return "unknown_custom"
    return "other"


def _left_right(facts: dict) -> tuple[dict, dict] | None:
    nums = [n for n in facts["log_numbers"] if n["key"] in ("Left", "Right")]
    left = next((n for n in reversed(nums) if n["key"] == "Left"), None)
    right = next((n for n in reversed(nums) if n["key"] == "Right"), None)
    return (left, right) if left and right else None


def _pct(part: int, whole: int) -> str:
    return _fmt(Decimal(part) * 100 / Decimal(whole))


def _slippage_fix(facts: dict, err: dict, tx: dict) -> dict:
    name = err.get("name")
    lr = _left_right(facts)
    if lr and name in MIN_OUT_ERRORS:
        left, right = lr
        actual, minimum = int(left["value"]), int(right["value"])
        gap = minimum - actual
        return {
            "action": "retry with a fresh quote, or lower the minimum you accept",
            "values": {"would_receive_raw": actual, "your_minimum_raw": minimum, "shortfall_raw": gap,
                       "shortfall_pct_of_minimum": _pct(gap, minimum),
                       **({"would_receive_sol": _sol(actual), "your_minimum_sol": _sol(minimum),
                           "shortfall_sol": _sol(gap)} if "Sol" in name else {})},
            "rule": "minimum must be at most what the trade would give",
            "sources": [left["source"], right["source"]],
        }
    if lr and name in MAX_IN_ERRORS:
        left, right = lr
        maximum, needed = int(left["value"]), int(right["value"])
        gap = needed - maximum
        return {
            "action": "retry with a fresh quote, or raise the maximum you are willing to pay",
            "values": {"your_maximum_raw": maximum, "needed_raw": needed, "over_by_raw": gap,
                       "over_by_pct_of_maximum": _pct(gap, maximum),
                       **({"your_maximum_sol": _sol(maximum), "needed_sol": _sol(needed),
                           "over_by_sol": _sol(gap)} if "Sol" in name else {})},
            "rule": "maximum must be at least what the trade needs",
            "sources": [left["source"], right["source"]],
        }
    for i, ix in enumerate(tx["transaction"]["message"]["instructions"]):
        args = jupiter_swap_args(ix)
        if not args:
            continue
        bps = args["slippage_bps"]
        quoted = args.get("quoted_out_amount")
        suggested = min(max(bps * 2, 50), 300)
        values = {"slippage_bps": bps, "slippage_pct": _fmt(Decimal(bps) / 100),
                  "suggested_slippage_bps": suggested, "suggested_slippage_pct": _fmt(Decimal(suggested) / 100)}
        if quoted is not None:
            values["quoted_out_raw"] = quoted
            values["minimum_out_raw"] = quoted * (10_000 - bps) // 10_000
        return {
            "action": "get a fresh quote and retry; if it keeps failing, raise slippage to the suggested value",
            "values": values,
            "rule": "suggested = min(max(2 x current, 50 bps), 300 bps); suggested, not simulated",
            "sources": [f"transaction.message.instructions[{i}].data (Jupiter IDL)"],
        }
    return {"action": "get a fresh quote and retry; if it keeps failing, raise your slippage setting",
            "values": {}, "rule": "no amounts logged", "sources": []}


def _compute_fix(facts: dict) -> dict:
    c = facts["compute"]
    consumed = c["consumed"]
    new_limit = min(MAX_CU_LIMIT, int(-(-(Decimal(consumed) * CU_HEADROOM) // 1000) * 1000))
    values = {"consumed_cu": consumed, "new_cu_limit": new_limit}
    if c["unit_limit"]:
        values["current_cu_limit"] = c["unit_limit"]["value"]
    price = c["unit_price_micro_lamports"]
    if price:
        max_fee = -(-new_limit * price["value"] // 1_000_000)
        values |= {"unit_price_micro_lamports": price["value"], "new_max_priority_fee_lamports": max_fee,
                   "new_max_priority_fee_sol": _sol(max_fee)}
    return {
        "action": "raise the compute unit limit (SetComputeUnitLimit) and resend",
        "values": values,
        "rule": f"new limit = consumed x {CU_HEADROOM}, rounded up to 1000, capped at {MAX_CU_LIMIT}",
        "sources": [c["consumed_source"]] + ([c["unit_limit"]["source"]] if c["unit_limit"] else []),
    }


def _is_transfer(ix: dict) -> bool:
    return (ix.get("programId") in (TOKEN, TOKEN_2022) and isinstance(ix.get("parsed"), dict)
            and ix["parsed"]["type"] in ("transfer", "transferChecked"))


def _failed_transfer(tx: dict, facts: dict) -> tuple[dict, str] | None:
    """The token transfer the failing Token program call was executing, and where it is."""
    failure = facts.get("failure") or {}
    idx = failure.get("top_level_instruction_index")
    if idx is None:
        return None
    top = tx["transaction"]["message"]["instructions"][idx]
    if failure.get("depth") == 1 and _is_transfer(top):
        return top, f"transaction.message.instructions[{idx}]"
    inner = [i for g in tx["meta"].get("innerInstructions") or [] if g["index"] == idx
             for i in g["instructions"] if _is_transfer(i)]
    return (inner[-1], f"meta.innerInstructions (instruction {idx})") if inner else None


def _insufficient_fix(facts: dict, err: dict, tx: dict) -> dict:
    msg = err.get("message") or ""
    if m := LAMPORTS_RE.search(msg):
        have, need = int(m.group(1)), int(m.group(2))
        return {
            "action": "add SOL to the wallet and resend",
            "values": {"have_lamports": have, "need_lamports": need, "short_lamports": need - have,
                       "have_sol": _sol(have), "need_sol": _sol(need), "short_sol": _sol(need - have)},
            "rule": "shortfall = need - have, from the System Program's own log",
            "sources": [err["source"]],
        }
    found = _failed_transfer(tx, facts)
    if not found:
        return {"action": "the account does not hold enough to cover this transfer; lower the amount or top up",
                "values": {}, "rule": "amounts not recoverable from this tx", "sources": [err.get("source")]}
    t, where = found
    info = t["parsed"]["info"]
    amount = int(info.get("tokenAmount", {}).get("amount") or info.get("amount"))
    keys = [k["pubkey"] if isinstance(k, dict) else k for k in tx["transaction"]["message"]["accountKeys"]]
    pre = {keys[b["accountIndex"]]: b for b in tx["meta"].get("preTokenBalances") or []}
    b = pre.get(info["source"])
    dec = int(info.get("tokenAmount", {}).get("decimals") or (b and b["uiTokenAmount"]["decimals"]) or 0)
    mint = info.get("mint") or (b and b["mint"])
    values = {"mint": mint, "need_raw": amount, "need": _ui(amount, dec)}
    # The starting balance is only the balance at transfer time if nothing earlier in
    # this tx moved tokens in or out of the source. Creating an associated token
    # account doesn't change the balance of one that already existed.
    earlier = [i for g in tx["meta"].get("innerInstructions") or [] for i in g["instructions"]
               if i is not t and isinstance(i.get("parsed"), dict)
               and info["source"] in (i["parsed"].get("info", {}).get("source"),
                                      i["parsed"].get("info", {}).get("destination"),
                                      i["parsed"].get("info", {}).get("account"))]
    earlier += [i for i in tx["transaction"]["message"]["instructions"]
                if i is not t and isinstance(i.get("parsed"), dict) and i.get("programId") != ATA_PROGRAM
                and info["source"] in (i["parsed"].get("info", {}).get("account"),
                                       i["parsed"].get("info", {}).get("destination"))]
    if b and not earlier:
        have = int(b["uiTokenAmount"]["amount"])
        values |= {"have_raw": have, "short_raw": amount - have,
                   "have": _ui(have, dec), "short": _ui(amount - have, dec)}
        rule = "need = failed transfer amount; have = source balance at start of tx"
    else:
        rule = ("need = failed transfer amount; the source balance changed earlier in this tx, "
                "so the exact shortfall isn't provable")
    return {
        "action": "the account didn't hold enough of this token for the transfer; lower the amount or top up",
        "values": values, "rule": rule,
        "sources": [where, "meta.preTokenBalances"],
    }


def diagnose(facts: dict, tx: dict | None, use_network: bool = True) -> dict:
    err = resolve_error(facts, use_network) if facts["found"] else None
    category = categorize(facts, err)
    brief = {"signature": facts["signature"], "category": category}

    if category == "never_landed":
        brief |= {
            "cause": {"summary": "the transaction never reached the chain", "source": "getTransaction returned null"},
            "fix": {"action": "resend it with a fresh blockhash (just retry in your wallet or app), "
                              "and check the wallet has enough SOL for the fee",
                    "values": {}, "rule": "no on-chain record, so the exact cause can't be proven", "sources": []},
            "funds": {"safe": True, "fee_charged": False,
                      "summary": "nothing happened on chain: no funds moved and no fee was charged"},
        }
        return brief

    fee = facts["fee"]
    if category == "succeeded":
        brief |= {"cause": {"summary": "the transaction succeeded; nothing failed", "source": "meta.err is null"},
                  "fix": None,
                  "funds": {"safe": True, "fee_lamports": fee["lamports"], "fee_sol": fee["sol"],
                            "summary": "it ran as intended"}}
        return brief

    failure = facts.get("failure") or {}
    brief["cause"] = {
        "error_name": err.get("name"),
        "error_message": err.get("message"),
        "custom_code": err.get("custom_code"),
        "failing_program": err.get("program"),
        "failing_program_name": err.get("program_name"),
        "called_by_program_name": program_name(failure.get("top_level_program")) if failure.get("is_cpi") else None,
        "account": err.get("account"),
        "resolved_by": err.get("resolved_by"),
        "source": err.get("source") or failure.get("source"),
    }

    if category == "slippage":
        brief["fix"] = _slippage_fix(facts, err, tx)
    elif category == "compute_budget":
        brief["fix"] = _compute_fix(facts)
    elif category == "insufficient_funds":
        brief["fix"] = _insufficient_fix(facts, err, tx)
    elif category == "account_not_found":
        brief["fix"] = {"action": "the account named here doesn't exist yet. For a token account that usually "
                                  "means the wallet doesn't hold that token; create the token account or check "
                                  "you're using the right wallet",
                        "values": {"account_name": err.get("account")}, "rule": "from the program's error log",
                        "sources": [err.get("source")]}
    elif category == "unknown_custom":
        brief["fix"] = {"action": "we can't decode this error, so we won't guess. Ask the app or program's "
                                  "support about the error code below",
                        "values": {"custom_code": err.get("custom_code"), "program": err.get("program")},
                        "rule": "no IDL or known error table for this program", "sources": [failure.get("source")]}
    else:
        brief["fix"] = {"action": "no specific fix known for this error", "values": {}, "rule": "", "sources": []}
    brief["fix"]["simulated"] = False

    brief["funds"] = {
        "safe": not facts["funds_moved_beyond_fee"],
        "fee_lamports": fee["lamports"], "fee_sol": fee["sol"],
        "summary": ("the transaction failed, so every change was rolled back; only the network fee was charged"
                    if not facts["funds_moved_beyond_fee"] else "balances changed beyond the fee; see evidence"),
        "source": "meta.preBalances/postBalances, meta.preTokenBalances/postTokenBalances, meta.fee",
    }
    return brief
