import { API_URL } from "@/lib/api";
import { EVAL } from "@/lib/eval-stats";
import { SiteHeader, SoonButton } from "./components/brand";
import SignatureForm from "./signature-form";

const BAR_COLORS = ["#E8703A", "#C9603A", "#8C5240"];

const FEATURES = [
  {
    title: "Read from the chain, not guessed",
    body: "We fetch the transaction and its program logs from Solana, so every fact comes from the chain itself.",
  },
  {
    title: "A fix, not an error code",
    body: "Every verdict ends with what to change, and the exact value to change it to when the chain shows it.",
  },
  {
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
        <a href={`${API_URL}/docs`} className="text-sm !text-muted no-underline hover:!text-text">
          Docs
        </a>
        <a href="#embed" className="text-sm !text-muted no-underline hover:!text-text">
          Embed
        </a>
        <a href="#pricing" className="text-sm !text-muted no-underline hover:!text-text">
          Pricing
        </a>
        <SoonButton className="h-11 rounded-[10px] border border-line bg-surface-2 px-5 text-sm text-text">
          Connect wallet
        </SoonButton>
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

        <section className="grid grid-cols-1 gap-5 px-4 pt-9 pb-10 sm:grid-cols-3 sm:px-12">
          {FEATURES.map((f, i) => (
            <div key={f.title} className="flex flex-col gap-2">
              <span className="font-mono text-xs text-fail">{String(i + 1).padStart(2, "0")}</span>
              <span className="text-[15px] font-medium">{f.title}</span>
              <span className="text-[13px] leading-[1.55] text-muted">{f.body}</span>
            </div>
          ))}
        </section>

        <section id="embed" className="scroll-mt-6 border-t border-line px-4 py-12 sm:px-12">
          <span className="eyebrow">Embed</span>
          <h2 className="mt-3 mb-0 font-serif text-[34px] leading-[1.1] font-normal">
            Put the autopsy where the failure happens.
          </h2>
          <p className="mt-3 mb-0 max-w-[620px] text-[15px] leading-[1.6] text-muted">
            One script tag adds a self-contained widget to any site. Its styles can&apos;t clash with
            yours, and it fires <code className="font-mono text-text-2">rektopsy:result</code> events
            your app can listen to.
          </p>
          <pre className="mt-6 overflow-x-auto rounded-[13px] border border-line-2 bg-[#0f1114] px-4 py-3.5 font-mono text-[11.5px] leading-[1.8] text-log">
            {EMBED_SNIPPET}
          </pre>
        </section>

        <section id="pricing" className="scroll-mt-6 border-t border-line px-4 py-12 sm:px-12">
          <span className="eyebrow">Pricing</span>
          <h2 className="mt-3 mb-0 font-serif text-[34px] leading-[1.1] font-normal">Free.</h2>
          <p className="mt-3 mb-0 max-w-[620px] text-[15px] leading-[1.6] text-muted">
            Rektopsy only reads public transaction data. No wallet connection, no signing, no keys, and
            no fees.
          </p>
        </section>
      </main>

      <footer className="border-t border-line px-4 py-6 text-xs text-faint sm:px-12">
        Read-only: no wallet connection, no signing, no keys. We only read public transaction data.
      </footer>
    </div>
  );
}
