import type { Metadata } from "next";
import { SiteFooter, SiteHeader, SiteNav } from "../components/brand";
import ScamChecker from "./scam-checker";

const DESCRIPTION =
  "Paste a suspicious DM, tweet or link. Rektopsy points out the red flags, quotes the exact words, and tells you what to do.";

export const metadata: Metadata = {
  title: "Scam check · Rektopsy",
  description: DESCRIPTION,
  openGraph: {
    title: "Scam check · Rektopsy",
    description: DESCRIPTION,
    url: "/check",
    images: [{ url: "/api/og", width: 1200, height: 630, alt: "Rektopsy" }],
  },
};

export default function CheckPage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader>
        <SiteNav active="check" />
      </SiteHeader>
      <main className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col gap-8 px-4 pt-14 pb-16 sm:px-12">
        <div className="flex max-w-[720px] flex-col gap-5">
          <div className="flex items-center gap-2.5">
            <span className="size-[7px] rounded-full bg-fail" />
            <span className="font-mono text-xs tracking-[1.4px] text-muted uppercase">Before the loss</span>
          </div>
          <h1 className="m-0 font-serif text-[40px] leading-[1.06] font-normal tracking-[-0.5px] sm:text-[56px]">
            Got a strange message?
            <br />
            <span className="text-fail italic">Check it before you click.</span>
          </h1>
          <p className="m-0 text-[17px] leading-[1.6] text-muted">
            Paste a DM, tweet, Telegram message or link. We look for the patterns behind crypto scams, check every
            link against public phishing lists, and quote the exact words that worried us. Nothing you paste is
            stored.
          </p>
        </div>
        <ScamChecker />
      </main>
      <SiteFooter />
    </div>
  );
}
