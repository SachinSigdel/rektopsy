"""Fetch a landed transaction from Solana RPC. Read-only: no keys, no signing."""

import json
import os
import re
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv()

DEFAULT_RPC_URL = "https://api.mainnet-beta.solana.com"
CACHE_DIR = Path(__file__).resolve().parent.parent / ".cache" / "tx"

# Base58 alphabet, 64-byte signature encodes to 87 or 88 chars.
SIGNATURE_RE = re.compile(r"^[1-9A-HJ-NP-Za-km-z]{86,88}$")


class FetchError(Exception):
    pass


def rpc_url() -> str:
    return os.environ.get("SOLANA_RPC_URL") or DEFAULT_RPC_URL


def fetch_transaction(signature: str, use_cache: bool = True, retries: int = 4) -> dict | None:
    """Return the raw getTransaction result, or None if the tx never landed / was pruned."""
    signature = signature.strip()
    if not SIGNATURE_RE.match(signature):
        raise FetchError(f"not a valid transaction signature: {signature!r}")

    cache_path = CACHE_DIR / f"{signature}.json"
    if use_cache and cache_path.exists():
        return json.loads(cache_path.read_text())

    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getTransaction",
        "params": [
            signature,
            {"encoding": "jsonParsed", "maxSupportedTransactionVersion": 1, "commitment": "confirmed"},
        ],
    }
    delay = 1.0
    for attempt in range(retries + 1):
        resp = httpx.post(rpc_url(), json=payload, timeout=30)
        if resp.status_code == 429 and attempt < retries:
            time.sleep(delay)
            delay *= 2
            continue
        resp.raise_for_status()
        body = resp.json()
        if "error" in body:
            raise FetchError(f"RPC error: {body['error']}")
        result = body["result"]
        if result is not None and use_cache:
            CACHE_DIR.mkdir(parents=True, exist_ok=True)
            cache_path.write_text(json.dumps(result))
        return result
    raise FetchError("RPC rate limit: retries exhausted")
