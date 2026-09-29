"""Resolve a failure to a named error, and decode known instruction arguments.

Resolution order (first hit wins, each result says where it came from):
1. An Anchor error the program logged itself (parse.py already extracted it).
2. A plain-text error the failing program logged (e.g. Raydium "AMM error: ...").
3. Runtime errors that aren't program-specific (compute budget, etc.).
4. A local map for well-known non-Anchor programs (System, SPL Token, Raydium v4)
   and Anchor framework codes (< 6000), which every Anchor program shares.
5. The program's Anchor IDL, read from chain and cached in `.cache/idl/`.
6. "unknown". Never a guess.
"""

import base64
import hashlib
import json
import time
import zlib
from pathlib import Path

import httpx

from .fetch import rpc_url
from .parse import B58_ALPHABET, RAYDIUM_AMM_V4, b58decode

IDL_CACHE = Path(__file__).resolve().parent.parent / ".cache" / "idl"

SYSTEM = "11111111111111111111111111111111"
TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
JUPITER = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"

PROGRAM_NAMES = {
    SYSTEM: "System Program",
    TOKEN: "SPL Token",
    TOKEN_2022: "SPL Token-2022",
    JUPITER: "Jupiter Aggregator v6",
    RAYDIUM_AMM_V4: "Raydium AMM v4",
    "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK": "Raydium CLMM",
    "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C": "Raydium CPMM",
    "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P": "pump.fun",
    "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA": "PumpSwap AMM",
    "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG": "Meteora DAMM v2",
    "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN": "Meteora Dynamic Bonding Curve",
    "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo": "Meteora DLMM",
    "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc": "Orca Whirlpools",
    "ComputeBudget111111111111111111111111111111": "Compute Budget",
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL": "Associated Token Account",
}

# Non-Anchor programs: codes from their published source.
LOCAL_ERRORS = {
    SYSTEM: {
        0: ("AccountAlreadyInUse", "an account with the same address already exists"),
        1: ("ResultWithNegativeLamports", "account does not have enough SOL to perform the operation"),
        2: ("InvalidProgramId", "cannot assign account to this program id"),
        3: ("InvalidAccountDataLength", "cannot allocate account data of this length"),
    },
    TOKEN: {
        0: ("NotRentExempt", "lamport balance below rent-exempt threshold"),
        1: ("InsufficientFunds", "insufficient funds"),
        3: ("MintMismatch", "account not associated with this mint"),
        4: ("OwnerMismatch", "owner does not match"),
        17: ("AccountFrozen", "account is frozen"),
    },
    RAYDIUM_AMM_V4: {
        30: ("ExceededSlippage", "exceeded desired slippage limit"),
        40: ("InsufficientFunds", "insufficient funds"),
    },
}
LOCAL_ERRORS[TOKEN_2022] = LOCAL_ERRORS[TOKEN]

# Anchor framework errors, shared by every Anchor program.
ANCHOR_FRAMEWORK = {
    100: ("InstructionMissing", "8 byte instruction identifier not provided"),
    101: ("InstructionFallbackNotFound", "fallback functions are not supported"),
    102: ("InstructionDidNotDeserialize", "the program could not deserialize the given instruction"),
    2000: ("ConstraintMut", "a mut constraint was violated"),
    2001: ("ConstraintHasOne", "a has_one constraint was violated"),
    2003: ("ConstraintRaw", "a raw constraint was violated"),
    2006: ("ConstraintSeeds", "a seeds constraint was violated"),
    2012: ("ConstraintAddress", "an address constraint was violated"),
    2014: ("ConstraintTokenMint", "a token mint constraint was violated"),
    2015: ("ConstraintTokenOwner", "a token owner constraint was violated"),
    3001: ("AccountDiscriminatorNotFound", "no 8 byte discriminator was found on the account"),
    3002: ("AccountDiscriminatorMismatch", "8 byte discriminator did not match what was expected"),
    3003: ("AccountDidNotDeserialize", "failed to deserialize the account"),
    3007: ("AccountOwnedByWrongProgram", "the given account is owned by a different program than expected"),
    3012: ("AccountNotInitialized", "the program expected this account to be already initialized"),
    3014: ("AccountNotSystemOwned", "the given account is not owned by the system program"),
}

