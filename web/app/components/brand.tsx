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
    <header className="flex min-h-[72px] flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-line px-4 py-3 sm:px-12">
      <Link href="/" className="flex items-center gap-2.5 !text-text no-underline">
        <Pulse />
        <span className="font-serif text-[23px] tracking-[0.2px]">Rektopsy</span>
      </Link>
      <div className="flex flex-wrap items-center gap-3 sm:gap-8">{children}</div>
    </header>
  );
}

// Header links shared by the landing page and the docs.
export function SiteNav({ active }: { active?: "docs" | "check" }) {
  const link = "text-sm no-underline hover:!text-text";
  return (
    <>
      <Link href="/check" className={`${link} ${active === "check" ? "!text-text" : "!text-muted"}`}>
        Scam check
      </Link>
      <Link href="/docs" className={`${link} ${active === "docs" ? "!text-text" : "!text-muted"}`}>
        Docs
      </Link>
      <Link href="/#embed" className={`${link} !text-muted`}>
        Embed
      </Link>
      <Link href="/#pricing" className={`${link} !text-muted`}>
        Pricing
      </Link>
      <SoonButton className="h-11 rounded-[10px] border border-line bg-surface-2 px-5 text-sm text-text">
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
