"""Usage: uv run python -m rektopsy <signature> [--no-cache]"""

import json
import sys

from .fetch import fetch_transaction
from .parse import extract_facts


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 1:
        sys.exit(__doc__)
    tx = fetch_transaction(args[0], use_cache="--no-cache" not in sys.argv)
    print(json.dumps(extract_facts(args[0], tx), indent=2))


if __name__ == "__main__":
    main()
