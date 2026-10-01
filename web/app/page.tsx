import { API_URL } from "@/lib/api";
import { EVAL } from "@/lib/eval-stats";
import Link from "next/link";
import { SiteHeader, SiteNav } from "./components/brand";
import SignatureForm from "./signature-form";

const BAR_COLORS = ["#E8703A", "#C9603A", "#8C5240"];

const FEATURES = [
  {
    icon: "M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7",
    title: "Read from the chain, not guessed",
    body: "We fetch the transaction and its program logs from Solana, so every fact comes from the chain itself.",
  },
  {
    icon: "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z",
    title: "A fix, not an error code",
    body: "Every verdict ends with what to change, and the exact value to change it to when the chain shows it.",
  },
  {
    icon: "M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4",
    title: "Receipts attached",
    body: "Each claim links to the instruction and log line it came from. The AI writes sentences; it never supplies a number.",
  },
];

const EMBED_SNIPPET = `<script src="${API_URL}/widget.js" defer></script>
<rektopsy-autopsy signature="…"></rektopsy-autopsy>

<!-- or from your own code -->
<script>Rektopsy.attach({ sig, theme: "dark", target: "#help" })</script>`;

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader>
        <SiteNav />
      </SiteHeader>

      <main className="mx-auto w-full max-w-[1280px] flex-1">
        <section className="flex flex-col gap-14 px-4 pt-14 sm:px-12 lg:flex-row">
          <div className="flex flex-col gap-7 lg:w-[664px] lg:shrink-0">
            <div className="flex items-center gap-2.5">
              <span className="size-[7px] rounded-full bg-fail" />
              <span className="font-mono text-xs tracking-[1.4px] text-muted uppercase">
                Solana transaction forensics
              </span>
            </div>

            <h1 className="m-0 font-serif text-[44px] leading-[1.04] font-normal tracking-[-0.5px] sm:text-[68px]">
              Your transaction died.
              <br />
              <span className="text-fail italic">Here is the autopsy.</span>
            </h1>

            <p className="m-0 max-w-[560px] text-[17px] leading-[1.6] text-muted">
              Paste a failed signature. We read it from the chain, decode the program logs, and tell you
              in plain language what killed it, the exact setting to change before you retry, and whether
              your funds are safe.
            </p>

            <SignatureForm />
          </div>

          <aside className="flex flex-1 flex-col gap-4 pt-2">
            <div className="flex flex-col gap-3.5 rounded-2xl border border-line bg-surface p-[22px]">
              <div className="flex items-center justify-between">
                <span className="eyebrow">Tested on {EVAL.cases} real transactions</span>
                <span className="size-[7px] rounded-full bg-fix" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-serif text-[42px] leading-none">{EVAL.correctCausePct}%</span>
                <span className="text-[13px] text-muted">causes identified correctly</span>
              </div>
              <div className="h-px bg-line" />
              <div className="flex flex-col gap-2.5">
                {EVAL.mix.map((row, i) => (
                  <div key={row.label} className="flex flex-col gap-2.5">
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="text-muted">{row.label}</span>
                      <span className="font-mono">{row.pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-[3px] bg-surface-2">
                      <div
                        className="h-1.5 rounded-[3px]"
                        style={{ width: `${row.pct}%`, background: BAR_COLORS[i] }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="m-0 text-xs leading-[1.55] text-faint">
                Share of the test set. {EVAL.madeUpNumbers} made-up numbers, against{" "}
                {EVAL.baselineMadeUpNumbers} when an LLM reads the raw logs.
              </p>
            </div>

            <div className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-[22px]">
              <span className="eyebrow">For protocols</span>
              <p className="m-0 text-sm leading-[1.55]">
                Drop the widget into your app and your support channel stops answering the same question.
              </p>
              <a href="#embed" className="text-sm no-underline">
                See the embed &rarr;
              </a>
            </div>
          </aside>
        </section>

        <section className="grid grid-cols-1 gap-4 px-4 pt-12 pb-4 sm:grid-cols-3 sm:px-12">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className="group relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-line bg-surface p-6 transition duration-200 ease-out hover:-translate-y-1 hover:border-fail-border hover:bg-[#17191c] hover:shadow-[0_18px_40px_-18px_rgba(232,112,58,0.35)]"
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-fail to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100"
              />
              <div className="flex items-center justify-between">
                <span className="flex size-10 items-center justify-center rounded-xl border border-line bg-surface-2 transition-colors duration-200 group-hover:border-fail-border group-hover:bg-fail-bg">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
                    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                    className="text-muted transition-colors duration-200 group-hover:text-fail">
                    <path d={f.icon} />
                  </svg>
                </span>
                <span className="font-mono text-xs text-faint transition-colors duration-200 group-hover:text-fail">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <span className="mt-1 text-[15px] font-medium">{f.title}</span>
              <span className="text-[13px] leading-[1.55] text-muted">{f.body}</span>
            </div>
          ))}
        </section>

        <section className="grid grid-cols-1 gap-4 px-4 pt-4 pb-14 sm:px-12 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div id="embed" className="flex scroll-mt-6 flex-col gap-3 rounded-2xl border border-line bg-surface p-6 sm:p-8">
            <span className="eyebrow">Embed</span>
            <h2 className="m-0 font-serif text-[32px] leading-[1.1] font-normal">
              Put the autopsy where the failure happens.
            </h2>
            <p className="m-0 max-w-[620px] text-[15px] leading-[1.6] text-muted">
              One script tag adds a self-contained widget to any site. Its styles can&apos;t clash with
              yours, and it fires <code className="font-mono text-text-2">rektopsy:result</code> events
              your app can listen to.
            </p>
            <pre className="mt-2 mb-0 overflow-x-auto rounded-[13px] border border-line-2 bg-bg px-4 py-3.5 font-mono text-[11.5px] leading-[1.8] text-log">
              {EMBED_SNIPPET}
            </pre>
            <Link href="/docs#widget" className="mt-1 text-sm no-underline">
              Widget docs &rarr;
            </Link>
          </div>

          <div id="pricing" className="flex scroll-mt-6 flex-col gap-3 rounded-2xl border border-line bg-surface p-6 sm:p-8">
            <span className="eyebrow">Pricing</span>
            <h2 className="m-0 font-serif text-[56px] leading-none font-normal">Free.</h2>
            <p className="m-0 text-[15px] leading-[1.6] text-muted">
              Rektopsy only reads public transaction data, so there is nothing to pay for.
            </p>
            <ul className="m-0 mt-1 flex list-none flex-col gap-2.5 p-0 text-sm">
              {["No wallet connection", "No signing, no keys", "No fees, no account", "Open source, MIT licensed"].map(
                (item) => (
                  <li key={item} className="flex items-center gap-2.5">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--fix)" strokeWidth="2"
                      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    {item}
                  </li>
                ),
              )}
            </ul>
            <Link href="/docs" className="mt-auto pt-3 text-sm no-underline">
              Read the docs &rarr;
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line px-4 py-6 text-xs text-faint sm:px-12">
        Read-only: no wallet connection, no signing, no keys. We only read public transaction data.
      </footer>
    </div>
  );
}
