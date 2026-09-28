"""Turn a diagnosis brief into plain English.

The LLM only writes sentences from the brief. Its output goes through
verify.py; one retry with feedback, then a deterministic template. Evidence is
assembled here in Python from the brief's sources, never by the LLM.
"""

import json
import os
import time

import httpx
from dotenv import load_dotenv

from .verify import unsupported_numbers

load_dotenv()

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
DEFAULT_MODEL = "llama-3.3-70b-versatile"

SYSTEM_PROMPT = """You explain failed Solana transactions to people who are new to crypto.
You get a JSON brief of facts that were extracted from the chain. Write three short fields:
- "cause": 1-2 sentences, what went wrong, in plain words. Name the app/program if given.
- "fix": 1-2 sentences, exactly what to change, using the brief's fix action and values.
- "funds": 1 sentence, whether their money is safe and what it cost.
Rules:
- Use ONLY numbers that appear in the brief, copied exactly. Never compute, round, convert or estimate.
- If a value is missing, leave it out. Never guess a cause the brief doesn't state.
- If category is "unknown_custom", say the error could not be identified; don't speculate.
- No jargon without a short explanation. No list numbering.
Reply with a JSON object: {"cause": "...", "fix": "...", "funds": "..."}"""


class LLMUnavailable(Exception):
    pass


def complete(messages: list[dict]) -> tuple[str, dict]:
    """The one provider call. Returns (content, usage). Swap this to change providers."""
    key = os.environ.get("GROQ_API_KEY")
    if not key:
        raise LLMUnavailable("GROQ_API_KEY not set")
    body = {"model": os.environ.get("GROQ_MODEL") or DEFAULT_MODEL, "messages": messages,
            "temperature": 0, "response_format": {"type": "json_object"}}
    for delay in (2, 4, 8, 16, 0):
        resp = httpx.post(GROQ_URL, json=body, headers={"Authorization": f"Bearer {key}"}, timeout=60)
        if resp.status_code != 429:
            break
        time.sleep(delay)
    if resp.status_code >= 400:
        raise LLMUnavailable(f"Groq HTTP {resp.status_code}: {resp.text[:200]}")
    data = resp.json()
    return data["choices"][0]["message"]["content"], data.get("usage", {})


def _prose_brief(brief: dict) -> dict:
    """What the LLM sees: the brief minus bookkeeping (sources, rules)."""
    def strip(v):
        if isinstance(v, dict):
            return {k: strip(x) for k, x in v.items() if k not in ("source", "sources", "rule", "resolved_by")}
        return v
    return strip(brief)


def template(brief: dict) -> dict:
    """Deterministic fallback: only fields from the brief, no LLM."""
    cat, cause, fix, funds = brief["category"], brief.get("cause", {}), brief.get("fix") or {}, brief["funds"]
    if cat in ("never_landed", "succeeded"):
        cause_text = cause["summary"].capitalize() + "."
    elif cat == "unknown_custom":
        cause_text = (f"The program {cause['failing_program']} returned error code {cause['custom_code']}, "
                      "which we could not identify.")
    else:
        who = cause.get("failing_program_name") or cause.get("failing_program")
        what = (cause.get("error_message") or cause.get("error_name") or "an error").rstrip(".")
        cause_text = f"{who} stopped the transaction: {what}."
    vals = fix.get("values") or {}
    # Show human units; hide a *_raw value when a SOL/UI twin exists.
    shown = {k: v for k, v in vals.items() if k not in ("mint", "program")
             and not (k.endswith("_raw") and any(t in vals for t in (k[:-4], k[:-4] + "_sol")))}
    values = ", ".join(f"{k.replace('_', ' ')}: {v}" for k, v in shown.items())
    fix_text = (fix["action"][0].upper() + fix["action"][1:] + (f" ({values})." if values else ".")) if fix else ""
    funds_text = funds["summary"][0].upper() + funds["summary"][1:]
    if "fee_sol" in funds and cat != "succeeded":
        funds_text += f" (fee: {funds['fee_sol']} SOL)."
    else:
        funds_text += "."
    return {"cause": cause_text, "fix": fix_text, "funds": funds_text}


def evidence(brief: dict) -> list[dict]:
    out = []
    cause, fix, funds = brief.get("cause") or {}, brief.get("fix") or {}, brief.get("funds") or {}
    if cause.get("source"):
        out.append({"claim": "cause", "source": cause["source"]})
    for s in fix.get("sources") or []:
        if s:
            out.append({"claim": "fix values", "source": s})
    if fix.get("rule"):
        out.append({"claim": "fix rule", "source": fix["rule"]})
    if funds.get("source"):
        out.append({"claim": "funds", "source": funds["source"]})
    return out


def explain(brief: dict, use_llm: bool = True) -> dict:
    """Returns {cause, fix, funds, evidence, meta: {mode, attempts, tokens, rejected}}."""
    meta = {"mode": "template", "attempts": 0, "tokens": 0, "rejected": []}
    if use_llm:
        prose_brief = _prose_brief(brief)
        messages = [{"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": json.dumps(prose_brief)}]
        try:
            for _ in range(2):
                content, usage = complete(messages)
                meta["attempts"] += 1
                meta["tokens"] += usage.get("total_tokens", 0)
                try:
                    out = json.loads(content)
                    text = " ".join(str(out.get(k, "")) for k in ("cause", "fix", "funds"))
                except (json.JSONDecodeError, AttributeError):
                    meta["rejected"].append({"reason": "invalid JSON"})
                    continue
                bad = unsupported_numbers(text, prose_brief)
                if not bad and all(out.get(k) for k in ("cause", "funds")):
                    meta["mode"] = "llm"
                    return {**{k: out.get(k) or "" for k in ("cause", "fix", "funds")},
                            "evidence": evidence(brief), "meta": meta}
                meta["rejected"].append({"reason": "unsupported numbers", "numbers": bad, "text": text})
                messages += [{"role": "assistant", "content": content},
                             {"role": "user", "content": f"These numbers are not in the brief: {bad}. "
                                                         "Rewrite using only numbers from the brief, copied exactly."}]
        except LLMUnavailable as e:
            meta["llm_error"] = str(e)
    return {**template(brief), "evidence": evidence(brief), "meta": meta}
