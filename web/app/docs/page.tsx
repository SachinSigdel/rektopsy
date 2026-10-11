import Link from "next/link";
import type { ReactNode } from "react";
import { API_URL } from "@/lib/api";
import CodeBlock from "../components/code-block";
import { SiteHeader, SiteNav } from "../components/brand";
import DocsNav, { type NavGroup } from "./docs-nav";

export const metadata = {
  title: "Docs · Rektopsy",
  description:
    "Rektopsy API and widget reference: explain why a Solana transaction failed, and check a message for scams.",
};

const SIG = "2KhUjNQsVikHC6JnpigNW4fhspGJYPM7SsgutEXjR6mj8ufLgSdVwA9KZEeMjCdhxGcMMMJG91rUyYM9h32c94zX";

const NAV: NavGroup[] = [
  {
    title: "Getting started",
    items: [
      { id: "introduction", label: "Introduction" },
      { id: "quickstart", label: "Quickstart" },
      { id: "how-it-works", label: "How it works" },
    ],
  },
  {
    title: "API reference",
    items: [
      { id: "post-autopsy", label: "POST /autopsy" },
      { id: "response", label: "Response object" },
      { id: "categories", label: "Categories" },
      { id: "errors", label: "Errors" },
      { id: "other-endpoints", label: "Other endpoints" },
    ],
  },
  {
    title: "Scam check",
    items: [
      { id: "post-scam-check", label: "POST /scam-check" },
      { id: "scam-response", label: "Response object" },
      { id: "scam-rules", label: "Red flags" },
      { id: "scam-accuracy", label: "Accuracy" },
    ],
  },
  {
    title: "Widget",
    items: [
      { id: "widget", label: "Embed the widget" },
      { id: "widget-attributes", label: "Attributes" },
      { id: "widget-attach", label: "Rektopsy.attach()" },
      { id: "widget-events", label: "Events" },
    ],
  },
  {
    title: "Operations",
    items: [
      { id: "self-hosting", label: "Self-hosting" },
      { id: "limits", label: "Limits" },
    ],
  },
];

const CURL = `curl -X POST ${API_URL}/autopsy \\
  -H "Content-Type: application/json" \\
  -d '{"signature": "${SIG}"}'`;

const JS = `const res = await fetch("${API_URL}/autopsy", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ signature }),
});
if (!res.ok) throw new Error((await res.json()).detail);
const autopsy = await res.json();
console.log(autopsy.cause, autopsy.fix, autopsy.funds);`;

const PYTHON = `import httpx

r = httpx.post("${API_URL}/autopsy", json={"signature": signature}, timeout=90)
r.raise_for_status()
autopsy = r.json()
print(autopsy["cause"], autopsy["fix"], autopsy["funds"], sep="\\n")`;

const RESPONSE = `{
  "signature": "2KhUjNQs…h32c94zX",
  "category": "slippage",
  "cause": "The transaction failed because the Raydium AMM v4 exceeded the slippage limit you set.",
  "fix": "Retry with a fresh quote or lower the minimum you accept (your minimum was 5915877453 raw units, you would have received 5913883810 raw units, shortfall 1993643 raw units).",
  "funds": "Your money is safe; only the network fee of 0.000071794 SOL was charged.",
  "evidence": [
    { "claim": "cause", "source": "logs[6]" },
    { "claim": "fix values", "source": "logs[5] (ray_log)" },
    { "claim": "fix rule", "source": "minimum must be at most what the trade would give" },
    { "claim": "funds", "source": "meta.preBalances/postBalances, meta.preTokenBalances/postTokenBalances, meta.fee" }
  ],
  "log_lines": {
    "5": "Program log: ray_log: A/DuHF4JAAAATSCdYAEAAAABAAAA…",
    "6": "Program log: AMM error: Exceeded desired slippage limit."
  },
  "meta": { "mode": "llm", "attempts": 1, "tokens": 856, "rejected": [], "latency_ms": 2702 },
  "tx": {
    "slot": 451340359,
    "block_time": 1790604208,
    "failed_instruction": 1,
    "failure_log": 8,
    "steps": [
      { "index": 0, "label": "Compute budget set", "program_name": "Compute Budget", "status": "ok", … },
      { "index": 1, "label": "Raydium AMM v4 called", "program_name": "Raydium AMM v4", "status": "failed", … }
    ],
    "compute_consumed": 11763,
    "compute_limit": 19340,
    "programs_touched": 2,
    "logs": ["Program ComputeBudget111111111111111111111111111111 invoke [1]", …],
    "logs_truncated": false
  },
  "brief": {
    "category": "slippage",
    "cause": { "error_name": "ExceededSlippage", "custom_code": 30, "failing_program_name": "Raydium AMM v4", "resolved_by": "program log", … },
    "fix": {
      "action": "retry with a fresh quote, or lower the minimum you accept",
      "values": { "would_receive_raw": 5913883810, "your_minimum_raw": 5915877453, "shortfall_raw": 1993643, "shortfall_pct_of_minimum": "0.03" },
      "rule": "minimum must be at most what the trade would give",
      "simulated": false,
      …
    },
    "funds": { "safe": true, "fee_lamports": 71794, "fee_sol": "0.000071794", … }
  }
}`;

