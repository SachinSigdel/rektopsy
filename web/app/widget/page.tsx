import type { Metadata } from "next";
import Link from "next/link";
import { API_URL } from "@/lib/api";
import { SITE_URL } from "@/lib/site";
import { SiteFooter, SiteHeader, SiteNav } from "../components/brand";
import WidgetPlayground from "./widget-playground";

const DESCRIPTION =
  "Add Rektopsy to your app with one script tag. Try the real widget live, then copy the code.";

export const metadata: Metadata = {
  title: "Widget · Rektopsy",
  description: DESCRIPTION,
  openGraph: {
    title: "Widget · Rektopsy",
    description: DESCRIPTION,
    url: "/widget",
    images: [{ url: "/api/og", width: 1200, height: 630, alt: "Rektopsy" }],
  },
};

export default function WidgetPage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader>
        <SiteNav active="widget" />
      </SiteHeader>
      <main className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col gap-8 px-4 pt-14 pb-16 sm:px-12">
        <div className="flex max-w-[720px] flex-col gap-5">
          <div className="flex items-center gap-2.5">
            <span className="size-[7px] rounded-full bg-fix" />
            <span className="font-mono text-xs tracking-[1.4px] text-muted uppercase">For apps, wallets and explorers</span>
          </div>
          <h1 className="m-0 font-serif text-[40px] leading-[1.06] font-normal tracking-[-0.5px] sm:text-[56px]">
            Explain failures
            <br />
            <span className="text-fail italic">inside your own app.</span>
          </h1>
          <p className="m-0 text-[17px] leading-[1.6] text-muted">
            One script tag adds the Rektopsy widget to any page. Your users see why their transaction failed, the
            fix, and whether their funds are safe, without leaving your app. This is the real widget, calling the
            live API: try it, then copy the code.
          </p>
        </div>
        <WidgetPlayground apiUrl={API_URL} siteUrl={SITE_URL} />
        <p className="m-0 text-sm text-muted">
          All attributes, <code className="font-mono text-text-2">Rektopsy.attach()</code> and events are in the{" "}
          <Link href="/docs#widget" className="no-underline">
            widget docs
          </Link>
          .
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
