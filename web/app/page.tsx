import { API_URL } from "@/lib/api";
import { EVAL } from "@/lib/eval-stats";
import Link from "next/link";
import { SiteHeader, SiteNav, SiteFooter } from "./components/brand";
import EmbedDemo from "./components/embed-demo";
import SignatureForm from "./signature-form";

// Reference transaction (real user, Jupiter slippage at 0.5%): used for the share-card example.
const EXAMPLE_SIG = "36V9G2WgBdWsZNdgsb1V2U4jJ9xGfNC5ehv9YeKrGnvhXjKNTgcBoJian5VtRNFBHYegjhbRWtQ1eBwmqXJEgrcg";

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

            <Link
              href="/check"
              className="flex items-center gap-3 self-start rounded-xl border border-line bg-surface px-4 py-3 text-sm !text-text-2 no-underline hover:border-muted hover:!text-text"
            >
              <span className="size-[7px] shrink-0 rounded-full bg-fail" />
              Got a strange DM or airdrop instead? Check it for scams →
            </Link>
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
              <Link href="/widget" className="text-sm no-underline">
                Try the widget &rarr;
              </Link>
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

        <section id="scam-check" className="scroll-mt-6 px-4 pt-4 sm:px-12">
          <div className="grid grid-cols-1 gap-8 rounded-2xl border border-line bg-surface p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center">
            <div className="flex flex-col gap-3">
              <span className="eyebrow">Scam check</span>
              <h2 className="m-0 font-serif text-[32px] leading-[1.1] font-normal">
                Check the DM <span className="text-fail italic">before</span> it costs you.
              </h2>
              <p className="m-0 max-w-[520px] text-[15px] leading-[1.6] text-muted">
                Paste a message, a link or an airdropped token&apos;s name. We look for the patterns behind crypto
                scams, check links against public phishing lists, and quote the exact words that gave it away. No
                chatbot is involved, and it never says &ldquo;safe&rdquo;.
              </p>
              <ul className="m-0 mt-1 flex list-none flex-col gap-2 p-0 text-sm text-text-2">
                {[
                  "Seed phrase requests, fake support, send\u20111\u2011get\u20112",
                  "Look-alike links like jup1ter.ag, and ~460k known phishing domains",
                  "A trained model as a second opinion, with the words behind its score",
                ].map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <span className="mt-[8px] size-1.5 shrink-0 rounded-full bg-fail" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                href="/check"
                className="mt-2 flex h-11 items-center self-start rounded-xl bg-fail px-6 text-sm font-medium !text-fail-ink no-underline hover:bg-fail-hover"
              >
                Check a message
              </Link>
            </div>

            {/* A static copy of the live result for the "fake airdrop" example on /check. */}
            <div aria-hidden="true" className="flex flex-col gap-3.5 rounded-xl border border-line-2 bg-bg p-5">
              <div className="flex items-center justify-between">
                <span className="font-serif text-[22px]">This looks like a scam.</span>
                <span className="inline-flex h-[26px] items-center gap-2 rounded-lg border border-fail-border bg-fail-bg px-2.5 text-xs text-fail-text">
                  <span className="size-1.5 rounded-full bg-fail" />
                  Likely scam
                </span>
              </div>
              <p className="m-0 rounded-lg border border-line-2 bg-surface px-3.5 py-3 text-[13.5px] leading-[1.65] text-text-2">
                Congrats! <mark className="rounded-[3px] bg-fail-bg px-0.5 text-fail-text">You&apos;re eligible</mark> for
                the JUP airdrop.{" "}
                <mark className="rounded-[3px] bg-fail-bg px-0.5 text-fail-text">
                  Connect your wallet at https://jup1ter.ag/claim before it expires
                </mark>{" "}
                in 1 hour.
              </p>
              {[
                ["Link imitates a real site", "In jup1ter.ag, “jup1ter” is spelled to look like “jupiter”. The real site is jup.ag."],
                ["Connect or sign to claim something", "Fake airdrop and migration sites ask you to connect and sign. The signature hands over your tokens."],
              ].map(([title, why]) => (
                <div key={title} className="flex gap-2.5">
                  <span className="mt-[7px] size-2 shrink-0 rounded-full bg-fail" />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[13.5px] font-medium">{title}</span>
                    <span className="text-[12.5px] leading-[1.5] text-muted">{why}</span>
                  </div>
                </div>
              ))}
              <div className="rounded-lg border border-fix-border bg-fix-bg px-3.5 py-2.5 text-[12.5px] leading-[1.5] text-fix-body">
                <span className="font-mono text-[10.5px] tracking-[1.2px] text-fix-text uppercase">What to do · </span>
                Don&apos;t open the link. Type the real address yourself: jup.ag.
              </div>
            </div>
          </div>
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
            <EmbedDemo apiUrl={API_URL} className="flex-1" />
            <div className="mt-1 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <Link href="/widget" className="no-underline">
                Try the live widget &rarr;
              </Link>
              <Link href="/docs#widget" className="!text-muted no-underline hover:!text-text">
                Widget docs
              </Link>
            </div>
          </div>

          <div className="flex flex-col gap-4">
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
              <Link href="/docs" className="pt-3 text-sm no-underline">
                Read the docs &rarr;
              </Link>
            </div>

            <Link
              href={`/report?sig=${EXAMPLE_SIG}`}
              className="group flex flex-col gap-3 rounded-2xl border border-line bg-surface p-6 !text-text no-underline transition duration-200 hover:-translate-y-0.5 hover:border-fail-border sm:p-8"
            >
              <span className="eyebrow">Share cards</span>
              <p className="m-0 text-[15px] leading-[1.6] text-muted">
                Every report comes with an image for X and Discord: the cause and the fix, straight from the chain.
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element -- generated PNG */}
              <img
                src={`/api/og?sig=${EXAMPLE_SIG}`}
                alt="Example share card: the price moved further than you allowed. Fix: raise slippage to 1%."
                loading="lazy"
                className="block aspect-[1200/630] w-full rounded-xl border border-line-2 bg-bg object-cover"
              />
              <span className="text-sm text-fail group-hover:text-fail-hover">See the full report &rarr;</span>
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
