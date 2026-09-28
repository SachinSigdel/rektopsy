# Rektopsy — explain why a Solana transaction failed

Hackathon project: Colosseum Crypto World's Fair, **due Oct 12 2026**.

User pastes a transaction signature. We fetch it from chain, extract facts
deterministically from the logs/meta, and return:
1. Plain-English cause of death
2. The exact fix (setting + value)
3. Whether their funds are safe
4. Evidence: every claim traced to a log line or meta field

## Core rule (never violate)
The LLM NEVER invents a number or fact. Python extracts everything; the LLM only
turns the facts object into sentences. `verify.py` rejects any output containing
a number not present in the facts object (retry once, then template fallback).

Consequences:
- Fix values (e.g. new CU limit, new slippage) must be computed in Python
  (`fixes.py`) and written into the facts, never proposed by the LLM.
- Put numbers in the facts in every format the prose might use (raw, UI units,
  SOL vs lamports, % vs bps) so the guard can match them.
- If an error code can't be resolved, say "unknown", never guess.

## Read-only, always
No wallet connection, no signing, no keys, no fees. Only public reads
(`getTransaction`, `getSignaturesForAddress`). `simulateTransaction` may be used
later only to test a proposed fix in a sandbox.

## Decisions made (don't re-litigate)
- **Mainnet**, read-only. Not devnet.
- **RPC:** public `https://api.mainnet-beta.solana.com` via `SOLANA_RPC_URL`
  (no Helius, no key). Respect rate limits; pace requests.
- **LLM:** **Groq** free tier (`GROQ_API_KEY`), not Anthropic. Keep the LLM call
  behind one small function so the provider is swappable. Model:
  `llama-3.3-70b-versatile` (override with `GROQ_MODEL`); chosen over gpt-oss
  because reasoning tokens would inflate tokens-per-autopsy. Report tokens per
  autopsy instead of cost.
- **Never-landed txs** (stale blockhash, can't pay fee): `getTransaction` returns
  null. Return a "never reached the chain, no funds moved, no fee charged"
  template. Don't claim a specific cause we can't prove.
- **Simulation scope:** only compute-budget / priority-fee fixes get simulated;
  others are labelled "suggested, not simulated". (Proposed; confirm with user.)
- `maxSupportedTransactionVersion` is **1**: mainnet has v1 transactions now.
- Commits are local only. No GitHub remote yet; ask before creating/pushing.

## Layout
- `rektopsy/fetch.py`: getTransaction, signature validation, 429 backoff,
  cache in `.cache/tx/` (gitignored).
- `rektopsy/parse.py`: `extract_facts(signature, tx)` → facts dict. Walks the
  invoke/success/failed log stack; the first `failed` line is the root cause
  (outer frames re-log it). Every fact has a `source`.
- `rektopsy/decode.py`: error name resolution (program log → runtime → local
  map → on-chain Anchor IDL, cached in `.cache/idl/` → "unknown"), plus a
  generic Borsh decoder that reads instruction args/accounts via the IDL.
- `rektopsy/fixes.py`: `diagnose()` → category + fix values + funds status.
  All numbers computed here with documented rules.
- `rektopsy/verify.py`: rejects prose numbers absent from the brief.
- `rektopsy/explain.py`: Groq call behind `complete()`; verify, retry once,
  template fallback. Evidence list built in Python.
- `rektopsy/pipeline.py`: `autopsy(signature)`, the single entry point.
- `rektopsy/__main__.py`: CLI.
- `eval/`: `cases.json` + `fixtures/` (tx JSON, `idl/` snapshots) built by
  `build_cases.py`; `run.py` scores; `discover.py` finds candidates.
- Planned: `api.py`, Next.js UI, widget.

## Solana gotchas learned
- Most failed Jupiter txs are bots. `discover.is_bot_like`: same mint in and
  out, several Jupiter swaps, token-ledger routes, 0%/100% slippage, or
  in_amount == quoted_out. Users mostly send `route_v2`.
- The on-chain Jupiter IDL is slightly off for v1 `route` (platform_fee_bps is
  2 bytes in real data), so decoding reads from the front via the IDL, never
  offsets from the end.
- Anchor `require_gte!(left, right)` logs `Left:`/`Right:` and fails when
  left < right. Min-out errors: left = got, right = minimum. Max-in errors:
  left = maximum, right = needed.
- Real users rarely hit compute limits (wallets simulate first); the two
  compute bot cases are marked in `cases.json` notes.

## Run
```
uv run python -m rektopsy <signature>            # autopsy JSON (LLM if GROQ_API_KEY set)
uv run python -m rektopsy <signature> --no-llm   # template prose only
uv run python -m rektopsy <signature> --facts    # raw extracted facts
PYTHONPATH=. uv run python eval/run.py [--no-llm] [--baseline]
PYTHONPATH=. uv run python eval/discover.py <program> --match 6001   # find cases
```
Python 3.11 via uv. Scripts outside the package need `PYTHONPATH=.`.
Reference signature (real user, Jupiter 6001 slippage at 0.5%, no funds moved):
`36V9G2WgBdWsZNdgsb1V2U4jJ9xGfNC5ehv9YeKrGnvhXjKNTgcBoJian5VtRNFBHYegjhbRWtQ1eBwmqXJEgrcg`
(The old reference `5ca6A2pv…` turned out to be an arbitrage bot: USDC->USDC at 0% slippage.)

## Build order — stop after each step and show the user
1. ✅ `fetch.py` + `parse.py` on one real failed signature.
2. ✅ `eval/cases.json`: 25 real mainnet cases + fixtures in `eval/fixtures/`.
   Found with `eval/discover.py <program>` (filters Jupiter arbitrage round
   trips). The user is new to Solana and can't hand-check labels, so each label
   carries `evidence`: the program's own error log line, a published IDL
   reference (Jupiter 6001), or, for `unknown_custom`, absence from public
   registries. Never-landed cases use synthetic random signatures (user OK'd).
   "Account not found" uses Anchor `AccountNotInitialized` (3012), since real
   `AccountNotFound` txs never land (user OK'd). The user will spot-check for
   bot-like wallets once the MVP UI exists.
3. 🔶 (code done, no-LLM eval 25/25; waiting on GROQ_API_KEY for LLM + baseline
   arms and fix scores in `eval/fix_scores.json`) `decode.py` (Anchor IDL on-chain → local map → "unknown") + `fixes.py` +
   `explain.py` + `verify.py`, scored by `eval/run.py`: correct-cause %,
   hallucinated numbers (must be 0), fix usefulness (hand-scored 0-2), median
   latency, tokens per autopsy. If decode.py resolves an `unknown_custom`
   case via an on-chain IDL, relabel it. Baseline arm: raw logs in one prompt to the same
   Groq model, same 25 cases.
4. FastAPI: `POST /autopsy { signature }`.
5. Next.js + Tailwind UI: dark, serif headings, orange for the failure, teal
   for the fix.
6. Standalone embeddable JS widget.

Deliverables: README (problem, how it works, eval table), clean-env repro
steps, 3-minute demo video.
