"""Usage: uv run python -m rektopsy <signature> [--no-cache] [--facts] [--no-llm]

Prints the autopsy JSON; --facts prints the raw extracted facts instead.
"""

import json
import sys

from .fetch import fetch_transaction
from .parse import extract_facts
from .pipeline import autopsy


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 1:
        sys.exit(__doc__)
    use_cache = "--no-cache" not in sys.argv
    if "--facts" in sys.argv:
        out = extract_facts(args[0], fetch_transaction(args[0], use_cache=use_cache))
    else:
        out = autopsy(args[0], use_llm="--no-llm" not in sys.argv, use_cache=use_cache)
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
