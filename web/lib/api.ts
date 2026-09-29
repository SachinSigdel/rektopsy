export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const SIGNATURE_RE = /^[1-9A-HJ-NP-Za-km-z]{86,88}$/;

// Real mainnet transactions from eval/cases.json, used by the "Try one" chips.
export const EXAMPLES = [
  {
    label: "slippage exceeded",
    sig: "2KhUjNQsVikHC6JnpigNW4fhspGJYPM7SsgutEXjR6mj8ufLgSdVwA9KZEeMjCdhxGcMMMJG91rUyYM9h32c94zX",
  },
  {
    label: "compute budget",
    sig: "5qF9ozWpdZoRKwQSxS7GZqn55RiXCtAGRabjZRArXf1TcHKcDwdRUDkaLjzRyR4DgmyJHPgLqEsKpMZ9xR9gLvMb",
  },
  {
    label: "0x1771",
    sig: "36V9G2WgBdWsZNdgsb1V2U4jJ9xGfNC5ehv9YeKrGnvhXjKNTgcBoJian5VtRNFBHYegjhbRWtQ1eBwmqXJEgrcg",
  },
];

export type Step = {
  index: number;
  label: string;
  program: string;
  program_name: string | null;
  status: "ok" | "failed" | "not_run";
};

export type Autopsy = {
  signature: string;
  category: string;
  cause: string;
  fix: string;
  funds: string;
  evidence: { claim: string; source: string }[];
  log_lines: Record<string, string>;
  meta: { mode: "llm" | "template"; tokens: number; latency_ms: number };
  tx: {
    slot: number;
    block_time: number | null;
    failed_instruction: number | null;
    failure_log: number | null;
    steps: Step[];
    compute_consumed: number | null;
    compute_limit: number | null;
    programs_touched: number;
    logs: string[];
    logs_truncated: boolean;
  } | null;
  brief: {
    cause?: {
      error_name?: string | null;
      custom_code?: number | null;
      failing_program_name?: string | null;
      failing_program?: string | null;
    };
    fix?: { values?: Record<string, string | number | null>; rule?: string; simulated?: boolean } | null;
    funds: { safe: boolean; fee_sol?: string };
  };
};

export async function fetchAutopsy(signature: string, signal?: AbortSignal): Promise<Autopsy> {
  let resp: Response;
  try {
    resp = await fetch(`${API_URL}/autopsy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signature }),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new Error(`Can't reach the Rektopsy API at ${API_URL}.`);
  }
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(typeof body.detail === "string" ? body.detail : `Request failed (${resp.status}).`);
  return body as Autopsy;
}
