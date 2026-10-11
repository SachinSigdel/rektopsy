import Link from "next/link";
import type { ReactNode } from "react";

export function Pulse({ size = 22, color = "var(--fail)" }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 12h4l2 5 4-12 2 7h6" />
    </svg>
  );
}

export function SiteHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-40 flex min-h-[72px] flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-line bg-bg/85 px-4 py-3 backdrop-blur-md sm:px-12">
      <Link href="/" className="flex items-center gap-2.5 !text-text no-underline">
        <Pulse />
        <span className="font-serif text-[23px] tracking-[0.2px]">Rektopsy</span>
      </Link>
      <div className="flex flex-wrap items-center gap-3 sm:gap-8">{children}</div>
    </header>
  );
}

// Header links shared by the landing page and the docs.
export function SiteNav({ active }: { active?: "docs" | "check" | "widget" }) {
  const link = "text-sm no-underline hover:!text-text";
  return (
    <>
      <Link href="/check" className={`${link} ${active === "check" ? "!text-text" : "!text-muted"}`}>
        Scam check
      </Link>
      <Link href="/docs" className={`${link} ${active === "docs" ? "!text-text" : "!text-muted"}`}>
        Docs
      </Link>
      {/* Phones get the two pages; the landing anchors and the wallet button need room. */}
      <Link href="/widget" className={`${link} hidden sm:inline ${active === "widget" ? "!text-text" : "!text-muted"}`}>
        Embed
      </Link>
      <Link href="/#pricing" className={`${link} hidden !text-muted sm:inline`}>
        Pricing
      </Link>
      <SoonButton className="hidden h-11 rounded-[10px] border border-line bg-surface-2 px-5 text-sm text-text sm:inline-block">
        Connect wallet
      </SoonButton>
    </>
  );
}

// Buttons for features that need a wallet. Rektopsy is read-only for now,
// so these are shown as the designs have them, but disabled.
export function SoonButton({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      disabled
      title="Coming soon: Rektopsy is read-only for now (no wallet, no signing)."
      className={`relative cursor-not-allowed opacity-55 ${className}`}
    >
      {children}
      <span className="absolute -top-2 -right-2 rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[9.5px] tracking-wide text-muted uppercase">
        Soon
      </span>
    </button>
  );
}

// Shared footer: the read-only promise, plus links to every page.
export function SiteFooter() {
  const link = "!text-faint no-underline hover:!text-text";
  return (
    <footer className="mt-auto flex flex-col gap-3 border-t border-line px-4 py-6 text-xs text-faint sm:flex-row sm:items-center sm:justify-between sm:px-12">
      <span>Read-only: no wallet connection, no signing, no keys. We only read public data.</span>
      <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
        <Link href="/" className={link}>
          Autopsy
        </Link>
        <Link href="/check" className={link}>
          Scam check
        </Link>
        <Link href="/widget" className={link}>
          Widget
        </Link>
        <Link href="/docs" className={link}>
          Docs
        </Link>
        <a href="https://github.com/SachinSigdel/rektopsy" className={link}>
          GitHub
        </a>
      </nav>
    </footer>
  );
}
