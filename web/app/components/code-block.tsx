"use client";

import { useState } from "react";

export default function CodeBlock({ code, lang, title }: { code: string; lang: string; title?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="my-5 overflow-hidden rounded-xl border border-line-2 bg-[#0f1114]">
      <div className="flex items-center justify-between border-b border-line-2 px-4 py-2">
        <span className="font-mono text-[11px] tracking-[1px] text-faint uppercase">{title ?? lang}</span>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(code).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          }}
          className="cursor-pointer rounded-md border border-line bg-transparent px-2 py-1 font-mono text-[11px] text-muted hover:border-muted hover:text-text"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="m-0 overflow-x-auto px-4 py-3.5 font-mono text-[12.5px] leading-[1.75] text-text-2">
        <code>{code}</code>
      </pre>
    </div>
  );
}
