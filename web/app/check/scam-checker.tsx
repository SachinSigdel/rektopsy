"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { fetchScamCheck, type ScamCheck } from "@/lib/api";

// Written to show each verdict; not real messages.
const EXAMPLES = [
  {
    label: "fake support",
    text: "Hi, I'm from Phantom support. We noticed an issue with your wallet. Please share your 12-word recovery phrase so we can fix it.",
  },
  {
    label: "fake airdrop",
    text: "Congrats! You're eligible for the JUP airdrop. Connect your wallet at https://jup1ter.ag/claim before it expires in 1 hour.",
  },
  {
    label: "normal question",
    text: "My swap on Jupiter failed with a slippage error. What slippage should I use?",
  },
];

const MAX = 5000;

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; text: string; data: ScamCheck };

export default function ScamChecker() {
  const [text, setText] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });
  const controller = useRef<AbortController | null>(null);

  async function run(value: string) {
    value = value.trim();
    if (!value) {
      setState({ status: "error", message: "Paste a message or link to check." });
      return;
    }
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    setState({ status: "loading" });
    try {
      const data = await fetchScamCheck(value, c.signal);
      setState({ status: "done", text: value, data });
    } catch (e) {
      if ((e as Error).name !== "AbortError") setState({ status: "error", message: (e as Error).message });
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    run(text);
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={onSubmit} className="flex max-w-[720px] flex-col gap-3">
        <label htmlFor="msg" className="font-mono text-xs tracking-[1px] text-muted uppercase">
          Message or link
        </label>
        <textarea
          id="msg"
          value={text}
          maxLength={MAX}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run(text);
          }}
          placeholder="Paste the message you received"
          rows={5}
          className="min-h-[140px] resize-y rounded-xl border border-line bg-surface px-[18px] py-4 text-[15px] leading-[1.55] text-text outline-none placeholder:text-faint focus:border-muted"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-[13px] text-faint">Try one:</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                type="button"
                onClick={() => {
                  setText(ex.text);
                  run(ex.text);
                }}
                className="h-8 rounded-lg border border-line bg-transparent px-3 font-mono text-xs text-muted hover:border-muted hover:text-text"
              >
                {ex.label}
              </button>
            ))}
          </div>
          <button
            type="submit"
            disabled={state.status === "loading"}
            className="h-12 rounded-xl bg-fail px-7 text-[15px] font-medium text-fail-ink hover:bg-fail-hover disabled:opacity-60"
          >
            {state.status === "loading" ? "Checking…" : "Check message"}
          </button>
        </div>
      </form>

      {state.status === "error" && (
        <p role="alert" className="m-0 text-sm text-fail-text">
          {state.message}
        </p>
      )}
      {state.status === "done" && <Result text={state.text} r={state.data} />}
    </div>
  );
}

const TONE = {
  likely_scam: { label: "Likely scam", pill: "border-fail-border bg-fail-bg text-fail-text", dot: "bg-fail" },
  suspicious: { label: "Suspicious", pill: "border-fail-border bg-fail-step-bg text-fail-text", dot: "bg-fail" },
  no_red_flags: { label: "No red flags", pill: "border-line bg-surface-2 text-muted", dot: "bg-muted" },
} as const;

const LINK_LABEL = {
  official: "official",
  blocklisted: "known phishing",
  lookalike: "look-alike",
  shortener: "shortened",
  unknown: "not on any list",
} as const;