# Runtime errors (meta.err kinds), not tied to any program.
RUNTIME_ERRORS = {
    "ComputationalBudgetExceeded": "the transaction ran out of compute units",
    "ProgramFailedToComplete": "the program stopped before finishing (usually out of compute units)",
    "InsufficientFunds": "insufficient funds for the instruction",
    "InsufficientFundsForRent": "an account would be left below the rent-exempt minimum",
    "InvalidAccountData": "invalid account data for the instruction",
    "InvalidInstructionData": "invalid instruction data",
    "MissingRequiredSignature": "a required signature is missing",
    "AccountNotFound": "an account the transaction references does not exist",
}

# Plain-text error lines some programs log before failing.
TEXT_ERROR_PREFIXES = ("Program log: AMM error:", "Transfer: insufficient lamports", "Program log: Error:")


def program_name(program_id: str | None) -> str | None:
    return PROGRAM_NAMES.get(program_id) if program_id else None


# ---------------------------------------------------------------------------
# On-chain Anchor IDL lookup

_P = 2**255 - 19
_D = (-121665 * pow(121666, _P - 2, _P)) % _P


def _on_curve(point: bytes) -> bool:
    """True if these 32 bytes decode to an ed25519 point (PDAs must not)."""
    y = int.from_bytes(point, "little") & ((1 << 255) - 1)
    if y >= _P:
        return False
    y2 = y * y % _P
    x2 = (y2 - 1) * pow(_D * y2 + 1, _P - 2, _P) % _P
    return x2 == 0 or pow(x2, (_P - 1) // 2, _P) == 1


def _b58encode(raw: bytes) -> str:
    n = int.from_bytes(raw, "big")
    out = ""
    while n:
        n, r = divmod(n, 58)
        out = B58_ALPHABET[r] + out
    return "1" * (len(raw) - len(raw.lstrip(b"\0"))) + out


def _find_program_address(seeds: list[bytes], program: bytes) -> bytes:
    for bump in range(255, -1, -1):
        h = hashlib.sha256(b"".join(seeds) + bytes([bump]) + program + b"ProgramDerivedAddress").digest()
        if not _on_curve(h):
            return h
    raise ValueError("no PDA found")


def idl_address(program_id: str) -> str:
    """Anchor stores the IDL at createWithSeed(PDA([], program), "anchor:idl", program)."""
    program = b58decode(program_id)
    base = _find_program_address([], program)
    return _b58encode(hashlib.sha256(base + b"anchor:idl" + program).digest())


def fetch_idl(program_id: str) -> dict | None:
    cache = IDL_CACHE / f"{program_id}.json"
    if cache.exists():
        return json.loads(cache.read_text()) or None
    payload = {"jsonrpc": "2.0", "id": 1, "method": "getAccountInfo",
               "params": [idl_address(program_id), {"encoding": "base64"}]}
    for delay in (1, 2, 4, 8):
        resp = httpx.post(rpc_url(), json=payload, timeout=30)
        if resp.status_code != 429:
            break
        time.sleep(delay)
    resp.raise_for_status()
    value = resp.json()["result"]["value"]
    idl = None
    if value:
        data = base64.b64decode(value["data"][0])
        # 8-byte discriminator, 32-byte authority, u32 length, zlib-compressed JSON
        length = int.from_bytes(data[40:44], "little")
        idl = json.loads(zlib.decompress(data[44:44 + length]))
    IDL_CACHE.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(idl or {}))  # cache misses too, as {}
    return idl


# ---------------------------------------------------------------------------
# Error resolution

