# Rektopsy

**Paste a failed Solana transaction. Get the cause of death, the exact fix, and
whether your funds are safe, with every claim traced back to the chain.**

Built for the Colosseum Crypto World's Fair hackathon.

**Try it live:** [rektopsy.vercel.app](https://rektopsy.vercel.app) ·
[example report](https://rektopsy.vercel.app/report?sig=36V9G2WgBdWsZNdgsb1V2U4jJ9xGfNC5ehv9YeKrGnvhXjKNTgcBoJian5VtRNFBHYegjhbRWtQ1eBwmqXJEgrcg) ·
[scam check](https://rektopsy.vercel.app/check) ·
[docs](https://rektopsy.vercel.app/docs) ·
[API explorer](https://rektopsy-api.onrender.com/docs) ·
widget: `<script src="https://rektopsy-api.onrender.com/widget.js" defer></script>`

The API runs on Render's free plan, so the first request after 15 idle minutes
can take up to a minute while it wakes up.

## The problem

When a Solana transaction fails, your wallet shows something like
`custom program error: 0x1771`. The real reason is buried in dozens of program
log lines, and error codes mean different things in different programs. New
users can't tell what went wrong, what to change, or, most worrying, whether
they just lost money.

Asking a chatbot to read the raw logs sounds like a fix, but LLMs guess. In our
test they misread the cause in 3 of 25 cases, told users to *lower* slippage
when it needed raising, and made up a top-up amount (see [Evaluation](#evaluation)).

## What you get

For the reference transaction, a real user's Jupiter swap that failed at 0.5% slippage:

```
cause    The transaction failed because the price moved beyond the allowed slippage
         limit in the Jupiter Aggregator v6 program.
fix      Get a fresh quote and try again; if it keeps failing, increase the slippage
         to the suggested 100 bps (1%).
funds    Your funds are safe and only the network fee of 0.000019 SOL was charged.
evidence cause      <- Jupiter's on-chain Anchor IDL (error 6001)
         fix values <- transaction.message.instructions[8].data, decoded with the Jupiter IDL
         fix rule   <- suggested = min(max(2 x current, 50 bps), 300 bps); suggested, not simulated
         funds      <- meta.preBalances/postBalances, token balances, meta.fee
```

It covers slippage (Jupiter, Raydium AMM v4, Meteora DAMM v2, pump.fun,
PumpSwap), running out of compute, insufficient SOL or tokens, missing
accounts, transactions that never landed, and errors we can't identify. For
those we say so and give the code and program to ask about; we don't guess.

## How it works

```
signature
  -> fetch.py    getTransaction from public mainnet RPC (read-only, cached)
  -> parse.py    walk the log stack: which program failed first, with what numbers
  -> decode.py   name the error: program log -> runtime -> known map -> on-chain Anchor IDL -> "unknown"
  -> fixes.py    category, fix values, funds status; every number computed here by a documented rule
  -> explain.py  an LLM turns those facts into three plain sentences
  -> verify.py   reject the prose if it contains any number not in the facts (retry once, then template)
```

**The core rule: the LLM never produces a number or a fact.** Python extracts
and computes everything and records where each fact came from. The LLM only
writes sentences, and `verify.py` checks every number in its output against
the facts. If the LLM fails the check twice, you get deterministic template
prose instead. It also works with no LLM at all.

**Read-only, always.** No wallet connection, no signing, no keys, no fees. Only
public `getTransaction` reads.

The LLM is `openai/gpt-oss-120b` on Groq's free tier, behind one small function
(`explain.complete`) so the provider is easy to swap.

## Evaluation

25 real mainnet transactions (`eval/cases.json`): 7 slippage, 5 insufficient
funds, 3 compute, 3 missing account, 3 unidentified errors, 2 never landed,
2 succeeded. Each label carries evidence: the program's own error log line, a
published IDL reference, or, for unidentified errors, absence from public
registries. The **baseline** gives the same model the raw transaction logs in
one prompt.

| metric | Rektopsy | baseline (raw logs to the same LLM) |
|---|---|---|
| correct cause | **100%** (25/25) | 88% (22/25) |
| numbers not traceable to chain data | **0** | 8 |
| fix usefulness (0-2) | **1.96** | 1.04 |
| median latency | 2.9 s | 15.1 s |
| median tokens per autopsy | 807 | 1890 |

Read these honestly:

- **Correct cause is flattering.** Labels came from the same logs the pipeline
  reads, so 100% mostly shows the extraction is consistent, not that it
  generalises to programs outside the test set.
- **Of the baseline's 8 untraceable numbers,** 1 was invented (a padded
  "add ~80,000 lamports") and 7 were the LLM's own arithmetic or rounding,
  which happened to be correct. Rektopsy forbids LLM arithmetic, so all 8 count.
- **Fix usefulness is hand-scored** (2 = right action with the right value,
  1 = right direction without a value, 0 = wrong or none). The scores were
  assigned by the AI coding assistant that helped build this, not by an
  independent reviewer. Every score and its reason is in
  `eval/fix_scores.json`, so you can check them.
- The one case short of 2 is a Meteora DAMM v2 slippage failure. That pool
  doesn't log what the swap needed, so we show the user's own limits but
  can't compute a new value.

Reproduce with `PYTHONPATH=. uv run python eval/run.py --baseline`. It reads
saved fixtures in `eval/fixtures/`, so results don't depend on the chain.

## Scam check

Failed swaps cost a fee; scams cost the wallet. [`/check`](https://rektopsy.vercel.app/check)
(API: `POST /scam-check {text}`) takes a pasted DM, tweet, email, link or
airdropped token name and returns:

- a verdict: **likely scam**, **suspicious**, or **no red flags found**. Never
  "safe": we can only say what we didn't find.
- every red flag with the exact sentence that triggered it, highlighted in the message
- a status for each link: official, look-alike (`jup1ter.ag`, `phant0m-app.io`),
  on a phishing blocklist, shortened, or not on any list
- fixed, hand-written advice for each kind of flag

Same rule as the autopsy: no LLM decides or writes anything here. Three parts,
all in Python (`rektopsy/scam.py`):

1. **Rules** for the scams that matter most and that a model can miss: requests
   for your seed phrase or private key, send-X-get-more-back, guaranteed
   returns, "verify/sync your wallet", connect-or-sign-to-claim, fake support,
   look-alike letters from other alphabets, airdrop names that point to a site.
2. **Links** checked against official domains (look-alike spellings) and the
   public phishing lists from [Phantom](https://github.com/phantom/blocklist),
   [MetaMask](https://github.com/MetaMask/eth-phishing-detect) and
   [ScamSniffer](https://github.com/scamsniffer/scam-database) (~460k domains,
   downloaded at runtime and cached for a day; not redistributed here).
3. **A trained model** as a second opinion: TF-IDF + logistic regression
   (`scam/train.py`), shipped as JSON and scored in plain Python. It can turn
   "no red flags" into "suspicious", never into "likely scam", and it shows the
   words that pushed its score up.

Training data: the [Discord scam/clean messages](https://huggingface.co/datasets/wangyuancheng/discord-phishing-scam-clean)
set (MIT), the [SMS Spam Collection](https://archive.ics.uci.edu/dataset/228/sms+spam+collection)
(CC BY 4.0), and 2,000 [Solana Stack Exchange](https://solana.stackexchange.com)
questions (CC BY-SA) as normal crypto talk, so mentioning a wallet isn't
suspicious by itself. 8,903 messages, 832 scams.

### How well it works

| test set | scams flagged | normal messages flagged |
|---|---|---|
| General scams, held out from training (Discord + SMS) | 143/166 (86%) | 11/1,614 (0.7%) |
| **Real Solana scams, blind** (before any tuning on them) | **14/32 (44%)** | 0/607 |
| Real Solana scams, after adding rules for the misses | 21/32 (66%) | 0/607 |

No normal message in any set was called "likely scam"; every false alarm was
"suspicious".

- **The blind Solana number is the honest one.** The 32 scams are real messages
  quoted in news articles, security write-ups and GitHub issues, each with its
  source URL in `scam/solana_test.json`. They were collected without looking at
  the rules. After seeing the misses we added rules for airdrop token names,
  look-alike alphabets and "visit the site to claim"; the 21/32 row is tuned on
  the same 32 messages, so treat it as an upper bound.
- **What it can't catch:** 10 of the 11 posts from hacked celebrity and brand
  accounts ("buy $DOJA or else"). The text looks like an ordinary memecoin
  post; the scam is that the account was hacked, which text can't show. The
  11th miss is a phishing site titled "Reclaim SOL from Empty Token Accounts",
  which reads like the real tools that do this.
- **The test set is small and has no DMs.** Most published scam messages are
  screenshots, and sites where victims paste DMs block automated reading.
- **Normal messages are written posts** (forum topics, Stack Exchange questions),
  which are easier than casual chat. Expect more "suspicious" on chat.
- The rules were written while looking at the normal training messages, so the
  general false-alarm number may be slightly optimistic.

Reproduce:

```
uv run python scam/fetch_data.py                       # training data -> scam/data/
uv run --group train python scam/train.py              # held-out scores, exports the model
PYTHONPATH=scam uv run python scam/fetch_test_normal.py
uv run python scam/eval_solana.py --show               # Solana test set
```

## Run it from a clean machine

Prerequisites: [uv](https://docs.astral.sh/uv/) (it installs Python 3.11 for
you), and Node.js 20.9+ with [pnpm](https://pnpm.io) for the web UI.

```bash
git clone https://github.com/SachinSigdel/rektopsy.git && cd rektopsy
uv sync
cp .env.example .env
```

Optional: add a free Groq key to `.env` as `GROQ_API_KEY=...` (from
[console.groq.com](https://console.groq.com)). Without one, everything works
and the prose comes from templates instead of the LLM.

**Command line**

```bash
uv run python -m rektopsy 36V9G2WgBdWsZNdgsb1V2U4jJ9xGfNC5ehv9YeKrGnvhXjKNTgcBoJian5VtRNFBHYegjhbRWtQ1eBwmqXJEgrcg
uv run python -m rektopsy <signature> --no-llm   # template prose only
uv run python -m rektopsy <signature> --facts    # raw extracted facts
```

**API** (`POST /autopsy {"signature": "..."}`; docs at http://localhost:8000/docs)

```bash
uv run uvicorn rektopsy.api:app --port 8000
```

**Web UI** (with the API running)

```bash
cd web && cp .env.example .env.local && pnpm install && pnpm dev   # http://localhost:3000
```

The UI has two pages: `/` (paste a signature) and `/report?sig=<signature>`,
which is a shareable link to one autopsy.

**Embeddable widget.** The API serves it, so any site can add:

```html
<script src="http://localhost:8000/widget.js" defer></script>
<rektopsy-autopsy></rektopsy-autopsy>                          <!-- input box -->
<rektopsy-autopsy signature="..." report="http://localhost:3000"></rektopsy-autopsy>
<script>Rektopsy.attach({ sig, theme: "dark", target: "#help" })</script>
```

`signature` runs the autopsy on load; `report` (the web UI's address) adds a
"Full autopsy" link. The retry button in the widget and the report page is a
disabled preview: Rektopsy is read-only and never asks for a wallet.

Try it with `python3 -m http.server 8080 --directory widget`, then open
http://localhost:8080/demo.html. The widget uses a shadow root so host styles
can't break it, and inserts API data only as text. It fires `rektopsy:result`,
`rektopsy:error` and `rektopsy:dismiss` events.

**Tests and eval**

```bash
PYTHONPATH=. uv run pytest -q tests                  # API tests, offline
PYTHONPATH=. uv run python eval/run.py --no-llm      # eval, no key needed
PYTHONPATH=. uv run python eval/run.py --baseline    # needs GROQ_API_KEY
```

Each eval run overwrites `eval/results.json`; the committed copy holds the
numbers in the table above (restore it with `git checkout eval/results.json`).
Groq's free tier allows 8,000 tokens per minute for this model. If the baseline
arm is skipped with a 429 error, wait a minute and run it again.

## Deploy

The API and the web UI deploy separately.

**API on Render.** `render.yaml` is a Render Blueprint: in the Render dashboard
choose **New → Blueprint**, connect this repo, and paste your `GROQ_API_KEY`
when asked. Render builds with `uv sync --frozen --no-dev` and starts
`uvicorn rektopsy.api:app`. Check `https://<your-service>.onrender.com/health`.
On Render's free plan the service sleeps after 15 minutes without traffic and
takes up to a minute to wake, so open `/health` before a demo.

**Web UI on Vercel.** Import the repo, set **Root Directory** to `web`, and add
the environment variable `NEXT_PUBLIC_API_URL=https://<your-service>.onrender.com`
before the first build. It is baked in at build time, so redeploy after changing it.

## Configuration

| variable | default | purpose |
|---|---|---|
| `SOLANA_RPC_URL` | `https://api.mainnet-beta.solana.com` | any mainnet RPC; the public one is rate-limited |
| `GROQ_API_KEY` | none | enables LLM prose |
| `GROQ_MODEL` | `openai/gpt-oss-120b` | Groq model override |
| `REKTOPSY_CORS_ORIGINS` | `*` | comma-separated origins allowed to call the API |
| `NEXT_PUBLIC_API_URL` (web) | `http://localhost:8000` | where the UI finds the API |

## Limitations

- **Mainnet only.** The public RPC is rate-limited; Rektopsy backs off on 429
  errors and caches fetched transactions in `.cache/`.
- **Never-landed transactions** (for example a stale blockhash) leave no record
  on chain. We say no funds moved and no fee was charged, but can't prove the
  exact cause.
- **Fixes are suggested, not simulated.** Nothing is re-run against the chain yet.
- **Token amounts are shown in raw units** (the token's smallest unit) where we
  don't have the token's decimals.
- **The scam check reads text only.** It can't tell that an account was
  hacked, and a link that's on no list isn't proof it's safe. See [Scam check](#scam-check).
- **Coverage is what the test set covers.** Other programs fall back to their
  on-chain Anchor IDL if one is published, and to "unknown" if not.

## Layout

```
rektopsy/   Python package: fetch, parse, decode, fixes, verify, explain, pipeline, api, CLI
eval/       cases.json, fixtures/ (tx JSON + IDL snapshots), run.py, fix_scores.json, results.json
scam/       scam-check data scripts, training, Solana test set and results
tests/      offline tests (API, scam rules)
web/        Next.js + Tailwind UI (designs/ holds the HTML mockups it follows)
widget/     embeddable <rektopsy-autopsy> element + demo page
```

## License

MIT. See [LICENSE](LICENSE).