function Result({ text, r }: { text: string; r: ScamCheck }) {
  const tone = TONE[r.verdict];
  const ruleFlags = r.red_flags.filter((f) => f.rule !== "model");
  return (
    <div className="flex flex-col gap-6 lg:flex-row" aria-live="polite">
      <div className="flex min-w-0 flex-col gap-5 lg:w-[752px] lg:shrink-0">
        <section className="flex flex-col gap-[18px] rounded-[18px] border border-line bg-surface p-6 sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <span className="eyebrow">Verdict</span>
            <span className={`inline-flex h-[30px] items-center gap-2 rounded-lg border px-3 text-[13px] ${tone.pill}`}>
              <span className={`size-1.5 rounded-full ${tone.dot}`} />
              {tone.label}
            </span>
          </div>
          <h2 className="m-0 font-serif text-[32px] leading-[1.14] font-normal sm:text-[40px]">{r.headline}</h2>
          <Highlighted text={text} r={r} />
        </section>

        {ruleFlags.length > 0 && (
          <section className="flex flex-col gap-4 rounded-[18px] border border-line bg-surface px-6 py-7 sm:px-8">
            <span className="eyebrow">Red flags · {ruleFlags.length}</span>
            <ul className="m-0 flex list-none flex-col gap-4 p-0">
              {ruleFlags.map((f) => (
                <li key={f.rule} className="flex gap-3">
                  <span
                    className={`mt-[7px] size-2 shrink-0 rounded-full ${f.severity === "high" ? "bg-fail" : "border border-fail"}`}
                    title={f.severity === "high" ? "serious" : "warning sign"}
                  />
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <span className="text-[15px] font-medium">{f.title}</span>
                    <span className="text-sm leading-[1.55] text-muted">{f.why}</span>
                    {f.quote && (
                      <q className="border-l-2 border-fail-border pl-3 font-mono text-[12.5px] leading-[1.6] break-words text-fail-detail">
                        {f.quote}
                      </q>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <section className="flex flex-col gap-3.5 rounded-[18px] border border-fix-border bg-fix-bg p-6">
          <span className="eyebrow !text-fix-text">What to do</span>
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {r.advice.map((a) => (
              <li key={a} className="flex gap-2.5 text-[14.5px] leading-[1.55] text-fix-body">
                <span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-fix" />
                {a}
              </li>
            ))}
          </ul>
        </section>

        {r.links.length > 0 && (
          <Panel title={`Links · ${r.links.length}`}>
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {r.links.map((l) => (
                <li key={l.host} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate font-mono text-[13px]">{l.host}</span>
                    <span
                      className={`shrink-0 rounded-md px-2 py-0.5 font-mono text-[11px] ${
                        l.status === "official"
                          ? "bg-fix-bg text-fix-text"
                          : l.status === "unknown"
                            ? "bg-surface-2 text-muted"
                            : "bg-fail-bg text-fail-text"
                      }`}
                    >
                      {LINK_LABEL[l.status]}
                    </span>
                  </div>
                  <span className="text-[13px] text-faint">{l.detail}</span>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        <Panel title="Second opinion: trained model">
          <div className="flex items-baseline gap-2">
            <span className="font-serif text-[36px] leading-none">{r.model.score_pct}%</span>
            <span className="text-[13px] text-muted">
              scam-like · flags from {r.model.threshold_pct}%
            </span>
          </div>
          {r.model.flagged && r.model.top_words.length > 0 && (
            <p className="m-0 text-[13px] leading-[1.55] text-muted">
              Words that pushed it up:{" "}
              {r.model.top_words.map((w, i) => (
                <span key={w}>
                  {i > 0 && ", "}
                  <span className="font-mono text-text-2">{w}</span>
                </span>
              ))}
            </p>
          )}
          <p className="m-0 text-xs leading-[1.55] text-faint">
            Trained on {r.model.trained_on.toLocaleString("en-US")} labeled messages. It can raise a warning but never
            decides a verdict on its own.
          </p>
        </Panel>

        <p className="m-0 text-xs leading-[1.6] text-faint">
          Links checked against {r.lists_checked.join(", ") || "no lists"}.
          {r.lists_unavailable.length > 0 && ` Couldn't load ${r.lists_unavailable.join(", ")} this time.`}
        </p>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3.5 rounded-[18px] border border-line bg-surface p-6">
      <span className="eyebrow">{title}</span>
      {children}
    </section>
  );
}

// The pasted message with every flagged span marked, so the evidence is visible in place.
function Highlighted({ text, r }: { text: string; r: ScamCheck }) {
  // Find spans by their matched text: the API's offsets count characters the
  // Python way, which drifts from JavaScript's after an emoji.
  const spans: [number, number][] = [];
  const lower = text.toLowerCase();
  const mark = (needle: string) => {
    const i = needle ? lower.indexOf(needle.toLowerCase()) : -1;
    if (i >= 0) spans.push([i, i + needle.length]);
  };
  for (const f of r.red_flags) if (f.start != null) mark(f.match);
  for (const l of r.links) if (l.status !== "official" && l.status !== "unknown") mark(l.host);
  spans.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [s, e] of spans) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  const parts: ReactNode[] = [];
  let at = 0;
  merged.forEach(([s, e], i) => {
    if (s > at) parts.push(text.slice(at, s));
    parts.push(
      <mark key={i} className="rounded-[3px] bg-fail-bg px-0.5 text-fail-text">
        {text.slice(s, e)}
      </mark>,
    );
    at = e;
  });
  parts.push(text.slice(at));
  return (
    <blockquote className="m-0 rounded-xl border border-line-2 bg-bg px-[18px] py-4 text-[15px] leading-[1.65] break-words whitespace-pre-wrap text-text-2">
      {parts}
    </blockquote>
  );
}
