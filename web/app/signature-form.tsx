"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { EXAMPLES, SIGNATURE_RE } from "@/lib/api";

export default function SignatureForm() {
  const router = useRouter();
  const [signature, setSignature] = useState("");
  const [error, setError] = useState<string | null>(null);

  function go(sig: string) {
    sig = sig.trim();
    if (!SIGNATURE_RE.test(sig)) {
      setError("That doesn't look like a Solana transaction signature (86-88 base58 characters).");
      return;
    }
    router.push(`/report?sig=${encodeURIComponent(sig)}`);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    go(signature);
  }

  return (
    <>
      <form onSubmit={onSubmit} className="mt-1 flex flex-col gap-3">
        <label htmlFor="sig" className="font-mono text-xs tracking-[1px] text-muted uppercase">
          Transaction signature
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id="sig"
            value={signature}
            onChange={(e) => {
              setSignature(e.target.value);
              setError(null);
            }}
            placeholder="Paste a signature"
            spellCheck={false}
            autoComplete="off"
            className="h-14 min-w-0 grow rounded-xl border border-line bg-surface px-[18px] font-mono text-sm text-text outline-none placeholder:text-faint focus:border-muted"
          />
          <button
            type="submit"
            className="h-14 rounded-xl bg-fail px-7 text-[15px] font-medium text-fail-ink hover:bg-fail-hover"
          >
            Run autopsy
          </button>
        </div>
        {error && (
          <p role="alert" className="m-0 text-sm text-fail-text">
            {error}
          </p>
        )}
      </form>

      <div className="flex flex-wrap items-center gap-2.5">
        <span className="text-[13px] text-faint">Try one:</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex.label}
            type="button"
            onClick={() => {
              setSignature(ex.sig);
              go(ex.sig);
            }}
            className="h-8 rounded-lg border border-line bg-transparent px-3 font-mono text-xs text-muted hover:border-muted hover:text-text"
          >
            {ex.label}
          </button>
        ))}
      </div>
    </>
  );
}
