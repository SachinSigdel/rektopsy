import { Suspense } from "react";
import { SiteHeader } from "../components/brand";
import Report from "./report";

export const metadata = { title: "Autopsy report · Rektopsy" };

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
