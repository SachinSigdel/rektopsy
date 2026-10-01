"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Animated embed demo for the landing page: types a snippet, then "runs" it in a
// preview with a mock of the widget. The result shown is a real autopsy (the
// Raydium slippage example in eval case06), not invented copy.

type Tok = { t: string; c?: string };
type Variant = { tab: string; file: string; host: string; tokens: Tok[] };

const TAG = "text-[#e8703a]";
const ATTR = "text-[#7fc9ba]";
const STR = "text-[#d6c9a8]";
const KW = "text-[#c49be0]";
const COM = "text-[#6f6c65]";

function variants(api: string): Variant[] {
  return [
    {
      tab: "HTML",
      file: "index.html",
      host: "explorer.example/tx/2KhUjNQs…",
      tokens: [
        { t: "<script", c: TAG }, { t: " src", c: ATTR }, { t: "=" }, { t: `"${api}/widget.js"`, c: STR },
        { t: " defer", c: ATTR }, { t: "></script>", c: TAG }, { t: "\n\n" },
        { t: "<!-- explain the failure right on the tx page -->", c: COM }, { t: "\n" },
        { t: "<rektopsy-autopsy", c: TAG }, { t: "\n  signature", c: ATTR }, { t: "=" },
        { t: '"2KhUjNQsVikHC6Jnpig…YM9h32c94zX"', c: STR }, { t: ">", c: TAG }, { t: "\n" },
        { t: "</rektopsy-autopsy>", c: TAG },
      ],
    },
    {
      tab: "JavaScript",
      file: "swap-panel.js",
      host: "dex.example/swap",
      tokens: [
        { t: "// show it where the swap failed", c: COM }, { t: "\n" },
        { t: "const", c: KW }, { t: " el = Rektopsy." }, { t: "attach", c: ATTR }, { t: "({\n" },
        { t: "  sig: failedSignature,\n" },
        { t: "  target: " }, { t: '"#swap-panel"', c: STR }, { t: ",\n});\n" },
        { t: "el." }, { t: "addEventListener", c: ATTR }, { t: "(" }, { t: '"rektopsy:result"', c: STR },
        { t: ", (e) =>\n  console." }, { t: "log", c: ATTR }, { t: "(e.detail.category));" },
      ],
    },
  ];
}

type Phase = "typing" | "loading" | "result";

// Timeline per example, in ms. Driven by elapsed time, not by counting ticks, so a
// throttled background tab catches up instead of stalling.
const MS_PER_CHAR = 11;
const PAUSE = 900;
const LOADING = 1300;
const HOLD = 5200;

