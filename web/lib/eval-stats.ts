// From eval/results.json and eval/cases.json (25 real mainnet transactions).
// Update these by hand if the eval is re-run and the numbers change.
export const EVAL = {
  cases: 25,
  correctCausePct: 100,
  madeUpNumbers: 0,
  baselineMadeUpNumbers: 8,
  mix: [
    { label: "Slippage", pct: 28 }, // 7 of 25
    { label: "Insufficient funds", pct: 20 }, // 5 of 25
    { label: "Compute budget", pct: 12 }, // 3 of 25
  ],
};