const SCAM_CURL = `curl -X POST ${API_URL}/scam-check \\
  -H "Content-Type: application/json" \\
  -d '{"text": "Hi, I am from Phantom support. Please share your recovery phrase at phant0m-app.io to restore your wallet."}'`;

// A real response from the live API, trimmed.
const SCAM_RESPONSE = `{
  "verdict": "likely_scam",
  "headline": "This looks like a scam.",
  "advice": [
    "Don't open the link. Type the real address yourself: phantom.app.",
    "Never share your seed phrase or private key. No real team, app or wallet will ever ask for it.",
    …
    "If you already signed something or shared your seed phrase, move your funds to a new wallet right away."
  ],
  "red_flags": [
    {
      "rule": "secret_request",
      "severity": "high",
      "title": "Asks for your secret phrase or private key",
      "why": "Anyone with these words owns your wallet. No real support team, app or wallet ever asks for them.",
      "match": "share your recovery phrase",
      "quote": "Please share your recovery phrase at phant0m-app.io to restore your wallet.",
      "start": 38,
      "end": 64
    },
    {
      "rule": "lookalike_link",
      "severity": "high",
      "title": "Link imitates a real site",
      "why": "In phant0m-app.io, the name \\"phantom\\" is used on a different site. The real site is phantom.app.",
      "match": "phant0m-app.io",
      "quote": "phant0m-app.io"
    },
    …
  ],
  "links": [
    {
      "host": "phant0m-app.io",
      "status": "lookalike",
      "detail": "the name \\"phantom\\" is used on a different site",
      "real": "phantom.app"
    }
  ],
  "model": {
    "score_pct": 65,
    "threshold": 0.69,
    "threshold_pct": 69,
    "flagged": false,
    "top_words": ["your", "your wallet", "from", "recovery phrase", "restore"],
    "trained_on": 8903
  },
  "lists_checked": ["MetaMask's phishing list", "Phantom's blocklist", "ScamSniffer's database"],
  "lists_unavailable": []
}`;

const WIDGET_HTML = `<script src="${API_URL}/widget.js" defer></script>

<!-- Input box: the reader pastes any signature -->
<rektopsy-autopsy></rektopsy-autopsy>

<!-- Pinned: runs as soon as the page loads -->
<rektopsy-autopsy
  signature="${SIG}"
  report="https://rektopsy.vercel.app">
</rektopsy-autopsy>`;

const WIDGET_ATTACH = `const el = Rektopsy.attach({
  sig: failedSignature,              // optional: omit to show the input box
  target: "#support-panel",          // element or selector; defaults to <body>
  report: "https://rektopsy.vercel.app",
  theme: "dark",
});`;

const WIDGET_EVENTS = `document.addEventListener("rektopsy:result", (e) => {
  const autopsy = e.detail;          // the full POST /autopsy response
  analytics.track("tx_autopsy", { category: autopsy.category });
});
document.addEventListener("rektopsy:error", (e) => console.warn(e.detail.message));
document.addEventListener("rektopsy:dismiss", () => closeSupportPanel());`;

const SELF_HOST = `git clone https://github.com/SachinSigdel/rektopsy.git && cd rektopsy
uv sync
cp .env.example .env              # optional: add GROQ_API_KEY
uv run uvicorn rektopsy.api:app --port 8000

# web UI, in another terminal
cd web && cp .env.example .env.local && pnpm install && pnpm dev`;

