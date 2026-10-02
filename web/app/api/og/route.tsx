import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { ReactNode } from "react";
import { API_URL, SIGNATURE_RE, type Autopsy } from "@/lib/api";
import { cardFacts } from "@/lib/share";
import { SITE_HOST } from "@/lib/site";

// Share card for a report: GET /api/og?sig=<signature> -> 1200x630 PNG.
// Without a signature (or if the API is slow) it draws the generic Rektopsy card.

const font = (file: string) => readFile(join(process.cwd(), "assets/fonts", file));
const fontsReady = Promise.all([
  font("instrument-serif-latin-400-normal.woff"),
  font("ibm-plex-sans-latin-400-normal.woff"),
  font("ibm-plex-sans-latin-500-normal.woff"),
  font("ibm-plex-mono-latin-400-normal.woff"),
]);

const C = {
  bg: "#0B0C0E",
  text: "#EDEAE3",
  text2: "#C9C5BB",
  muted: "#9A968C",
  faint: "#6F6C65",
  line: "#262A2F",
  fail: "#E8703A",
  failText: "#F0906B",
  failBg: "#2A1410",
  failBorder: "#5A2A1C",
  fix: "#4FB3A0",
  fixText: "#7FC9BA",
  fixBody: "#D6DEDB",
  fixBg: "#10181A",
  fixBorder: "#234641",
};

async function loadAutopsy(sig: string): Promise<Autopsy | null> {
  try {
    const resp = await fetch(`${API_URL}/autopsy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signature: sig, prose: false }),
      signal: AbortSignal.timeout(20_000),
    });
    return resp.ok ? ((await resp.json()) as Autopsy) : null;
  } catch {
    return null;
  }
}

function Pulse() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={C.fail} strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12h4l2 5 4-12 2 7h6" />
    </svg>
  );
}

function Brand({ right }: { right?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <Pulse />
        <span style={{ fontFamily: "Serif", fontSize: 38 }}>Rektopsy</span>
      </div>
      {right}
    </div>
  );
}

function ReportCard({ r }: { r: Autopsy }) {
  const f = cardFacts(r);
  const ok = f.status === "SUCCEEDED";
  const sig = r.signature;
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: C.bg,
      color: C.text, fontFamily: "Plex", padding: "52px 64px 48px", position: "relative" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 5,
        background: `linear-gradient(90deg, ${ok ? C.fix : C.fail}, transparent)` }} />
      <Brand
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 18px", borderRadius: 10,
            fontSize: 20, border: `1px solid ${ok ? C.fixBorder : C.failBorder}`, background: ok ? C.fixBg : C.failBg,
            color: ok ? C.fixText : C.failText, letterSpacing: 1.5 }}>
            <div style={{ width: 10, height: 10, borderRadius: 5, background: ok ? C.fix : C.fail }} />
            {f.status}
          </div>
        }
      />
      <div style={{ display: "flex", marginTop: 46, fontFamily: "Mono", fontSize: 18, letterSpacing: 3, color: C.muted }}>
        {ok ? "WHAT HAPPENED" : "CAUSE OF DEATH"}
      </div>
      <div style={{ display: "flex", marginTop: 14, fontFamily: "Serif", fontSize: 66, lineHeight: 1.05, maxWidth: 1040 }}>
        {f.headline}
      </div>
      {f.detail && (
        <div style={{ display: "flex", marginTop: 18, fontSize: 28, color: C.text2 }}>{f.detail}</div>
      )}
      <div style={{ display: "flex", flexGrow: 1 }} />
      {f.fix && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "20px 26px", borderRadius: 18,
          background: C.fixBg, border: `1px solid ${C.fixBorder}` }}>
          <div style={{ display: "flex", fontFamily: "Mono", fontSize: 16, letterSpacing: 3, color: C.fixText }}>THE FIX</div>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 500, color: C.fixBody }}>
            {f.fix.charAt(0).toUpperCase() + f.fix.slice(1)}.
          </div>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 22, color: C.text2 }}>
          <div style={{ width: 10, height: 10, borderRadius: 5, background: f.fundsSafe ? C.fix : C.fail }} />
          {f.funds}
        </div>
        <div style={{ display: "flex", fontFamily: "Mono", fontSize: 18, color: C.faint }}>
          {SITE_HOST} · {sig.slice(0, 6)}…{sig.slice(-4)}
        </div>
      </div>
    </div>
  );
}

function GenericCard() {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: C.bg,
      color: C.text, fontFamily: "Plex", padding: "56px 64px" }}>
      <Brand />
      <div style={{ display: "flex", flexGrow: 1 }} />
      <div style={{ display: "flex", fontFamily: "Mono", fontSize: 18, letterSpacing: 3, color: C.muted }}>
        SOLANA TRANSACTION FORENSICS
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 16, fontFamily: "Serif", fontSize: 84, lineHeight: 1.02 }}>
        <span>Your transaction died.</span>
        <span style={{ color: C.fail }}>Here is the autopsy.</span>
      </div>
      <div style={{ display: "flex", marginTop: 26, fontSize: 28, color: C.muted, maxWidth: 980 }}>
        The cause, the exact fix, and whether your funds are safe, traced to the chain.
      </div>
      <div style={{ display: "flex", marginTop: 34, fontFamily: "Mono", fontSize: 20, color: C.faint }}>{SITE_HOST}</div>
    </div>
  );
}

export async function GET(request: Request) {
  const sig = (new URL(request.url).searchParams.get("sig") ?? "").trim();
  const r = SIGNATURE_RE.test(sig) ? await loadAutopsy(sig) : null;
  const [serif, sans, sansMedium, mono] = await fontsReady;

  return new ImageResponse(r ? <ReportCard r={r} /> : <GenericCard />, {
    width: 1200,
    height: 630,
    fonts: [
      { name: "Serif", data: serif, weight: 400, style: "normal" },
      { name: "Plex", data: sans, weight: 400, style: "normal" },
      { name: "Plex", data: sansMedium, weight: 500, style: "normal" },
      { name: "Mono", data: mono, weight: 400, style: "normal" },
    ],
    headers: {
      // A real card is stable for a landed transaction; a fallback should be retried soon.
      "Cache-Control": r
        ? "public, max-age=3600, s-maxage=604800, stale-while-revalidate=86400"
        : "public, max-age=60, s-maxage=60",
    },
  });
}