def resolve_error(facts: dict, use_network: bool = True) -> dict | None:
    """Return {name, message, program, program_name, source} for the root failure, or None."""
    failure, error = facts.get("failure"), facts.get("error")
    if not failure and not error:
        return None
    program = (failure or {}).get("program")
    code = (failure or {}).get("custom_code")
    if code is None and error:
        code = error.get("custom_code")
    base = {"program": program, "program_name": program_name(program), "custom_code": code}

    # 1. Anchor error logged by the failing program (the last one before failure wins).
    anchor = [a for a in facts.get("anchor_errors", []) if a["program"] == program]
    if anchor:
        a = anchor[-1]
        return {**base, "name": a["name"], "message": a["message"], "account": a.get("account"),
                "source": a["source"], "resolved_by": "program log"}

    # 2. Plain-text error line near the failure.
    logs = facts.get("logs", [])
    fail_idx = int(failure["source"][5:-1]) if failure else len(logs)
    for i in range(fail_idx - 1, max(fail_idx - 4, -1), -1):
        if logs[i].startswith(TEXT_ERROR_PREFIXES):
            text = logs[i].removeprefix("Program log: ")
            name = LOCAL_ERRORS.get(program, {}).get(code, (None,))[0]
            return {**base, "name": name, "message": text, "source": f"logs[{i}]", "resolved_by": "program log"}

    # 3. Runtime error, not program-specific.
    kind = error.get("kind") if error else None
    if kind and kind != "Custom":
        msg = RUNTIME_ERRORS.get(kind)
        if failure and "exceeded CUs meter" in failure["message"]:
            msg = RUNTIME_ERRORS["ComputationalBudgetExceeded"]
        return {**base, "name": kind, "message": msg or (failure or {}).get("message"),
                "source": (failure or error)["source"], "resolved_by": "runtime"}

    if code is None:
        return {**base, "name": None, "message": None, "source": None, "resolved_by": "unknown"}

    # 4. Local maps.
    if code in LOCAL_ERRORS.get(program, {}):
        name, msg = LOCAL_ERRORS[program][code]
        return {**base, "name": name, "message": msg, "source": "decode.LOCAL_ERRORS", "resolved_by": "local map"}
    if code < 6000 and code in ANCHOR_FRAMEWORK:
        name, msg = ANCHOR_FRAMEWORK[code]
        return {**base, "name": name, "message": msg, "source": "decode.ANCHOR_FRAMEWORK", "resolved_by": "local map"}

    # 5. On-chain IDL.
    if use_network and program:
        idl = fetch_idl(program)
        for e in (idl or {}).get("errors", []):
            if e["code"] == code:
                return {**base, "name": e["name"], "message": e.get("msg"),
                        "source": f"anchor IDL of {program}", "resolved_by": "on-chain IDL"}

    return {**base, "name": None, "message": None, "source": None, "resolved_by": "unknown"}


# ---------------------------------------------------------------------------
# Instruction arguments, decoded with the program's own IDL (Borsh layout)

_INTS = {"u8": 1, "i8": 1, "u16": 2, "i16": 2, "u32": 4, "i32": 4, "u64": 8, "i64": 8, "u128": 16, "i128": 16}


