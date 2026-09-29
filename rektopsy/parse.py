"""Deterministic fact extraction from a getTransaction result.

Every fact carries a `source`: either a log line (`logs[i]`) or a meta/message
field path, so each later claim can be traced back to the chain.
Nothing here interprets or guesses: error *names* are resolved in decode.py.
"""

import base64
import binascii
import re
import struct
from decimal import Decimal

COMPUTE_BUDGET_PROGRAM = "ComputeBudget111111111111111111111111111111"
RAYDIUM_AMM_V4 = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"
# Raydium AMM v4 `ray_log:` lines are base64(bincode(struct)), logged before the
# slippage check. Layout from raydium-amm program/src/log.rs: u8 log_type, 7 x u64.
RAY_LOG_FIELDS = {
    3: ("amount_in", "minimum_out", "direction", "user_source", "pool_coin", "pool_pc", "out_amount"),  # SwapBaseIn
    4: ("max_in", "amount_out", "direction", "user_source", "pool_coin", "pool_pc", "deduct_in"),  # SwapBaseOut
}

INVOKE_RE = re.compile(r"^Program (\w+) invoke \[(\d+)\]$")
SUCCESS_RE = re.compile(r"^Program (\w+) success$")
FAILED_RE = re.compile(r"^Program (\w+) failed: (.*)$")
CONSUMED_RE = re.compile(r"^Program (\w+) consumed (\d+) of (\d+) compute units$")
LOG_RE = re.compile(r"^Program log: (.*)$")
CUSTOM_ERR_RE = re.compile(r"custom program error: (0x[0-9a-fA-F]+)")
ANCHOR_ERR_RE = re.compile(
    r"AnchorError (?:thrown in (?P<file>\S+):(?P<line>\d+)|caused by account: (?P<account>\w+)|occurred)\. "
    r"Error Code: (?P<name>\w+)\. Error Number: (?P<number>\d+)\. Error Message: (?P<message>.*?)\.?$"
)
# "key: 123" / "key = 123" pairs inside program logs. Digits embedded in base58
# addresses are not matched because \b never sits between two word characters.
KV_RE = re.compile(r"([A-Za-z_][A-Za-z0-9_ ]{0,40}?)\s*[:=]\s*\[?(-?\d+(?:\.\d+)?)\b")
NUM_RE = re.compile(r"(?<![\w.])-?\d+(?:\.\d+)?(?![\w.])")

