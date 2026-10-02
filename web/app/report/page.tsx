import type { Metadata } from "next";
import { Suspense } from "react";
import { SIGNATURE_RE } from "@/lib/api";
import { SiteHeader } from "../components/brand";
import Report from "./report";

export async function generateMetadata({ searchParams }: PageProps<"/report">): Promise<Metadata> {
  const raw = (await searchParams).sig;
  const sig = (Array.isArray(raw) ? raw[0] : (raw ?? "")).trim();
  const title = "Autopsy report · Rektopsy";
  const description = "Why this Solana transaction failed, the exact fix, and whether funds are safe.";
  if (!SIGNATURE_RE.test(sig)) return { title, description };
  // The share card: X, Discord and Slack fetch this when the report link is posted.
  const image = { url: `/api/og?sig=${sig}`, width: 1200, height: 630, alt: "Rektopsy autopsy report card" };
  return {
    title,
    description,
    openGraph: { title, description, url: `/report?sig=${sig}`, images: [image], type: "article" },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

export default function ReportPage() {
  // Report reads ?sig= from the URL, so it renders on the client inside Suspense.
  return (
    <Suspense
      fallback={
        <>
          <SiteHeader />
          <p className="px-4 py-10 text-sm text-muted sm:px-12">Loading…</p>
        </>
      }
    >
      <Report />
    </Suspense>
  );
}