export default function DocsPage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader>
        <SiteNav active="docs" />
      </SiteHeader>

      <div className="mx-auto flex w-full max-w-[1280px] flex-1 gap-12 px-4 sm:px-12">
        <aside className="hidden w-[220px] shrink-0 lg:block">
          <div className="sticky top-0 max-h-screen overflow-y-auto py-10">
            <DocsNav groups={NAV} />
          </div>
        </aside>

        <main className="min-w-0 max-w-[760px] flex-1 py-10 pb-24">
          <details className="mb-8 rounded-xl border border-line bg-surface px-4 py-3 lg:hidden">
            <summary className="cursor-pointer text-sm text-muted">On this page</summary>
            <div className="mt-4">
              <DocsNav groups={NAV} />
            </div>
          </details>

          <Section id="introduction" eyebrow="Getting started" title="Introduction">
            <P>
              Rektopsy explains why a Solana transaction failed. Send it a transaction signature and it
              returns the cause in plain language, the exact fix, whether your funds are safe, and the
              evidence behind every claim: a log line, an instruction, or a balance field.
            </P>
            <P>
              It also checks pasted messages for scams before they cost you anything: send it a DM, tweet,
              email or airdropped token name and it returns the red flags, quoted from the text. See{" "}
              <a href="#post-scam-check" className="no-underline">
                Scam check
              </a>
              .
            </P>
            <Callout>
              <strong className="font-medium text-text">Read-only by design.</strong> Rektopsy never
              connects to a wallet, never signs, and needs no keys. It only reads public transaction data.
            </Callout>
            <dl className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Fact k="Base URL" v={API_URL} />
              <Fact k="Authentication" v="None" />
              <Fact k="Format" v="JSON over HTTPS" />
            </dl>
          </Section>

          <Section id="quickstart" title="Quickstart">
            <P>One request is all it takes. Send a failed signature, get an autopsy back.</P>
            <CodeBlock lang="bash" title="curl" code={CURL} />
            <CodeBlock lang="javascript" title="JavaScript" code={JS} />
            <CodeBlock lang="python" title="Python" code={PYTHON} />
            <P>
              Or skip the API and use the{" "}
              <Link href="/" className="no-underline">
                web app
              </Link>
              , which renders the same response as a full report.
            </P>
          </Section>

          <Section id="how-it-works" title="How it works">
            <P>Every autopsy runs the same deterministic pipeline. Only the last step uses an LLM.</P>
            <ol className="my-5 flex list-none flex-col gap-0 p-0">
              {[
                ["Fetch", "Read the transaction from Solana mainnet with getTransaction (read-only, cached)."],
                ["Parse", "Walk the program log stack to find which program failed first, and with which numbers."],
                ["Decode", "Name the error: program log, runtime error, known error table, or the program's on-chain Anchor IDL. Otherwise it is \"unknown\"."],
                ["Fix", "Pick the category and compute every fix value in Python, each from a documented rule."],
                ["Explain", "An LLM turns those facts into three sentences: cause, fix, funds."],
                ["Verify", "Reject the prose if it contains any number that is not in the facts. Retry once, then fall back to a template."],
              ].map(([name, body], i) => (
                <li key={name} className="flex gap-4 border-l border-line pb-5 pl-5 last:pb-0">
                  <span className="-ml-[29px] flex size-[17px] shrink-0 items-center justify-center rounded-full border border-line bg-bg font-mono text-[10px] text-fail">
                    {i + 1}
                  </span>
                  <div>
                    <div className="text-[15px] font-medium">{name}</div>
                    <div className="mt-1 text-sm leading-[1.6] text-muted">{body}</div>
                  </div>
                </li>
              ))}
            </ol>
            <Callout tone="fix">
              <strong className="font-medium text-text">The core rule:</strong> the LLM never produces a
              number or a fact. It only phrases what Python extracted, and the verifier checks every
              number it writes. Without a Groq key the API still works, with template prose.
            </Callout>
          </Section>

          <Section id="post-autopsy" eyebrow="API reference" title="POST /autopsy">
            <Endpoint method="POST" path="/autopsy" />
            <P>Run an autopsy on one transaction. Requests take about 1 to 3 seconds.</P>
            <H3>Request body</H3>
            <Fields
              rows={[
                ["signature", "string", "Required. The transaction signature: 86 to 88 base58 characters. Surrounding whitespace is ignored."],
                ["prose", "boolean", "Optional, default true. false skips the LLM and returns template prose, faster and with 0 tokens; every fact is identical. Share cards use this."],
              ]}
            />
            <H3>Example response</H3>
            <P>Trimmed for length; … marks omitted fields.</P>
            <CodeBlock lang="json" title="200 OK" code={RESPONSE} />
          </Section>

          <Section id="response" title="Response object">
            <H3>Top-level fields</H3>
            <Fields
              rows={[
                ["signature", "string", "The signature you sent."],
                ["category", "string", "What kind of failure this is. See Categories."],
                ["cause", "string", "Plain-language cause of death."],
                ["fix", "string", "What to change, with the exact value when the chain shows it."],
                ["funds", "string", "Whether funds moved, and the fee that was charged."],
                ["evidence", "object[]", "{ claim, source } for each claim. source is a log line (logs[i]), a transaction field, or the rule a value came from."],
                ["log_lines", "object", "The text of every log line the evidence cites, keyed by index."],
                ["tx", "object | null", "Transaction details for reports. null if it never reached the chain."],
                ["brief", "object", "The structured facts the prose was written from. Use this, not the prose, for anything programmatic."],
                ["meta", "object", "How the prose was produced: mode, attempts, tokens, rejected, latency_ms."],
              ]}
            />
            <H3>tx</H3>
            <Fields
              rows={[
                ["slot, block_time", "number", "Where and when it landed. block_time is Unix seconds."],
                ["failed_instruction", "number | null", "0-based index of the top-level instruction that failed."],
                ["failure_log", "number | null", "Index into logs of the line where it failed."],
                ["steps", "object[]", "One per top-level instruction: index, label, program, program_name, status (ok, failed, not_run)."],
                ["compute_consumed, compute_limit", "number | null", "Compute units used, and the limit if the transaction set one."],
                ["programs_touched", "number", "Distinct programs invoked, including inner calls."],
                ["logs, logs_truncated", "string[], boolean", "The full program log, and whether the RPC cut it short."],
              ]}
            />
            <H3>brief</H3>
            <Fields
              rows={[
                ["cause", "object", "error_name, error_message, custom_code, failing_program, failing_program_name, called_by_program_name, account, resolved_by, source."],
                ["fix", "object", "action, values (every number in the fix), rule (how they were computed), sources, simulated (always false for now)."],
                ["funds", "object", "safe, fee_lamports, fee_sol, summary, source."],
              ]}
            />
            <H3>meta</H3>
            <Fields
              rows={[
                ["mode", "\"llm\" | \"template\"", "llm when the LLM's prose passed the number check; template otherwise."],
                ["attempts, tokens", "number", "LLM calls made (0 to 2) and total tokens used."],
                ["rejected", "object[]", "Drafts the verifier refused: { reason, numbers, text }. Empty when the first draft passed."],
                ["latency_ms", "number", "Server-side time for the whole autopsy."],
              ]}
            />
          </Section>

          <Section id="categories" title="Categories">
            <Fields
              head={["category", "meaning", "fix"]}
              rows={[
                ["slippage", "The price moved past the tolerance you set.", "Jupiter: suggested slippage = min(max(2 × current, 0.5%), 3%). Others: what you'd have received vs your minimum."],
                ["compute_budget", "It ran out of compute units.", "New limit = consumed × 1.5, rounded up to 1,000, capped at 1,400,000."],
                ["insufficient_funds", "Not enough SOL or tokens.", "The exact shortfall, in lamports and SOL, or raw and UI token units."],
                ["account_not_found", "An account it needed doesn't exist yet.", "The account's name, from the program's own error log."],
                ["unknown_custom", "A custom error we can't identify.", "No guess: the error code and program to ask the app about."],
                ["never_landed", "getTransaction returned nothing.", "Resend with a fresh blockhash. No funds moved, no fee charged."],
                ["succeeded", "It didn't fail.", "None."],
                ["other", "A known error with no specific fix yet.", "General guidance only."],
              ]}
            />
            <P>
              Fix values are suggested, not simulated: nothing is replayed against the chain.
            </P>
          </Section>

          <Section id="errors" title="Errors">
            <P>Errors return JSON with a detail field.</P>
            <Fields
              head={["status", "when", "detail"]}
              rows={[
                ["400", "The signature isn't 86 to 88 base58 characters.", "A plain-language message."],
                ["422", "The body has no signature field, or isn't JSON.", "FastAPI validation errors (an array)."],
                ["502", "Solana RPC failed or rate-limited the request.", "What went wrong. Retry after a few seconds."],
                ["400 (/scam-check)", "The text is empty or longer than 5,000 characters.", "A plain-language message."],
              ]}
            />
            <P>
              A transaction that never landed is not an error: it returns 200 with category
              never_landed.
            </P>
          </Section>

          <Section id="other-endpoints" title="Other endpoints">
            <Endpoint method="GET" path="/health" />
            <P>Returns {"{ \"ok\": true }"} when the API is up.</P>
            <Endpoint method="GET" path="/widget.js" />
            <P>The embeddable widget script. Cached for five minutes.</P>
            <Endpoint method="GET" path="/docs" />
            <P>
              Interactive OpenAPI explorer, generated by FastAPI:{" "}
              <a href={`${API_URL}/docs`} className="no-underline">
                {API_URL}/docs
              </a>
              .
            </P>
          </Section>

          <Section id="post-scam-check" eyebrow="Scam check" title="POST /scam-check">
            <Endpoint method="POST" path="/scam-check" />
            <P>
              Check a pasted message for scam red flags: a DM, tweet, email, Telegram message, link, or the
              name of a token or NFT that showed up in a wallet. Requests take well under a second. Nothing
              you send is stored. The same check runs on the{" "}
              <Link href="/check" className="no-underline">
                scam check page
              </Link>
              .
            </P>
            <Callout tone="fix">
              <strong className="font-medium text-text">No LLM here.</strong> The verdict, every red flag
              and every piece of advice come from Python: fixed rules, public phishing lists and a small
              trained model. The verdict is never &quot;safe&quot;: the best one is &quot;no red flags
              found&quot;.
            </Callout>
            <H3>Request body</H3>
            <Fields
              rows={[
                ["text", "string", "Required. The message to check, 1 to 5,000 characters after trimming whitespace."],
              ]}
            />
            <CodeBlock lang="bash" title="curl" code={SCAM_CURL} />
            <H3>Example response</H3>
            <P>A real response, trimmed; … marks omitted items.</P>
            <CodeBlock lang="json" title="200 OK" code={SCAM_RESPONSE} />
          </Section>

          <Section id="scam-response" title="Response object">
            <Fields
              rows={[
                ["verdict", "string", "likely_scam if any serious red flag fired, suspicious if only warning signs did, otherwise no_red_flags."],
                ["headline", "string", "One plain sentence for the verdict."],
                ["advice", "string[]", "What to do, chosen from fixed hand-written lines by the flags that fired."],
                ["red_flags", "object[]", "Each flag: rule, severity (high or medium), title, why, match (the exact words), quote (the sentence around them). start and end are character offsets into the trimmed text, present for text rules only."],
                ["links", "object[]", "Each domain found: host, status (official, lookalike, blocklisted, shortener, unknown), detail, and real (the genuine domain) for look-alikes."],
                ["model", "object", "The trained model's second opinion: score_pct, threshold_pct, flagged, top_words (the words that pushed the score up), trained_on (messages)."],
                ["lists_checked", "string[]", "The phishing lists the links were checked against."],
                ["lists_unavailable", "string[]", "Lists that couldn't be loaded this time. Links are still checked against the rest."],
              ]}
            />
            <P>
              start and end count characters the Python way. In JavaScript, find the match text instead:
              offsets drift after an emoji.
            </P>
          </Section>

          <Section id="scam-rules" title="Red flags">
            <P>Any high flag makes the verdict likely_scam. Medium flags alone make it suspicious.</P>
            <Fields
              head={["rule", "severity", "fires on"]}
              rows={[
                ["secret_request", "high", "Asks for your seed phrase, recovery phrase or private key. Warnings like \"never share your seed phrase\" don't count."],
                ["send_to_get_more", "high", "Send crypto to get more back, or \"double your SOL\"."],
                ["guaranteed_returns", "high", "Guaranteed profits, \"30% daily\", risk-free returns."],
                ["verify_wallet", "high", "Verify, sync, validate or restore your wallet."],
                ["wallet_to_claim", "high", "Connect, approve or sign to claim, mint, migrate or keep something."],
                ["mixed_alphabets", "high", "A word mixing English letters with Cyrillic or Greek look-alikes (\"Rауdium\")."],
                ["lookalike_link", "high", "A domain imitating a real one: swapped characters (jup1ter.ag), one letter off, a brand name on another site, or punycode."],
                ["blocklisted_link", "high", "A domain on Phantom's, MetaMask's or ScamSniffer's phishing list."],
                ["airdrop_link", "high", "Airdrop, reward or claim wording plus a site that isn't official: how spam tokens and NFTs lure you."],
                ["impersonation", "medium", "Claims to be support, staff, a moderator or the team."],
                ["unsolicited_help", "medium", "\"DM me\", offers to recover your funds, \"we noticed your…\"."],
                ["fake_threat", "medium", "Your wallet is compromised, locked, or about to be liquidated."],
                ["free_reward", "medium", "Unclaimed rewards, \"you're eligible\", free airdrops."],
                ["visit_to_claim", "medium", "Visit the site to claim, mint or use a whitelist."],
                ["urgency", "medium", "Deadlines and scarcity: \"expires in 1 hour\", \"only 500 spots left\"."],
                ["shortened_link", "medium", "A link shortener such as bit.ly that hides the address."],
                ["model", "medium", "The trained model scored the text at or above its threshold. It can make a verdict suspicious, never likely_scam."],
              ]}
            />
            <P>
              Phishing lists are downloaded when the API starts and refreshed daily. A link on no list
              shows status unknown: that isn&apos;t proof it&apos;s safe.
            </P>
          </Section>

          <Section id="scam-accuracy" title="Accuracy">
            <Fields
              head={["test set", "scams flagged", "normal flagged"]}
              rows={[
                ["General scams held out from training (Discord, SMS)", "143 / 166", "11 / 1,614"],
                ["Real Solana scams, blind", "14 / 32", "0 / 607"],
                ["Real Solana scams, after rules added for the misses", "21 / 32", "0 / 607"],
              ]}
            />
            <P>
              The blind row is the honest number: those 32 real messages were collected from news and
              security write-ups without looking at the rules. The last row was tuned on the same messages.
              Most remaining misses are posts from hacked celebrity and brand accounts, where the text looks
              normal and the scam is the hack itself. Sources and the full test set are in the README.
            </P>
          </Section>

          <Section id="widget" eyebrow="Widget" title="Embed the widget">
            <P>
              Add Rektopsy to any site with one script tag. The widget lives in a shadow root, so your
              CSS can&apos;t break it and its CSS can&apos;t leak into your page. It inserts API data as
              text only, never as HTML.
            </P>
            <CodeBlock lang="html" title="HTML" code={WIDGET_HTML} />
          </Section>

          <Section id="widget-attributes" title="Attributes">
            <Fields
              head={["attribute", "default", "description"]}
              rows={[
                ["signature", "none", "Run immediately for this signature. Without it, the widget shows an input box. Changing it reruns."],
                ["api", "the script's origin", "Where to send requests. Only needed if you host widget.js somewhere else."],
                ["report", "none", "Your Rektopsy web UI. Adds a \"Full autopsy\" link to /report?sig=…; otherwise it links to Solana Explorer."],
                ["theme", "dark", "Only dark for now."],
              ]}
            />
            <Callout>
              The widget&apos;s retry button is a disabled preview. Rektopsy is read-only, so users change
              the setting in their own wallet or app.
            </Callout>
          </Section>

          <Section id="widget-attach" title="Rektopsy.attach()">
            <P>Prefer code over markup? attach() creates the element, appends it, and returns it.</P>
            <CodeBlock lang="javascript" title="JavaScript" code={WIDGET_ATTACH} />
          </Section>

          <Section id="widget-events" title="Events">
            <P>All events bubble out of the shadow root, so you can listen on document.</P>
            <Fields
              head={["event", "detail", "fires when"]}
              rows={[
                ["rektopsy:result", "the autopsy JSON", "An autopsy finished."],
                ["rektopsy:error", "{ message }", "The signature was invalid or the API failed."],
                ["rektopsy:dismiss", "none", "The reader closed the widget."],
              ]}
            />
            <CodeBlock lang="javascript" title="JavaScript" code={WIDGET_EVENTS} />
          </Section>

          <Section id="self-hosting" eyebrow="Operations" title="Self-hosting">
            <P>
              Rektopsy is open source under the MIT license. You need uv (Python 3.11) for the API, and
              Node.js 20.9+ with pnpm for the web UI.
            </P>
            <CodeBlock lang="bash" title="Terminal" code={SELF_HOST} />
            <Fields
              head={["variable", "default", "purpose"]}
              rows={[
                ["SOLANA_RPC_URL", "api.mainnet-beta.solana.com", "Any mainnet RPC. The public one is rate-limited."],
                ["GROQ_API_KEY", "none", "Enables LLM prose. Free at console.groq.com."],
                ["GROQ_MODEL", "openai/gpt-oss-120b", "Groq model override."],
                ["REKTOPSY_CORS_ORIGINS", "*", "Comma-separated origins allowed to call the API."],
                ["NEXT_PUBLIC_API_URL", "http://localhost:8000", "Web UI only: where it finds the API. Set before building."],
              ]}
            />
          </Section>

          <Section id="limits" title="Limits">
            <ul className="my-4 flex list-none flex-col gap-3 p-0 text-[15px] leading-[1.65] text-text-2">
              {[
                "Mainnet only. Transactions are read from Solana mainnet-beta.",
                "The hosted API runs on a free plan: after 15 idle minutes, the first request can take up to a minute while it wakes.",
                "Solana's public RPC rate-limits heavy use. The API backs off and retries, then returns 502.",
                "Fixes are suggested, not simulated.",
                "Token amounts are in raw units (the token's smallest unit) when the token's decimals aren't known.",
                "Coverage matches the programs Rektopsy has been tested on. Other programs fall back to their on-chain Anchor IDL, or to unknown_custom.",
                "The scam check reads text only. It can't tell that an account was hacked, and a link on no list isn't proof it's safe.",
              ].map((t) => (
                <li key={t} className="flex gap-3">
                  <span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-faint" />
                  {t}
                </li>
              ))}
            </ul>
          </Section>
        </main>
      </div>

      <footer className="border-t border-line px-4 py-6 text-xs text-faint sm:px-12">
        Read-only: no wallet connection, no signing, no keys. We only read public transaction data.
      </footer>
    </div>
  );
}

