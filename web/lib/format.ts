// "would_receive_raw" -> "Would receive (raw units)"
export function label(key: string): string {
  const units: [string, string][] = [
    ["_raw", " (raw units)"],
    ["_sol", " (SOL)"],
    ["_pct", " (%)"],
    ["_bps", " (bps)"],
    ["_lamports", " (lamports)"],
  ];
  let suffix = "";
  for (const [end, unit] of units) {
    if (key.endsWith(end)) {
      key = key.slice(0, -end.length);
      suffix = unit;
      break;
    }
  }
  const words = key.replace(/_pct_of_/, " % of ").replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1) + suffix;
}

// "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4" -> "JUP6Lk…aV4"
export function shortId(id: string): string {
  return id.length > 16 ? `${id.slice(0, 6)}…${id.slice(-3)}` : id;
}

// A raw log line, tightened for the log panel: drop the "Program " prefix, shorten account ids.
export function condenseLog(line: string): string {
  return line
    .replace(/^Program log: /, "log: ")
    .replace(/^Program /, "")
    .replace(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g, shortId);
}

export function timeAgo(unixSeconds: number, now = Date.now()): string {
  const s = Math.max(0, Math.round(now / 1000 - unixSeconds));
  if (s < 90) return "just now";
  const m = Math.round(s / 60);
  if (m < 90) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d < 60 ? `${d} days ago` : new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}
