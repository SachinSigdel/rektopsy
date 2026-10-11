"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Pulse } from "./pulse";

// Sticky header. At the top it blends into the page; once the page scrolls it
// fades in a blurred background, border, shadow and a thin orange edge.
// Its height never changes, so nothing below it jumps.
export function SiteHeader({ children }: { children?: ReactNode }) {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      setStuck(window.scrollY > 4);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <header
      data-stuck={stuck || undefined}
      className={`group/header sticky top-0 z-40 flex min-h-[72px] flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b px-4 py-3 transition-[background-color,border-color,box-shadow,backdrop-filter] duration-300 ease-out motion-reduce:transition-none sm:px-12 ${
        stuck
          ? "border-line bg-bg/85 shadow-[0_10px_30px_-14px_rgba(0,0,0,0.8)] backdrop-blur-md"
          : "border-transparent bg-transparent"
      }`}
    >
      <Link href="/" className="flex items-center gap-2.5 !text-text no-underline">
        <span className="transition-transform duration-300 ease-out group-data-[stuck]/header:scale-90 motion-reduce:transition-none">
          <Pulse />
        </span>
        <span className="font-serif text-[23px] tracking-[0.2px]">Rektopsy</span>
      </Link>
      <div className="flex flex-wrap items-center gap-3 sm:gap-8">{children}</div>
      {/* Thin brand edge that draws in from the centre once the header sticks. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -bottom-px h-px origin-center scale-x-0 bg-gradient-to-r from-transparent via-fail/70 to-transparent opacity-0 transition-[transform,opacity] duration-500 ease-out group-data-[stuck]/header:scale-x-100 group-data-[stuck]/header:opacity-100 motion-reduce:transition-none"
      />
    </header>
  );
}
