"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { fetchAutopsy, type Autopsy, type Step } from "@/lib/api";
import { condenseLog, label, shortId, timeAgo } from "@/lib/format";
import { cardFacts, HEADLINES } from "@/lib/share";
import { SiteHeader, SoonButton } from "../components/brand";

type Result = { sig: string } & ({ status: "error"; message: string } | { status: "done"; data: Autopsy });
type State = { status: "loading" } | Result;

export default function Report() {
  const sig = (useSearchParams().get("sig") ?? "").trim();
  const [result, setResult] = useState<Result | null>(null);
  // A result for a different signature means this one is still loading.
  const state: State = result && result.sig === sig ? result : { status: "loading" };

  useEffect(() => {
    if (!sig) return;
    const controller = new AbortController();
    fetchAutopsy(sig, controller.signal)
      .then((data) => setResult({ sig, status: "done", data }))
      .catch((e: Error) => {
        if (e.name !== "AbortError") setResult({ sig, status: "error", message: e.message });
      });
    return () => controller.abort();
  }, [sig]);

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader>
        {state.status === "done" && <ShareButton />}
        <Link
          href="/"
          className="flex h-11 items-center rounded-[10px] border border-line bg-surface-2 px-5 text-sm !text-text no-underline"
        >
          New autopsy
        </Link>
      </SiteHeader>

      {!sig ? (
        <Notice>
          No signature given. <Link href="/">Run an autopsy</Link> first.
        </Notice>
      ) : state.status === "loading" ? (
        <Notice>
          <span className="font-mono text-xs break-all text-faint">{sig}</span>
          <br />
          Reading the transaction from Solana…
        </Notice>
      ) : state.status === "error" ? (
        <Notice alert>
          {state.message} <Link href="/">Try another signature</Link>.
        </Notice>
      ) : (
        <ReportBody r={state.data} />
      )}

      <footer className="mt-auto border-t border-line px-4 py-6 text-xs text-faint sm:px-12">
        Read-only: no wallet connection, no signing, no keys. We only read public transaction data.
      </footer>
    </div>
  );
}

function Notice({ children, alert = false }: { children: ReactNode; alert?: boolean }) {
  return (
    <p
      role={alert ? "alert" : undefined}
      className={`mx-4 mt-10 max-w-[752px] rounded-xl border px-5 py-4 text-sm leading-relaxed sm:mx-12 ${
        alert ? "border-fail-border bg-fail-bg text-fail-text" : "border-line bg-surface text-muted"
      }`}
    >
      {children}
    </p>
  );
}

function ShareButton() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          window.prompt("Copy this link:", window.location.href);
        }
      }}
      className="h-11 cursor-pointer rounded-[10px] border border-line bg-transparent px-[18px] text-sm text-muted hover:text-text"
    >
      {copied ? "Link copied" : "Share report"}
    </button>
  );
}