class _Reader:
    def __init__(self, data: bytes, types: dict):
        self.data, self.pos, self.types = data, 0, types

    def take(self, n: int) -> bytes:
        if self.pos + n > len(self.data):
            raise ValueError("instruction data too short for IDL layout")
        out = self.data[self.pos:self.pos + n]
        self.pos += n
        return out

    def read(self, t):
        if isinstance(t, str):
            if t in _INTS:
                return int.from_bytes(self.take(_INTS[t]), "little", signed=t.startswith("i"))
            if t == "bool":
                return self.take(1) != b"\0"
            if t in ("pubkey", "publicKey"):
                return _b58encode(self.take(32))
            if t in ("bytes", "string"):
                raw = self.take(self.read("u32"))
                return raw.decode() if t == "string" else raw.hex()
            raise ValueError(f"unsupported IDL type {t}")
        if "vec" in t:
            return [self.read(t["vec"]) for _ in range(self.read("u32"))]
        if "option" in t:
            return self.read(t["option"]) if self.read("u8") else None
        if "array" in t:
            inner, n = t["array"]
            return [self.read(inner) for _ in range(n)]
        if "defined" in t:
            name = t["defined"]["name"] if isinstance(t["defined"], dict) else t["defined"]
            ty = self.types[name]["type"]
            if ty["kind"] == "struct":
                return self.read_fields(ty.get("fields", []))
            variant = ty["variants"][self.read("u8")]
            fields = variant.get("fields")
            return {variant["name"]: self.read_fields(fields) if fields else None}
        raise ValueError(f"unsupported IDL type {t}")

    def read_fields(self, fields: list):
        if fields and isinstance(fields[0], dict) and "name" in fields[0]:
            return {f["name"]: self.read(f["type"]) for f in fields}
        return [self.read(f) for f in fields]  # tuple variant


def _discriminator(ix_def: dict) -> bytes:
    if "discriminator" in ix_def:
        return bytes(ix_def["discriminator"])
    return hashlib.sha256(f"global:{ix_def['name']}".encode()).digest()[:8]


def decode_instruction(ix: dict, use_network: bool = True) -> dict | None:
    """Decode a top-level Anchor instruction's name and args via its IDL, or None."""
    program = ix.get("programId")
    if "data" not in ix or not program or not use_network:
        return None
    idl = fetch_idl(program)
    if not idl:
        return None
    data = b58decode(ix["data"])
    types = {t["name"]: t for t in idl.get("types", [])}
    for ix_def in idl.get("instructions", []):
        if data[:8] != _discriminator(ix_def):
            continue
        reader = _Reader(data[8:], types)
        try:
            args = reader.read_fields(ix_def["args"])
        except (ValueError, IndexError, KeyError):
            return {"instruction": ix_def["name"], "args": None, "decode_error": "layout mismatch"}
        return {"instruction": ix_def["name"], "args": args}
    return None


JUPITER_AMOUNT_ARGS = ("in_amount", "out_amount", "quoted_out_amount", "quoted_in_amount", "slippage_bps")


def jupiter_swap_args(ix: dict, use_network: bool = True) -> dict | None:
    """The user-facing numbers of a Jupiter swap: amounts and slippage_bps."""
    if ix.get("programId") != JUPITER:
        return None
    decoded = decode_instruction(ix, use_network)
    if not decoded or not decoded["args"] or "slippage_bps" not in decoded["args"]:
        return None
    args = decoded["args"]
    return {"instruction": decoded["instruction"], **{k: args[k] for k in JUPITER_AMOUNT_ARGS if k in args}}


def jupiter_swap_mints(tx: dict, ix: dict, use_network: bool = True) -> tuple[str, str] | None:
    """(input mint, output mint) of a Jupiter swap, located by account name in Jupiter's IDL."""
    if ix.get("programId") != JUPITER or not use_network:
        return None
    decoded = decode_instruction(ix)
    idl = fetch_idl(JUPITER)
    ix_def = next((d for d in idl.get("instructions", []) if decoded and d["name"] == decoded["instruction"]), None)
    if not ix_def:
        return None
    names = [a["name"] for a in ix_def["accounts"]]
    accts = ix.get("accounts", [])
    at = lambda n: accts[names.index(n)] if n in names and names.index(n) < len(accts) else None  # noqa: E731
    keys = [k["pubkey"] if isinstance(k, dict) else k for k in tx["transaction"]["message"]["accountKeys"]]
    mint_of = {keys[b["accountIndex"]]: b["mint"]
               for b in (tx["meta"].get("preTokenBalances") or []) + (tx["meta"].get("postTokenBalances") or [])}
    src = at("source_mint") or mint_of.get(at("user_source_token_account") or at("source_token_account"))
    dst = at("destination_mint")
    return (src, dst) if src and dst else None
