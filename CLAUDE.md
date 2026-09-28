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
  behind one small function so the provider is swappable. Check Groq's current
  models when building step 3. Report tokens per autopsy instead of cost.
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
- `rektopsy/__main__.py`: CLI.
- Planned: `decode.py`, `fixes.py`, `explain.py`, `verify.py`, `api.py`,
  `eval/cases.json`, `eval/run.py`, `eval/fixtures/`, Next.js UI, widget.

## Run
```
uv run python -m rektopsy <signature>            # prints facts JSON
uv run python -m rektopsy <signature> --no-cache
```
Python 3.11 via uv. Scripts outside the package need `PYTHONPATH=.`.
Reference signature (Jupiter Custom 6001, no funds moved):
`5ca6A2pvwVXNbrck3S6yeZb9dUb8L79bqXnShs3qckao8s9iQk71XV9XWAzp1jcAmWgcxYgr6VUajnPP5UWgSwFH`

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
3. `decode.py` (Anchor IDL on-chain → local map → "unknown") + `fixes.py` +
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