function ReportBody({ r }: { r: Autopsy }) {
  const failed = r.category !== "succeeded";
  const landed = r.tx !== null;
  const cause = r.brief.cause ?? {};
  const values = Object.entries(r.brief.fix?.values ?? {}).filter(([, v]) => v !== null && v !== "");
  const failedIx = r.tx?.failed_instruction ?? null;

  const chips = [
    cause.error_name,
    cause.custom_code != null ? `custom error 0x${cause.custom_code.toString(16)}` : null,
    failedIx != null ? `instruction ${failedIx + 1}` : null,
  ].filter(Boolean) as string[];

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pt-7 sm:px-12">
        <StatusPill category={r.category} />
        <span className="max-w-full font-mono text-[13px] break-all text-muted">{r.signature}</span>
        {r.tx && (
          <span className="text-[13px] text-faint">
            slot {r.tx.slot.toLocaleString("en-US")}
            {r.tx.block_time != null && (
              <span title={new Date(r.tx.block_time * 1000).toISOString()}> · {timeAgo(r.tx.block_time)}</span>
            )}
          </span>
        )}
        <a
          href={`https://explorer.solana.com/tx/${r.signature}`}
          target="_blank"
          rel="noreferrer"
          className="text-[13px] !text-faint underline decoration-line underline-offset-4 hover:!text-text"
        >
          Solana Explorer ↗
        </a>
      </div>

      <div className="flex flex-col gap-6 px-4 pt-6 pb-10 sm:px-12 lg:flex-row">
        <div className="flex min-w-0 flex-col gap-5 lg:w-[752px] lg:shrink-0">
          <section className="flex flex-col gap-[18px] rounded-[18px] border border-line bg-surface p-6 sm:p-8">
            <span className="eyebrow">{failed ? "Cause of death" : "What happened"}</span>
            <h2 className="m-0 font-serif text-[32px] leading-[1.14] font-normal sm:text-[40px]">
              {HEADLINES[r.category] ?? HEADLINES.other}
            </h2>
            <p className="m-0 text-base leading-[1.65] text-text-2">{r.cause}</p>
            {chips.length > 0 && (
              <div className="flex flex-wrap gap-2.5">
                {chips.map((c) => (
                  <span
                    key={c}
                    className="inline-flex h-7 items-center rounded-[7px] bg-surface-2 px-[11px] font-mono text-xs text-muted"
                  >
                    {c}
                  </span>
                ))}
              </div>
            )}
          </section>

          {failed && r.fix && <FixCard r={r} />}

          {landed && r.tx && (
            <section className="flex flex-col gap-[18px] rounded-[18px] border border-line bg-surface px-6 py-7 sm:px-8">
              <span className="eyebrow">{failed ? "Where it went wrong" : "What it did"}</span>
              <ol className="m-0 flex list-none flex-col p-0">
                {r.tx.steps.map((s, i) => (
                  <StepRow
                    key={s.index}
                    step={s}
                    last={i === r.tx!.steps.length - 1}
                    detail={s.status === "failed" ? values : []}
                  />
                ))}
              </ol>
            </section>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <Vitals r={r} />
          <SharePanel r={r} />
          <RawLog r={r} />
        </div>
      </div>
    </>
  );
}

// The share card: the same image X/Discord show for this link, plus ways to post it.
function SharePanel({ r }: { r: Autopsy }) {
  const [copied, setCopied] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const facts = cardFacts(r);
  const image = `/api/og?sig=${r.signature}`;
  const pageUrl = typeof window === "undefined" ? "" : `${window.location.origin}/report?sig=${r.signature}`;
  const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(facts.tweet)}&url=${encodeURIComponent(pageUrl)}`;
  const btn =
    "flex h-10 items-center justify-center gap-2 rounded-[10px] px-4 text-[13.5px] no-underline transition-colors";

  return (
    <section className="flex flex-col gap-4 rounded-[18px] border border-line bg-surface p-6">
      <div className="flex items-center justify-between">
        <span className="eyebrow">Share card</span>
        <span className="text-xs text-faint">shows up when you post the link</span>
      </div>
      <div className="relative aspect-[1200/630] overflow-hidden rounded-xl border border-line-2 bg-bg">
        {!loaded && <div className="absolute inset-0 animate-pulse bg-surface-2" />}
        {/* eslint-disable-next-line @next/next/no-img-element -- generated PNG, not a static asset */}
        <img
          src={image}
          alt={`Rektopsy card: ${facts.headline} ${facts.fix ? `Fix: ${facts.fix}.` : ""}`}
          onLoad={() => setLoaded(true)}
          className={`block size-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
        />
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <a href={intent} target="_blank" rel="noreferrer" className={`${btn} bg-fail font-medium !text-fail-ink hover:bg-fail-hover`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M18.9 2H22l-6.8 7.8L23 22h-6.2l-4.9-6.4L6.3 22H3.2l7.3-8.3L1 2h6.4l4.4 5.8zm-1.1 18.1h1.7L6.3 3.8H4.5z" />
          </svg>
          Post on X
        </a>
        <a href={image} download={`rektopsy-${r.signature.slice(0, 8)}.png`} className={`${btn} border border-line !text-text hover:border-muted`}>
          Download image
        </a>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(pageUrl).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          }}
          className={`${btn} cursor-pointer border border-line bg-transparent text-text hover:border-muted`}
        >
          {copied ? "Link copied" : "Copy link"}
        </button>
      </div>
    </section>
  );
}

function StatusPill({ category }: { category: string }) {
  const [text, tone] =
    category === "succeeded"
      ? ["Succeeded", "fix"]
      : category === "never_landed"
        ? ["Never landed", "fail"]
        : ["Failed", "fail"];
  return (
    <span
      className={`inline-flex h-[30px] items-center gap-2 rounded-lg border px-3 text-[13px] ${
        tone === "fix" ? "border-fix-border bg-fix-bg text-fix-text" : "border-fail-border bg-fail-bg text-fail-text"
      }`}
    >
      <span className={`size-1.5 rounded-full ${tone === "fix" ? "bg-fix" : "bg-fail"}`} />
      {text}
    </span>
  );
}