export default function EmbedDemo({ apiUrl }: { apiUrl: string }) {
  const all = useMemo(() => variants(apiUrl), [apiUrl]);
  const [v, setV] = useState(0);
  const [phase, setPhase] = useState<Phase>("typing");
  const [typed, setTyped] = useState(0);
  const [auto, setAuto] = useState(true);
  const [reduced, setReduced] = useState(false);

  const variant = all[v];
  const total = variant.tokens.reduce((n, tok) => n + tok.t.length, 0);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const cycleStart = useRef(0);

  // The timeline: type the code, run it, show the result, move to the next example.
  useEffect(() => {
    if (!auto) return;
    cycleStart.current = performance.now();
    const typeMs = total * MS_PER_CHAR;
    const tick = () => {
      if (reduced) {
        setTyped(total);
        setPhase("result");
        return;
      }
      const e = performance.now() - cycleStart.current;
      if (e < typeMs) {
        setTyped(Math.floor(e / MS_PER_CHAR));
        setPhase("typing");
      } else if (e < typeMs + PAUSE) {
        setTyped(total);
        setPhase("typing");
      } else if (e < typeMs + PAUSE + LOADING) {
        setTyped(total);
        setPhase("loading");
      } else if (e < typeMs + PAUSE + LOADING + HOLD) {
        setPhase("result");
      } else {
        setTyped(0);
        setPhase("typing");
        setV((i) => (i + 1) % all.length);
      }
    };
    const id = setInterval(tick, 30);
    return () => clearInterval(id);
  }, [auto, reduced, total, all.length, v]);

  const showPreview = phase !== "typing";

  function pick(i: number, preview: boolean) {
    setAuto(false);
    setV(i);
    setTyped(all[i].tokens.reduce((n, tok) => n + tok.t.length, 0));
    setPhase(preview ? "result" : "typing");
  }

  return (
    <div className="mt-2 overflow-hidden rounded-[13px] border border-line-2 bg-[#0f1114]">
      {/* window chrome + tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line-2 px-3 py-2">
        <span className="mr-1 flex gap-1.5" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-[#3a2a24]" />
          <span className="size-2.5 rounded-full bg-[#2f2c25]" />
          <span className="size-2.5 rounded-full bg-[#22302d]" />
        </span>
        {all.map((x, i) => (
          <button
            key={x.tab}
            type="button"
            onClick={() => pick(i, false)}
            className={`cursor-pointer rounded-md border-0 px-2.5 py-1 font-mono text-[11px] transition-colors ${
              v === i && !showPreview ? "bg-surface-2 text-text" : "bg-transparent text-faint hover:text-muted"
            }`}
          >
            {x.file}
          </button>
        ))}
        <button
          type="button"
          onClick={() => pick(v, true)}
          className={`flex cursor-pointer items-center gap-1.5 rounded-md border-0 px-2.5 py-1 font-mono text-[11px] transition-colors ${
            showPreview ? "bg-surface-2 text-text" : "bg-transparent text-faint hover:text-muted"
          }`}
        >
          <span className={`size-1.5 rounded-full ${showPreview ? "bg-fix" : "bg-faint"}`} />
          Preview
        </button>
        {!auto && (
          <button
            type="button"
            onClick={() => {
              setTyped(0);
              setPhase("typing");
              setAuto(true);
            }}
            className="ml-auto cursor-pointer rounded-md border border-line bg-transparent px-2 py-0.5 font-mono text-[10.5px] text-muted hover:text-text"
          >
            ▶ Replay
          </button>
        )}
      </div>

      <div className="relative h-[352px]">
        {/* code */}
        <pre
          aria-label={`${variant.tab} embed code`}
          className={`absolute inset-0 m-0 overflow-hidden px-4 py-3.5 font-mono text-[11.5px] leading-[1.8] break-all whitespace-pre-wrap text-text-2 transition-opacity duration-300 ${
            showPreview ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
        >
          <Typed tokens={variant.tokens} count={typed} />
          {!showPreview && <span className="ml-px inline-block h-[13px] w-[7px] translate-y-[2px] animate-pulse bg-fail" />}
        </pre>

        {/* preview: a host page with the widget rendered into it */}
        <div
          aria-hidden={!showPreview}
          className={`absolute inset-0 flex flex-col transition-opacity duration-300 ${
            showPreview ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          <div className="mx-3 mt-3 flex items-center gap-2 rounded-md bg-[#15171a] px-2.5 py-1 font-mono text-[10.5px] text-faint">
            <span aria-hidden="true">🔒</span>
            {variant.host}
          </div>
          <div className="flex flex-1 gap-4 overflow-hidden px-4 pt-3">
            <div className="hidden flex-1 flex-col gap-2 pt-1 sm:flex" aria-hidden="true">
              <div className="h-2.5 w-2/3 rounded bg-[#1d2024]" />
              <div className="h-2 w-full rounded bg-[#17191c]" />
              <div className="h-2 w-5/6 rounded bg-[#17191c]" />
              <div className="mt-2 rounded-lg border border-fail-border bg-fail-bg px-2.5 py-2 font-mono text-[10px] text-fail-text">
                {v === 0 ? "Status: failed · custom program error: 0x1e" : "Swap failed. Try again?"}
              </div>
              <div className="h-2 w-3/4 rounded bg-[#17191c]" />
              <div className="h-2 w-1/2 rounded bg-[#17191c]" />
            </div>
            <MockWidget phase={phase} />
          </div>
          {v === 1 && phase === "result" && (
            <div className="border-t border-line-2 px-4 py-1.5 font-mono text-[10.5px] text-log">
              <span className="text-faint">console ›</span> slippage
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Typed({ tokens, count }: { tokens: Tok[]; count: number }) {
  const out = [];
  let left = count;
  for (let i = 0; i < tokens.length && left > 0; i++) {
    const text = tokens[i].t.slice(0, left);
    left -= text.length;
    out.push(
      <span key={i} className={tokens[i].c}>
        {text}
      </span>,
    );
  }
  return <>{out}</>;
}

function MockWidget({ phase }: { phase: Phase }) {
  const done = phase === "result";
  return (
    <div
      className={`flex w-full max-w-[290px] shrink-0 flex-col gap-2.5 self-start rounded-xl border border-line bg-surface p-3.5 transition-all duration-500 ${
        phase === "typing" ? "translate-y-3 opacity-0" : "translate-y-0 opacity-100"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-[12.5px] font-medium">
          <span className="size-1.5 rounded-full bg-fail" />
          {done ? "Your swap didn’t go through" : "Why did my transaction fail?"}
        </span>
        <span className="text-[11px] text-faint">✕</span>
      </div>
      {!done ? (
        <div className="flex flex-col gap-2 py-1">
          <span className="text-[11px] text-muted">Reading the transaction from Solana…</span>
          <div className="h-2 w-full animate-pulse rounded bg-[#1d2024]" />
          <div className="h-2 w-4/5 animate-pulse rounded bg-[#1d2024]" />
          <div className="h-10 w-full animate-pulse rounded-lg bg-[#13191a]" />
        </div>
      ) : (
        <>
          <p className="m-0 text-[11.5px] leading-[1.55] text-text-2">
            Raydium AMM v4 stopped the swap: the price moved past your slippage limit. Your funds are safe.
          </p>
          <div className="rounded-lg border border-fix-border bg-fix-bg px-2.5 py-2">
            <div className="font-mono text-[9px] tracking-[1.2px] text-fix-text uppercase">Suggested fix</div>
            <div className="mt-1 text-[11px] leading-[1.5] text-fix-body">
              Retry with a fresh quote, or lower your minimum: you were short by 0.03%.
            </div>
          </div>
          <div className="flex flex-col gap-1 font-mono text-[10.5px]">
            <Row k="Fee paid" v="0.000071794 SOL" />
            <Row k="Tokens lost" v="none" good />
            <Row k="Error" v="0x1e" />
          </div>
        </>
      )}
    </div>
  );
}

function Row({ k, v, good = false }: { k: string; v: string; good?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="font-sans text-muted">{k}</span>
      <span className={good ? "text-fix-text" : ""}>{v}</span>
    </div>
  );
}