B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def b58decode(s: str) -> bytes:
    n = 0
    for ch in s:
        n = n * 58 + B58_ALPHABET.index(ch)
    raw = n.to_bytes((n.bit_length() + 7) // 8, "big") if n else b""
    pad = len(s) - len(s.lstrip("1"))
    return b"\x00" * pad + raw


def _ui(raw: int, decimals: int) -> str:
    return format(Decimal(raw).scaleb(-decimals).normalize(), "f")


def _account_keys(tx: dict) -> list[str]:
    return [k["pubkey"] if isinstance(k, dict) else k for k in tx["transaction"]["message"]["accountKeys"]]


def parse_compute_budget(tx: dict) -> dict:
    """Read SetComputeUnitLimit / SetComputeUnitPrice from top-level instructions."""
    out = {"unit_limit": None, "unit_price_micro_lamports": None}
    for i, ix in enumerate(tx["transaction"]["message"]["instructions"]):
        if ix.get("programId") != COMPUTE_BUDGET_PROGRAM or "data" not in ix:
            continue
        data = b58decode(ix["data"])
        if not data:
            continue
        tag, body = data[0], data[1:]
        src = f"transaction.message.instructions[{i}]"
        if tag == 2 and len(body) >= 4:
            out["unit_limit"] = {"value": int.from_bytes(body[:4], "little"), "source": src}
        elif tag == 3 and len(body) >= 8:
            out["unit_price_micro_lamports"] = {"value": int.from_bytes(body[:8], "little"), "source": src}
    return out


def _ray_log_numbers(b64: str, program: str, source: str) -> list[dict]:
    """Decode a Raydium AMM v4 swap log into keyed numbers ("ray_log.<field>")."""
    try:
        raw = base64.b64decode(b64, validate=True)
    except binascii.Error:
        return []
    if len(raw) != 57 or raw[0] not in RAY_LOG_FIELDS:
        return []
    values = struct.unpack("<7Q", raw[1:])
    return [{"key": f"ray_log.{name}", "value": str(v), "program": program, "source": source}
            for name, v in zip(RAY_LOG_FIELDS[raw[0]], values)]


def parse_logs(logs: list[str], instructions: list[dict]) -> dict:
    """Walk the invoke/success/failed stack to find which program actually failed."""
    stack: list[tuple[str, int]] = []
    top_level_index = -1
    failure = None
    consumed = []
    numbers = []
    anchor_errors = []
    truncated = False

    for i, line in enumerate(logs):
        if line.strip() == "Log truncated":
            truncated = True
            continue
        if m := INVOKE_RE.match(line):
            depth = int(m.group(2))
            if depth == 1:
                top_level_index += 1
            stack.append((m.group(1), top_level_index))
            continue
        if m := SUCCESS_RE.match(line):
            if stack:
                stack.pop()
            continue
        if m := FAILED_RE.match(line):
            program, message = m.group(1), m.group(2)
            depth = len(stack)
            ix_index = stack[-1][1] if stack else None
            if failure is None:  # first failure is the root cause; outer frames re-log it
                custom = CUSTOM_ERR_RE.search(message)
                failure = {
                    "program": program,
                    "depth": depth,
                    "is_cpi": depth > 1,
                    "top_level_instruction_index": ix_index,
                    "message": message,
                    "custom_code": int(custom.group(1), 16) if custom else None,
                    "custom_code_hex": custom.group(1) if custom else None,
                    "source": f"logs[{i}]",
                }
            if stack:
                stack.pop()
            continue
        if m := CONSUMED_RE.match(line):
            consumed.append({
                "program": m.group(1),
                "consumed": int(m.group(2)),
                "available": int(m.group(3)),
                "depth": len(stack),
                "source": f"logs[{i}]",
            })
            continue
        if m := LOG_RE.match(line):
            text = m.group(1)
            program = stack[-1][0] if stack else None
            if text.startswith("ray_log: ") and program == RAYDIUM_AMM_V4:
                numbers.extend(_ray_log_numbers(text[len("ray_log: "):], program, f"logs[{i}]"))
                continue
            if am := ANCHOR_ERR_RE.search(text):
                anchor_errors.append({
                    "program": stack[-1][0] if stack else None,
                    "name": am.group("name"),
                    "number": int(am.group("number")),
                    "message": am.group("message"),
                    "account": am.group("account"),
                    "source": f"logs[{i}]",
                })
                continue
            seen_spans = []
            for kv in KV_RE.finditer(text):
                numbers.append({
                    "key": kv.group(1).strip(),
                    "value": kv.group(2),
                    "program": stack[-1][0] if stack else None,
                    "source": f"logs[{i}]",
                })
                seen_spans.append(kv.span(2))
            for nm in NUM_RE.finditer(text):
                if any(a <= nm.start() < b for a, b in seen_spans):
                    continue
                numbers.append({
                    "key": None,
                    "value": nm.group(0),
                    "program": stack[-1][0] if stack else None,
                    "source": f"logs[{i}]",
                })

    top_level_programs = [ix.get("programId") for ix in instructions]
    if failure and failure["top_level_instruction_index"] is not None:
        idx = failure["top_level_instruction_index"]
        failure["top_level_program"] = top_level_programs[idx] if idx < len(top_level_programs) else None

    return {
        "failure": failure,
        "anchor_errors": anchor_errors,
        "compute_by_program": consumed,
        "log_numbers": numbers,
        "logs_truncated": truncated,
    }


def parse_error(err) -> dict | None:
    """Normalise meta.err into {scope, instruction_index, kind, code, detail}."""
    if err is None:
        return None
    out = {"raw": err, "scope": "transaction", "instruction_index": None,
           "kind": None, "custom_code": None, "detail": None, "source": "meta.err"}
    if isinstance(err, dict) and "InstructionError" in err:
        idx, inner = err["InstructionError"]
        out["scope"] = "instruction"
        out["instruction_index"] = idx
        err = inner
    if isinstance(err, str):
        out["kind"] = err
    elif isinstance(err, dict):
        (kind, detail), = err.items()
        out["kind"] = kind
        if kind == "Custom":
            out["custom_code"] = detail
        else:
            out["detail"] = detail
    return out


def balance_changes(tx: dict) -> dict:
    meta = tx["meta"]
    keys = _account_keys(tx)
    fee = meta["fee"]

    sol = []
    for i, (pre, post) in enumerate(zip(meta["preBalances"], meta["postBalances"])):
        if pre != post:
            sol.append({
                "account": keys[i],
                "is_fee_payer": i == 0,
                "pre_lamports": pre,
                "post_lamports": post,
                "delta_lamports": post - pre,
                "delta_sol": _ui(post - pre, 9),
                "source": f"meta.preBalances[{i}] / meta.postBalances[{i}]",
            })

    def index(balances):
        return {b["accountIndex"]: b for b in balances or []}

    pre_tok, post_tok = index(meta.get("preTokenBalances")), index(meta.get("postTokenBalances"))
    tokens = []
    for acct in sorted(set(pre_tok) | set(post_tok)):
        pre, post = pre_tok.get(acct), post_tok.get(acct)
        ref = pre or post
        decimals = ref["uiTokenAmount"]["decimals"]
        pre_raw = int(pre["uiTokenAmount"]["amount"]) if pre else 0
        post_raw = int(post["uiTokenAmount"]["amount"]) if post else 0
        if pre_raw == post_raw and pre and post:
            continue
        tokens.append({
            "token_account": keys[acct],
            "owner": ref.get("owner"),
            "mint": ref["mint"],
            "decimals": decimals,
            "pre_raw": pre_raw,
            "post_raw": post_raw,
            "delta_raw": post_raw - pre_raw,
            "delta_ui": _ui(post_raw - pre_raw, decimals),
            "source": f"meta.preTokenBalances / meta.postTokenBalances (accountIndex {acct})",
        })

    # Beyond the fee payer paying exactly the fee, did anything move?
    other_sol = [c for c in sol if not (c["is_fee_payer"] and c["delta_lamports"] == -fee)]
    return {
        "sol_changes": sol,
        "token_changes": tokens,
        "funds_moved_beyond_fee": bool(other_sol or tokens),
    }


def extract_facts(signature: str, tx: dict | None) -> dict:
    if tx is None:
        return {
            "signature": signature,
            "found": False,
            "note": "RPC returned no transaction: it never landed on chain, or history for it is unavailable.",
        }

    meta = tx["meta"]
    instructions = tx["transaction"]["message"]["instructions"]
    keys = _account_keys(tx)
    logs = meta.get("logMessages") or []
    fee = meta["fee"]
    budget = parse_compute_budget(tx)

    priority_fee = None
    if budget["unit_limit"] and budget["unit_price_micro_lamports"]:
        lamports = -(-budget["unit_limit"]["value"] * budget["unit_price_micro_lamports"]["value"] // 1_000_000)
        priority_fee = {"max_lamports": lamports, "source": "ceil(unit_limit × unit_price / 1e6)"}

    return {
        "signature": signature,
        "found": True,
        "succeeded": meta["err"] is None,
        "slot": tx["slot"],
        "block_time": tx.get("blockTime"),
        "fee_payer": keys[0],
        "fee": {"lamports": fee, "sol": _ui(fee, 9), "source": "meta.fee"},
        "compute": {
            "consumed": meta.get("computeUnitsConsumed"),
            "consumed_source": "meta.computeUnitsConsumed",
            "unit_limit": budget["unit_limit"],
            "unit_price_micro_lamports": budget["unit_price_micro_lamports"],
            "priority_fee": priority_fee,
        },
        "instructions": [
            {"index": i, "program": ix.get("programId"),
             "parsed_type": ix["parsed"].get("type") if isinstance(ix.get("parsed"), dict) else None}
            for i, ix in enumerate(instructions)
        ],
        "error": parse_error(meta["err"]),
        **parse_logs(logs, instructions),
        **balance_changes(tx),
        "logs": logs,
    }