function Check({ color = "var(--fix)", size = 15 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function Cross() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--fail)" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

// The retry button's label, from values Python computed. Wallet retry isn't built yet.
function retryLabel(r: Autopsy): string | null {
  const v = r.brief.fix?.values ?? {};
  switch (r.category) {
    case "slippage":
      return v.suggested_slippage_pct != null ? `Retry with ${v.suggested_slippage_pct}% slippage` : "Retry with a fresh quote";
    case "compute_budget":
      return v.new_cu_limit != null ? `Retry with ${Number(v.new_cu_limit).toLocaleString("en-US")} compute units` : "Retry";
    case "insufficient_funds":
      return "Retry after topping up";
    case "never_landed":
      return "Retry";
    default:
      return null;
  }
}

function FixCard({ r }: { r: Autopsy }) {
  const retry = retryLabel(r);
  return (
    <section className="flex flex-col gap-4 rounded-[18px] border border-fix-border bg-fix-bg px-6 py-7 sm:px-8">
      <div className="flex items-center gap-2.5">
        <Check size={17} />
        <span className="font-mono text-[11px] tracking-[1.4px] text-fix-text uppercase">The fix</span>
      </div>
      <p className="m-0 text-base leading-[1.65] text-fix-body">{r.fix}</p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {retry && (
          <SoonButton className="h-12 rounded-[11px] border-0 bg-fix px-[22px] text-[15px] font-medium text-fix-ink">
            {retry}
          </SoonButton>
        )}
        <span className="text-[13px] text-fix-muted">
          {retry ? "One-click retry is coming. For now, change this in your wallet or app. " : ""}
          {r.brief.fix?.simulated === false && r.category !== "never_landed" ? "Suggested, not simulated." : ""}
        </span>
      </div>
    </section>
  );
}

function StepRow({ step, last, detail }: { step: Step; last: boolean; detail: [string, string | number | null][] }) {
  const title = step.program_name ?? shortId(step.program);
  if (step.status === "failed") {
    return (
      <li className="flex gap-4">
        <div className="flex w-[26px] shrink-0 justify-center pt-[3px]">
          <Cross />
        </div>
        <div className="mb-[18px] flex min-w-0 grow flex-col gap-1.5 rounded-xl border border-fail-step-border bg-fail-step-bg px-[18px] py-4">
          <span className="text-[15px] text-fail-text">
            {title} failed &mdash; instruction {step.index + 1}
          </span>
          {detail.length > 0 && (
            <span className="font-mono text-xs leading-[1.6] break-words text-fail-detail">
              {detail.map(([k, v]) => `${label(k).toLowerCase()} ${v}`).join(" · ")}
            </span>
          )}
        </div>
      </li>
    );
  }
  const notRun = step.status === "not_run";
  return (
    <li className={`flex gap-4 ${notRun ? "opacity-45" : ""}`}>
      <div className="flex w-[26px] shrink-0 flex-col items-center gap-1 pt-[3px]">
        {notRun ? <span className="mt-1.5 size-[7px] rounded-full border border-faint" /> : <Check />}
        {!last && <div className="w-px grow bg-line" />}
      </div>
      <div className="flex min-w-0 grow flex-col gap-1 pb-[18px]">
        <span className="text-[15px]">
          {step.label}
          {notRun && <span className="ml-2 text-xs text-faint">not reached</span>}
        </span>
        <span className="font-mono text-xs break-all text-faint">{step.program}</span>
      </div>
    </li>
  );
}

function Vitals({ r }: { r: Autopsy }) {
  const rows: [string, ReactNode][] = [];
  if (r.tx) {
    rows.push(["Fee paid", `${r.brief.funds.fee_sol ?? "?"} SOL`]);
    if (r.tx.compute_consumed != null) {
      rows.push([
        "Compute used",
        r.tx.compute_limit
          ? `${r.tx.compute_consumed.toLocaleString("en-US")} / ${r.tx.compute_limit.toLocaleString("en-US")}`
          : r.tx.compute_consumed.toLocaleString("en-US"),
      ]);
    }
    rows.push(["Programs touched", String(r.tx.programs_touched)]);
    if (r.category === "succeeded") rows.push(["Result", <span key="r" className="text-fix-text">went through</span>]);
    else
      rows.push([
        "Value lost",
        <span key="v" className="text-fail-text">{r.brief.funds.safe ? "fee only" : "check balances"}</span>,
      ]);
  } else {
    rows.push(["Fee paid", "none"], ["Value lost", <span key="v" className="text-fix-text">nothing</span>]);
  }
  return (
    <section className="flex flex-col gap-4 rounded-[18px] border border-line bg-surface p-6">
      <span className="eyebrow">Vitals</span>
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between gap-4 text-sm">
          <span className="text-muted">{k}</span>
          <span className="text-right font-mono">{v}</span>
        </div>
      ))}
      <div className="h-px bg-line" />
      <p className="m-0 text-[13px] leading-[1.55] text-muted">{r.funds}</p>
    </section>
  );
}

