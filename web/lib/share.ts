import type { Autopsy } from "./api";

// One-line headlines per category. They contain no numbers, so nothing to verify.
export const HEADLINES: Record<string, string> = {
  slippage: "The price moved further than you allowed.",
  compute_budget: "It ran out of compute before it finished.",
  insufficient_funds: "There wasn't enough balance to cover it.",
  account_not_found: "An account it needed doesn't exist yet.",
  unknown_custom: "The program refused it, with an error we can't identify.",
  never_landed: "It never reached the chain.",
  succeeded: "Nothing went wrong. It went through.",
  other: "The program stopped it.",
};

export type CardFacts = {
  status: "FAILED" | "NEVER LANDED" | "SUCCEEDED";
  headline: string;
  detail: string;
  fix: string;
  funds: string;
  fundsSafe: boolean;
  tweet: string;
};

type Values = Record<string, string | number | null | undefined>;

function num(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  return typeof v === "number" && Number.isInteger(v) ? v.toLocaleString("en-US") : String(v);
}

function shortId(id?: string | null): string {
  return id && id.length > 16 ? `${id.slice(0, 6)}…${id.slice(-3)}` : (id ?? "");
}

// Everything on a share card comes from the brief: categories, Python-computed
// values and rules. No LLM prose, so no number can appear that Python didn't compute.
export function cardFacts(r: Autopsy): CardFacts {
  const cat = r.category;
  const v: Values = (r.brief.fix?.values ?? {}) as Values;
  const cause = r.brief.cause ?? {};
  const feeSol = r.brief.funds.fee_sol;

  let detail = "";
  let fix = "";
  switch (cat) {
    case "slippage":
      if (v.suggested_slippage_pct != null) {
        detail = `You allowed ${num(v.slippage_pct)}% slippage.`;
        fix = `raise slippage to ${num(v.suggested_slippage_pct)}%`;
      } else if (v.shortfall_pct_of_minimum != null) {
        detail = `The trade came in ${num(v.shortfall_pct_of_minimum)}% below your minimum.`;
        fix = "get a fresh quote, or lower the minimum you accept";
      } else if (v.over_by_pct_of_maximum != null) {
        detail = `It needed ${num(v.over_by_pct_of_maximum)}% more than your maximum.`;
        fix = "get a fresh quote, or raise the maximum you'll pay";
      } else {
        detail = cause.error_name ? `${cause.error_name}` : "";
        fix = "get a fresh quote, then raise slippage if it keeps failing";
      }
      break;
    case "compute_budget":
      detail = `Used ${num(v.consumed_cu)} compute units${v.current_cu_limit != null ? ` of ${num(v.current_cu_limit)}` : ""}.`;
      fix = v.new_cu_limit != null ? `raise the compute limit to ${num(v.new_cu_limit)}` : "raise the compute limit";
      break;
    case "insufficient_funds":
      if (v.short_sol != null) {
        detail = `Short by ${num(v.short_sol)} SOL.`;
        fix = `add at least ${num(v.short_sol)} SOL`;
      } else if (v.short != null) {
        detail = `Short by ${num(v.short)} tokens.`;
        fix = "top up the token, or lower the amount";
      } else {
        fix = "top up, or lower the amount";
      }
      break;
    case "account_not_found":
      detail = v.account_name ? `Missing account: ${v.account_name}.` : "";
      fix = "create the missing account, or use the wallet that holds the token";
      break;
    case "unknown_custom":
      // Error codes are identifiers: no thousands separator.
      detail = `${cause.failing_program_name ?? shortId(cause.failing_program)} returned error ${String(cause.custom_code)}.`;
      fix = `ask the app about error ${String(cause.custom_code)}`;
      break;
    case "never_landed":
      detail = "There is no record of it on chain.";
      fix = "resend it with a fresh blockhash";
      break;
    case "succeeded":
      detail = feeSol ? `Fee paid: ${feeSol} SOL.` : "";
      break;
    default:
      detail = cause.error_name ?? "";
      fix = "";
  }

  const fundsSafe = r.brief.funds.safe;
  const funds =
    cat === "never_landed"
      ? "Funds safe · no fee was charged"
      : cat === "succeeded"
        ? "It went through as intended"
        : fundsSafe
          ? `Funds safe · only the ${feeSol} SOL fee was charged`
          : "Balances changed · see the full report";

  const status = cat === "succeeded" ? "SUCCEEDED" : cat === "never_landed" ? "NEVER LANDED" : "FAILED";
  const headline = HEADLINES[cat] ?? HEADLINES.other;
  const noun = cat === "slippage" ? "swap" : "transaction";
  const tweet =
    cat === "succeeded"
      ? "Rektopsy checked my Solana transaction: nothing went wrong."
      : cat === "never_landed"
        ? "My Solana transaction never reached the chain. Rektopsy: no funds moved, no fee charged."
        : `My ${noun} died. Rektopsy says: "${headline}"${fix ? ` Fix: ${fix}.` : ""}`;

  return { status, headline, detail, fix, funds, fundsSafe, tweet };
}
