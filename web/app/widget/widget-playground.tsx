"use client";

import { useEffect, useRef, useState } from "react";
import { EXAMPLES, SIGNATURE_RE } from "@/lib/api";
import CodeBlock from "../components/code-block";

type Mode = "signature" | "input";
type LogLine = { at: string; text: string; tone: "ok" | "fail" | "muted" };

// Loads the real widget script from the API once per page.
function useWidgetScript(apiUrl: string): "loading" | "ready" | "error" {
  // Starts as "loading" on server and client alike, so hydration matches.
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    if (customElements.get("rektopsy-autopsy")) {
      // Already defined (client-side navigation back to this page).
      queueMicrotask(() => setState("ready"));
      return;
    }
    const src = `${apiUrl}/widget.js`;
    let script = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (!script) {
      script = document.createElement("script");
      script.src = src;
      script.defer = true;
      document.head.append(script);
    }
    const ok = () => setState("ready");
    const fail = () => setState("error");
    script.addEventListener("load", ok);
    script.addEventListener("error", fail);
    return () => {
      script.removeEventListener("load", ok);
      script.removeEventListener("error", fail);
    };
  }, [apiUrl]);
  return state;
}

export default function WidgetPlayground({ apiUrl, siteUrl }: { apiUrl: string; siteUrl: string }) {
  const script = useWidgetScript(apiUrl);
  const [mode, setMode] = useState<Mode>("signature");
  const [sig, setSig] = useState(EXAMPLES[0].sig);
  const [draft, setDraft] = useState(EXAMPLES[0].sig);
  const [reportLink, setReportLink] = useState(true);
  const [runId, setRunId] = useState(0);
  const [log, setLog] = useState<LogLine[]>([]);
  const host = useRef<HTMLDivElement>(null);
  const draftValid = SIGNATURE_RE.test(draft.trim());

  // Mount a fresh <rektopsy-autopsy> whenever the options change: exactly what a host page does.
  useEffect(() => {
    const box = host.current;
    if (!box || script !== "ready") return;
    const el = document.createElement("rektopsy-autopsy");
    el.setAttribute("api", apiUrl);
    // Locally the report link should open this dev server, not production.
    if (reportLink) el.setAttribute("report", window.location.origin);
    if (mode === "signature") el.setAttribute("signature", sig);
    const stamp = () => new Date().toLocaleTimeString("en-US", { hour12: false });
    const onResult = (e: Event) => {
      const d = (e as CustomEvent).detail ?? {};
      setLog((l) => [{ at: stamp(), text: `rektopsy:result  category=${d.category}`, tone: "ok" as const }, ...l].slice(0, 6));
    };
    const onError = (e: Event) => {
      const d = (e as CustomEvent).detail ?? {};
      setLog((l) => [{ at: stamp(), text: `rektopsy:error  ${d.message}`, tone: "fail" as const }, ...l].slice(0, 6));
    };
    const onDismiss = () =>
      setLog((l) => [{ at: stamp(), text: "rektopsy:dismiss", tone: "muted" as const }, ...l].slice(0, 6));
    el.addEventListener("rektopsy:result", onResult);
    el.addEventListener("rektopsy:error", onError);
    el.addEventListener("rektopsy:dismiss", onDismiss);
    box.replaceChildren(el);
    return () => {
      el.removeEventListener("rektopsy:result", onResult);
      el.removeEventListener("rektopsy:error", onError);
      el.removeEventListener("rektopsy:dismiss", onDismiss);
      el.remove();
    };
  }, [script, apiUrl, mode, sig, reportLink, runId]);

  const attrs = [
    mode === "signature" ? `\n  signature="${sig}"` : "",
    reportLink ? `\n  report="${siteUrl}"` : "",
  ].join("");
  const snippet = `<script src="${apiUrl}/widget.js" defer></script>

<rektopsy-autopsy${attrs}${attrs ? "\n" : ""}></rektopsy-autopsy>

<script>
  // Optional: react to the result in your own app.
  document.addEventListener("rektopsy:result", (e) => {
    console.log(e.detail.category, e.detail.fix);
  });
</script>`;

  const seg = (active: boolean) =>
    `h-9 flex-1 cursor-pointer rounded-lg px-3 text-[13px] transition-colors ${
      active ? "bg-surface-2 text-text" : "bg-transparent text-muted hover:text-text"
    }`;

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <div className="flex min-w-0 flex-col gap-5 lg:w-[480px] lg:shrink-0">
        <section className="flex flex-col gap-5 rounded-[18px] border border-line bg-surface p-6">
          <span className="eyebrow">Options</span>

          <div className="flex flex-col gap-2">
            <span className="text-[13px] text-text-2">When it loads</span>
            <div className="flex gap-1 rounded-xl border border-line p-1" role="radiogroup" aria-label="When it loads">
              <button type="button" role="radio" aria-checked={mode === "signature"} onClick={() => setMode("signature")} className={seg(mode === "signature")}>
                Explain a transaction
              </button>
              <button type="button" role="radio" aria-checked={mode === "input"} onClick={() => setMode("input")} className={seg(mode === "input")}>
                Show an input box
              </button>
            </div>
            <span className="text-xs leading-[1.5] text-faint">
              {mode === "signature"
                ? "Pass the signature your app already has: the widget runs at once."
                : "No signature: users paste one themselves."}
            </span>
          </div>

          {mode === "signature" && (
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (draftValid) {
                  setSig(draft.trim());
                  setRunId((n) => n + 1);
                }
              }}
            >
              <label htmlFor="wsig" className="text-[13px] text-text-2">
                Transaction signature
              </label>
              <div className="flex gap-2">
                <input
                  id="wsig"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  spellCheck={false}
                  autoComplete="off"
                  className="h-10 min-w-0 grow rounded-lg border border-line bg-bg px-3 font-mono text-xs text-text outline-none focus:border-muted"
                />
                <button
                  type="submit"
                  disabled={!draftValid}
                  className="h-10 cursor-pointer rounded-lg bg-fail px-4 text-[13px] font-medium text-fail-ink hover:bg-fail-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Run
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex.label}
                    type="button"
                    onClick={() => {
                      setDraft(ex.sig);
                      setSig(ex.sig);
                      setRunId((n) => n + 1);
                    }}
                    className={`h-7 cursor-pointer rounded-md border px-2.5 font-mono text-[11px] ${
                      sig === ex.sig ? "border-muted text-text" : "border-line text-muted hover:text-text"
                    }`}
                  >
                    {ex.label}
                  </button>
                ))}
              </div>
              {!draftValid && draft.trim() && (
                <span className="text-xs text-fail-text">A signature is 86 to 88 base58 characters.</span>
              )}
            </form>
          )}

          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={reportLink}
              onChange={(e) => setReportLink(e.target.checked)}
              className="mt-0.5 size-4 accent-[var(--fail)]"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-[13px] text-text-2">&ldquo;Full autopsy&rdquo; link</span>
              <span className="text-xs leading-[1.5] text-faint">Links to the full report on Rektopsy.</span>
            </span>
          </label>
        </section>

        <section className="flex flex-col gap-3 rounded-[18px] border border-line bg-surface p-6">
          <div className="flex items-center justify-between">
            <span className="eyebrow">Events your app receives</span>
            {log.length > 0 && (
              <button type="button" onClick={() => setLog([])} className="cursor-pointer bg-transparent text-xs text-faint hover:text-text">
                Clear
              </button>
            )}
          </div>
          {log.length === 0 ? (
            <p className="m-0 text-xs text-faint">Nothing yet. Run the widget to see its events.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0 font-mono text-[11.5px]">
              {log.map((l, i) => (
                <li key={`${l.at}-${i}`} className="flex gap-3">
                  <span className="text-faint">{l.at}</span>
                  <span className={l.tone === "ok" ? "text-fix-text" : l.tone === "fail" ? "text-fail-text" : "text-muted"}>{l.text}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <section className="flex flex-col overflow-hidden rounded-[18px] border border-line bg-surface">
          <div className="flex items-center gap-2 border-b border-line-2 px-4 py-2.5">
            <span className="size-2.5 rounded-full bg-[#2b2f35]" />
            <span className="size-2.5 rounded-full bg-[#2b2f35]" />
            <span className="size-2.5 rounded-full bg-[#2b2f35]" />
            <span className="ml-2 font-mono text-[11px] text-faint">your-app.example · live preview</span>
          </div>
          <div className="flex min-h-[360px] items-start justify-center bg-bg p-5 sm:p-8">
            {script === "error" ? (
              <p className="m-0 self-center text-sm text-fail-text">Couldn&apos;t load {apiUrl}/widget.js. Is the API up?</p>
            ) : script === "loading" ? (
              <p className="m-0 self-center text-sm text-muted">Loading the widget…</p>
            ) : null}
            <div ref={host} className="w-full max-w-[420px]" />
          </div>
        </section>
        <div className="-my-5">
          <CodeBlock lang="html" title="Copy into your page" code={snippet} />
        </div>
      </div>
    </div>
  );
}