// [start, end) of the log lines belonging to top-level instruction `ix` (each starts at "invoke [1]").
function instructionRange(logs: string[], ix: number | null): [number, number] | null {
  if (ix == null) return null;
  const starts = logs.flatMap((line, i) => (/^Program \w+ invoke \[1\]$/.test(line) ? [i] : []));
  if (ix >= starts.length) return null;
  return [starts[ix], ix + 1 < starts.length ? starts[ix + 1] : logs.length];
}

function RawLog({ r }: { r: Autopsy }) {
  const [copied, setCopied] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const logs = r.tx?.logs ?? [];
  const range = instructionRange(logs, r.tx?.failed_instruction ?? null);
  const [from, to] = showAll || !range ? [0, logs.length] : range;
  const panel = useRef<HTMLDivElement>(null);

  // Bring the first highlighted (cited) line into view inside the log panel.
  useEffect(() => {
    const box = panel.current;
    const hit = box?.querySelector<HTMLElement>("[data-cited]");
    if (box && hit) box.scrollTop = Math.max(0, hit.offsetTop - box.clientHeight / 3);
  }, [from, to]);
  const cited = new Set([...Object.keys(r.log_lines).map(Number), r.tx?.failure_log].filter((n) => n != null));
  const otherSources = r.evidence.filter((e) => !/logs\[\d+\]/.test(e.source));

  return (
    <section className="flex grow flex-col gap-3.5 rounded-[18px] border border-line bg-surface p-6">
      <div className="flex items-center justify-between">
        <span className="eyebrow">Raw program log</span>
        {logs.length > 0 && (
          <button
            type="button"
            aria-label="Copy raw log"
            title={copied ? "Copied" : "Copy raw log"}
            onClick={async () => {
              await navigator.clipboard.writeText(logs.join("\n")).catch(() => {});
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="flex size-[30px] cursor-pointer items-center justify-center rounded-lg border border-line bg-transparent"
          >
            {copied ? (
              <Check size={14} />
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.8"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M5 15V5a2 2 0 0 1 2-2h10" />
              </svg>
            )}
          </button>
        )}
      </div>
      {logs.length > 0 ? (
        <div
          ref={panel}
          className="relative max-h-[520px] overflow-auto rounded-xl border border-line-2 bg-bg p-4 font-mono text-[11.5px] leading-[1.85] text-log"
        >
          {logs.slice(from, to).map((line, j) => {
            const i = from + j;
            return (
              <div
                key={i}
                title={`logs[${i}]: ${line}`}
                data-cited={cited.has(i) || undefined}
                className={`break-all ${cited.has(i) ? "text-fail" : ""}`}
              >
                {condenseLog(line)}
              </div>
            );
          })}
          {r.tx?.logs_truncated && <div className="text-faint">(log truncated by the RPC)</div>}
        </div>
      ) : (
        <p className="m-0 rounded-xl border border-line-2 bg-bg p-4 font-mono text-xs text-log">
          No on-chain record: getTransaction returned null.
        </p>
      )}
      {range && (range[0] > 0 || range[1] < logs.length) && (
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          className="cursor-pointer self-start border-0 bg-transparent p-0 text-xs text-muted underline decoration-line underline-offset-4 hover:text-text"
        >
          {showAll
            ? "Show only the failed instruction"
            : `Showing instruction ${(r.tx?.failed_instruction ?? 0) + 1} (lines ${range[0]}-${range[1] - 1} of ${logs.length}). Show all`}
        </button>
      )}
      <p className="m-0 text-xs leading-[1.55] text-faint">
        Every line in the verdict above traces back to the chain. Highlighted lines are the ones it cites.
      </p>
      {otherSources.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-xs text-faint">
          {otherSources.map((e, i) => (
            <li key={i}>
              <span className="text-muted">{e.claim}:</span>{" "}
              <span className="font-mono break-words">{e.source}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
