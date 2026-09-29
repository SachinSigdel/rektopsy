"""signature -> autopsy. The single entry point for the CLI, API and eval."""

import re
import time

from .decode import program_name
from .explain import explain
from .fetch import fetch_transaction
from .fixes import diagnose
from .parse import INVOKE_RE, extract_facts

LOG_REF_RE = re.compile(r"logs\[(\d+)\]")

# Plain names for common setup steps; anything else is "<program> called".
STEP_NAMES = {
    ("Compute Budget", None): "Compute budget set",
    ("Associated Token Account", "create"): "Token account created",
    ("Associated Token Account", "createIdempotent"): "Token account created (if missing)",
    ("System Program", "transfer"): "SOL transferred",
    ("System Program", "createAccount"): "Account created",
    ("SPL Token", "syncNative"): "Wrapped SOL synced",
    ("SPL Token", "closeAccount"): "Token account closed",
    ("SPL Token", "transfer"): "Tokens transferred",
    ("SPL Token", "transferChecked"): "Tokens transferred",
    ("SPL Token-2022", "transferChecked"): "Tokens transferred",
}


def tx_summary(facts: dict) -> dict | None:
    """Report-page facts: steps, vitals, full logs. Deterministic, no LLM; None if never landed."""
    if not facts.get("found"):
        return None
    failure = facts.get("failure") or {}
    failed_ix = failure.get("top_level_instruction_index")
    if failed_ix is None and facts.get("error"):
        failed_ix = facts["error"].get("instruction_index")
    steps = []
    for ix in facts["instructions"]:
        name = program_name(ix["program"])
        label = STEP_NAMES.get((name, ix["parsed_type"])) or f"{name or ix['program'][:6] + '…'} called"
        if facts["succeeded"] or failed_ix is None or ix["index"] < failed_ix:
            status = "ok"
        elif ix["index"] == failed_ix:
            status = "failed"
        else:
            status = "not_run"
        steps.append({"index": ix["index"], "label": label, "program": ix["program"], "program_name": name,
                      "status": status, "source": f"transaction.message.instructions[{ix['index']}]"})
    logs = facts.get("logs") or []
    touched = {m.group(1) for line in logs if (m := INVOKE_RE.match(line))}
    limit = (facts["compute"].get("unit_limit") or {}).get("value")
    return {
        "slot": facts["slot"],
        "block_time": facts["block_time"],
        "failed_instruction": failed_ix if not facts["succeeded"] else None,
        "failure_log": int(failure["source"][5:-1]) if failure.get("source", "").startswith("logs[") else None,
        "steps": steps,
        "compute_consumed": facts["compute"]["consumed"],
        "compute_limit": limit,
        "programs_touched": len(touched),
        "logs": logs,
        "logs_truncated": facts.get("logs_truncated", False),
    }


def autopsy(signature: str, tx: dict | None = None, fetched: bool = False,
            use_llm: bool = True, use_cache: bool = True) -> dict:
    """Pass `tx` with fetched=True to skip the RPC (eval fixtures)."""
    started = time.perf_counter()
    if not fetched:
        tx = fetch_transaction(signature, use_cache=use_cache)
    facts = extract_facts(signature, tx)
    brief = diagnose(facts, tx)
    result = explain(brief, use_llm=use_llm)
    result["meta"]["latency_ms"] = round((time.perf_counter() - started) * 1000)
    # Quote the log lines the evidence points at, so readers needn't look them up.
    logs = facts.get("logs") or []
    refs = {int(m) for e in result["evidence"] for m in LOG_REF_RE.findall(e["source"])}
    log_lines = {str(i): logs[i] for i in sorted(refs) if i < len(logs)}
    return {"signature": signature, "category": brief["category"], **result, "log_lines": log_lines,
            "tx": tx_summary(facts), "brief": brief}
