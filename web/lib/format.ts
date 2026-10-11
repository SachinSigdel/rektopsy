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

// Friendlier names for fix values on the report; anything else falls back to label().
const VALUE_NAMES: Record<string, string> = {
  slippage: "Your slippage",
  suggested_slippage: "Suggested slippage",
  quoted_out: "Quoted out",
  minimum_out: "Your minimum out",
  exact_amount_out: "Exact amount out",
  your_maximum_in: "Your maximum in",
  consumed_cu: "Compute used",
  current_cu_limit: "Compute limit",
  new_cu_limit: "Suggested limit",
  unit_price_micro_lamports: "Priority price (µlamports / CU)",
  new_max_priority_fee: "Max priority fee",
  have: "You have",
  need: "Needed",
  short: "Short by",
  account_name: "Missing account",
  custom_code: "Error code",
  program: "Program",
  mint: "Token",
};

// Units in display preference order: the first one present for a base key wins.
const UNIT_ORDER: [string, (v: string) => string][] = [
  ["_pct", (v) => `${v}%`],
  ["_sol", (v) => `${v} SOL`],
  ["", (v) => v],
  ["_bps", (v) => `${v} bps`],
  ["_lamports", (v) => `${v} lamports`],
  ["_raw", (v) => `${v} (raw units)`],
];

const NO_SEPARATORS = new Set(["custom_code"]); // error codes are identifiers, not amounts

function formatValue(key: string, v: string | number): string {
  if (typeof v === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v)) return shortId(v);
  if (typeof v === "number" && !NO_SEPARATORS.has(key)) return v.toLocaleString("en-US");
  return String(v);
}

// Fix values for display: one row per quantity, in its most readable unit.
// {slippage_bps: 50, slippage_pct: "0.5"} -> [{label: "Your slippage", value: "0.5%"}]
export function displayValues(values: Record<string, string | number | null>): { label: string; value: string }[] {
  const groups = new Map<string, Map<string, string | number>>();
  for (const [key, v] of Object.entries(values)) {
    if (v === null || v === "") continue;
    const unit = UNIT_ORDER.find(([u]) => u && key.endsWith(u))?.[0] ?? "";
    const base = unit ? key.slice(0, -unit.length) : key;
    if (!groups.has(base)) groups.set(base, new Map());
    groups.get(base)!.set(unit, v);
  }
  return [...groups].map(([base, units]) => {
    const [unit, fmt] = UNIT_ORDER.find(([u]) => units.has(u))!;
    const key = base + unit;
    return { label: VALUE_NAMES[base] ?? label(key), value: fmt(formatValue(key, units.get(unit)!)) };
  });
}
