"use client";

import { useState, type FormEvent, type ReactNode } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const EXAMPLE = "36V9G2WgBdWsZNdgsb1V2U4jJ9xGfNC5ehv9YeKrGnvhXjKNTgcBoJian5VtRNFBHYegjhbRWtQ1eBwmqXJEgrcg";

type Evidence = { claim: string; source: string };

type Result = {
  signature: string;
  category: string;
  cause: string;
  fix: string;
  funds: string;
  evidence: Evidence[];
  log_lines: Record<string, string>;
  meta: { mode: "llm" | "template"; tokens: number; latency_ms: number };
  brief: {
    fix?: { values?: Record<string, string | number | null>; rule?: string; simulated?: boolean } | null;
    funds: { safe: boolean };
  };
};

const CATEGORY_LABELS: Record<string, string> = {
  slippage: "Price moved too far (slippage)",
  compute_budget: "Ran out of compute",
  insufficient_funds: "Not enough balance",
  account_not_found: "Missing account",
  unknown_custom: "Unidentified error",
  never_landed: "Never reached the chain",
  succeeded: "This transaction didn't fail",
  other: "Other error",
};

// "would_receive_raw" -> "Would receive (raw units)"
function label(key: string): string {
  const units: [string, string][] = [
    ["_raw", " (raw units)"],
    ["_sol", " (SOL)"],
    ["_pct", " (%)"],
    ["_bps", " (bps)"],
    ["_lamports", " (lamports)"],
  ];
  let suffix = "";
  for (const [end, unit] of units) {
    if (key.endsWith(end)) {
      key = key.slice(0, -end.length);
      suffix = unit;
      break;
    }
  }
  const words = key.replace(/_pct_of_/, " % of ").replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1) + suffix;
}

export default function Autopsy() {
  const [signature, setSignature] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function run(sig: string) {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const resp = await fetch(`${API_URL}/autopsy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature: sig }),
      });
      const body = await resp.json();
      if (!resp.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Request failed.");
      setResult(body);
    } catch (e) {
      setError(e instanceof TypeError ? `Can't reach the Rektopsy API at ${API_URL}.` : (e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (signature.trim()) run(signature.trim());
  }

  return (
    <div>
      <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row">
        <input
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          placeholder="Transaction signature"
          spellCheck={false}
          aria-label="Transaction signature"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-4 py-3 font-mono text-sm outline-none placeholder:text-muted focus:border-muted"
        />
        <button
          type="submit"
          disabled={loading || !signature.trim()}
          className="rounded-lg bg-text px-5 py-3 text-sm font-medium text-bg transition-opacity disabled:opacity-40"
        >
          {loading ? "Examining…" : "Run autopsy"}
        </button>
      </form>
      <button
        type="button"
        onClick={() => {
          setSignature(EXAMPLE);
          run(EXAMPLE);
        }}
        className="mt-3 text-sm text-muted underline decoration-line underline-offset-4 hover:text-text"
      >
        Try an example (a Jupiter swap that failed on slippage)
      </button>

      {error && (
        <p role="alert" className="mt-8 rounded-lg border border-fail/40 bg-fail-soft px-4 py-3 text-sm">
          {error}
        </p>
      )}
      {loading && <p className="mt-8 text-sm text-muted">Reading the transaction from Solana…</p>}
      {result && <Report result={result} />}
    </div>
  );
}

function Report({ result }: { result: Result }) {
  const failed = !["succeeded"].includes(result.category);
  const values = Object.entries(result.brief.fix?.values ?? {}).filter(([, v]) => v !== null && v !== "");
  const safe = result.brief.funds.safe;

  return (
    <article className="mt-10 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${failed ? "bg-fail-soft text-fail" : "bg-fix-soft text-fix"}`}
        >
          {CATEGORY_LABELS[result.category] ?? result.category}
        </span>
        <a
          href={`https://explorer.solana.com/tx/${result.signature}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-muted underline decoration-line underline-offset-4 hover:text-text"
        >
          View on Solana Explorer ↗
        </a>
      </div>

      <Section title={failed ? "Cause of death" : "What happened"} tone={failed ? "fail" : "fix"}>
        <p>{result.cause}</p>
      </Section>

      {failed && result.fix && (
        <Section title="The fix" tone="fix">
          <p>{result.fix}</p>
          {values.length > 0 && (
            <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 border-t border-line pt-4 text-sm sm:grid-cols-2">
              {values.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 sm:block">
                  <dt className="text-muted">{label(k)}</dt>
                  <dd className="break-all font-mono">{String(v)}</dd>
                </div>
              ))}
            </dl>
          )}
          {failed && result.brief.fix?.simulated === false && (
            <p className="mt-4 text-xs text-muted">Suggested, not simulated.</p>
          )}
        </Section>
      )}

      <Section title="Your funds" tone={safe ? "fix" : "fail"}>
        <p>{result.funds}</p>
      </Section>

      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="font-serif text-2xl">Evidence</h2>
        <p className="mt-1 text-sm text-muted">Where each claim above comes from.</p>
        <ul className="mt-4 space-y-3 text-sm">
          {result.evidence.map((e, i) => (
            <li key={i} className="border-t border-line pt-3 first:border-0 first:pt-0">
              <span className="text-muted">{e.claim}: </span>
              <span className="font-mono text-xs">{e.source}</span>
              {[...e.source.matchAll(/logs\[(\d+)\]/g)].map(([, n]) =>
                result.log_lines[n] ? (
                  <code
                    key={n}
                    className="mt-2 block overflow-x-auto whitespace-pre rounded-md bg-surface-2 px-3 py-2 font-mono text-xs"
                  >
                    {result.log_lines[n]}
                  </code>
                ) : null,
              )}
            </li>
          ))}
          {result.evidence.length === 0 && <li className="text-muted">No on-chain record to cite.</li>}
        </ul>
      </section>

      <p className="text-xs text-muted">
        {result.meta.mode === "llm"
          ? `Written by an LLM from extracted facts, number-checked · ${result.meta.tokens} tokens`
          : "Written from a template (no LLM)"}{" "}
        · {(result.meta.latency_ms / 1000).toFixed(1)} s
      </p>
    </article>
  );
}

function Section({ title, tone, children }: { title: string; tone: "fail" | "fix"; children: ReactNode }) {
  return (
    <section
      className={`rounded-xl border bg-surface p-5 ${tone === "fail" ? "border-fail/35" : "border-fix/30"}`}
    >
      <h2 className={`font-serif text-2xl ${tone === "fail" ? "text-fail" : "text-fix"}`}>{title}</h2>
      <div className="mt-2 leading-relaxed">{children}</div>
    </section>
  );
}
