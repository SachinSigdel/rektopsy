"""signature -> autopsy. The single entry point for the CLI, API and eval."""

import time

from .explain import explain
from .fetch import fetch_transaction
from .fixes import diagnose
from .parse import extract_facts


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
    return {"signature": signature, "category": brief["category"], **result, "brief": brief}
