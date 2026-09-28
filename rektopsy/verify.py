"""The hallucination guard: every number in the prose must exist in the brief.

Numbers are compared by value after normalisation ("1,000" == "1000",
"0.50" == "0.5"). Digits inside words or addresses ("v4", base58 keys) are not
numbers. Numbers inside the brief's own strings (e.g. "Token-2022") count as
allowed, since the prose may repeat them.
"""

import re
from decimal import Decimal, InvalidOperation

# A number not glued to a word character or a preceding dot.
NUMBER_RE = re.compile(r"(?<![\w.])-?\d{1,3}(?:,\d{3})+(?:\.\d+)?(?!\w)|(?<![\w.])-?\d+(?:\.\d+)?(?!\w)")


def _norm(token: str) -> str | None:
    try:
        return format(Decimal(token.replace(",", "")).normalize(), "f")
    except InvalidOperation:
        return None


def numbers_in(text: str) -> list[str]:
    return [t for t in NUMBER_RE.findall(text)]


def allowed_numbers(brief) -> set[str]:
    out: set[str] = set()

    def walk(v):
        if isinstance(v, bool) or v is None:
            return
        if isinstance(v, (int, float, Decimal)):
            out.add(_norm(str(v)))
        elif isinstance(v, str):
            out.update(_norm(t) for t in numbers_in(v))
            if n := _norm(v):
                out.add(n)
        elif isinstance(v, dict):
            for x in v.values():
                walk(x)
        elif isinstance(v, (list, tuple)):
            for x in v:
                walk(x)

    walk(brief)
    out.discard(None)
    return out


def unsupported_numbers(text: str, brief: dict) -> list[str]:
    """Numbers in `text` that don't appear anywhere in `brief`. Empty list = pass."""
    allowed = allowed_numbers(brief)
    return [t for t in numbers_in(text) if _norm(t) not in allowed]