function Section({ id, eyebrow, title, children }: { id: string; eyebrow?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 border-b border-line pt-10 pb-10 first:pt-0 last:border-0">
      {eyebrow && <div className="eyebrow mb-3 !text-fail">{eyebrow}</div>}
      <h2 className="m-0 font-serif text-[36px] leading-[1.1] font-normal">
        <a href={`#${id}`} className="!text-text no-underline">
          {title}
        </a>
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function H3({ children }: { children: ReactNode }) {
  return <h3 className="mt-8 mb-3 text-[15px] font-medium">{children}</h3>;
}

function P({ children }: { children: ReactNode }) {
  return <p className="my-3 text-[15px] leading-[1.7] text-text-2">{children}</p>;
}

function Callout({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "fix" }) {
  return (
    <div
      className={`my-5 rounded-xl border px-4 py-3.5 text-sm leading-[1.65] ${
        tone === "fix" ? "border-fix-border bg-fix-bg text-fix-body" : "border-line bg-surface text-muted"
      }`}
    >
      {children}
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <dt className="eyebrow">{k}</dt>
      <dd className="m-0 mt-1.5 font-mono text-[13px] break-all">{v}</dd>
    </div>
  );
}

function Endpoint({ method, path }: { method: "GET" | "POST"; path: string }) {
  return (
    <div className="my-4 flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 font-mono text-sm">
      <span
        className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
          method === "POST" ? "bg-fail-bg text-fail-text" : "bg-fix-bg text-fix-text"
        }`}
      >
        {method}
      </span>
      <span className="break-all">
        <span className="text-faint">{API_URL}</span>
        {path}
      </span>
    </div>
  );
}

function Fields({ rows, head = ["field", "type", "description"] }: { rows: string[][]; head?: string[] }) {
  // The middle column is code-like (types, defaults) in some tables and prose in others.
  const codeCol = ["type", "default", "detail"].includes(head[1]);
  return (
    <div className="my-4 overflow-x-auto rounded-xl border border-line">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="bg-surface">
            {head.map((h) => (
              <th key={h} className="eyebrow border-b border-line px-4 py-2.5 font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0]} className="border-b border-line-2 last:border-0">
              <td className="px-4 py-3 align-top font-mono text-[12.5px] whitespace-nowrap text-text">{r[0]}</td>
              <td
                className={`px-4 py-3 align-top ${codeCol ? "font-mono text-[12px] text-fix-text" : "leading-[1.6] text-text-2"}`}
              >
                {r[1]}
              </td>
              <td className="px-4 py-3 align-top leading-[1.6] text-muted">{r[2]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
