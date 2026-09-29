/*
 * Rektopsy embeddable widget. No dependencies, no build step.
 *
 *   <script src="https://YOUR-API-HOST/widget.js" defer></script>
 *   <rektopsy-autopsy></rektopsy-autopsy>                      <!-- input box -->
 *   <rektopsy-autopsy signature="5VER..."></rektopsy-autopsy>  <!-- runs at once -->
 *
 * Attributes: `signature` (optional), `api` (defaults to the origin this script
 * was loaded from). Events: `rektopsy:result` (detail = autopsy JSON) and
 * `rektopsy:error` (detail = { message }), both bubbling.
 *
 * Styles live in a shadow root, so host CSS can't break it and it can't leak out.
 * API data is only ever inserted as text (textContent), never as HTML.
 * Read-only: no wallet, no signing, no keys.
 */
(() => {
  const TAG = "rektopsy-autopsy";
  if (customElements.get(TAG)) return;

  // document.currentScript is only set while this file first runs.
  const SCRIPT_ORIGIN = document.currentScript?.src ? new URL(document.currentScript.src).origin : null;
  const SIGNATURE_RE = /^[1-9A-HJ-NP-Za-km-z]{86,88}$/;

  const LABELS = {
    slippage: "Price moved too far (slippage)",
    compute_budget: "Ran out of compute",
    insufficient_funds: "Not enough balance",
    account_not_found: "Missing account",
    unknown_custom: "Unidentified error",
    never_landed: "Never reached the chain",
    succeeded: "This transaction didn't fail",
    other: "Other error",
  };

  const CSS = `
    :host { display: block; max-width: 640px; color-scheme: dark;
      --bg: #0c0b0a; --surface: #151311; --surface-2: #1d1a17; --line: #2b2723;
      --text: #ece6df; --muted: #9a9187; --fail: #ff7a3d; --fix: #2ed3b7;
      font: 14px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    .card { background: var(--bg); color: var(--text); border: 1px solid var(--line);
      border-radius: 14px; padding: 16px; }
    .brand { font: 11px/1 ui-monospace, Menlo, monospace; letter-spacing: .18em;
      text-transform: uppercase; color: var(--fail); margin: 0 0 12px; }
    form { display: flex; gap: 8px; flex-wrap: wrap; }
    input { flex: 1 1 220px; min-width: 0; background: var(--surface); color: var(--text);
      border: 1px solid var(--line); border-radius: 8px; padding: 9px 11px;
      font: 13px ui-monospace, Menlo, monospace; outline: none; }
    input:focus { border-color: var(--muted); }
    button { background: var(--text); color: var(--bg); border: 0; border-radius: 8px;
      padding: 9px 14px; font: inherit; font-weight: 600; cursor: pointer; }
    button:disabled { opacity: .4; cursor: default; }
    .status { color: var(--muted); margin: 12px 0 0; }
    .error { margin: 12px 0 0; padding: 9px 11px; border-radius: 8px;
      border: 1px solid color-mix(in srgb, var(--fail) 40%, transparent);
      background: color-mix(in srgb, var(--fail) 12%, transparent); }
    .pill { display: inline-block; margin-top: 14px; padding: 3px 10px; border-radius: 99px;
      font-size: 12px; font-weight: 600; }
    .pill.fail { color: var(--fail); background: color-mix(in srgb, var(--fail) 13%, transparent); }
    .pill.ok { color: var(--fix); background: color-mix(in srgb, var(--fix) 12%, transparent); }
    section { margin-top: 10px; padding: 12px 14px; border-radius: 10px; background: var(--surface);
      border: 1px solid var(--line); }
    section.fail { border-color: color-mix(in srgb, var(--fail) 35%, transparent); }
    section.fix { border-color: color-mix(in srgb, var(--fix) 30%, transparent); }
    h3 { margin: 0 0 4px; font: 400 19px/1.2 Georgia, "Times New Roman", serif; }
    section.fail h3 { color: var(--fail); }
    section.fix h3 { color: var(--fix); }
    p { margin: 0; }
    dl { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 6px 16px;
      margin: 10px 0 0; padding-top: 10px; border-top: 1px solid var(--line); font-size: 13px; }
    dt { color: var(--muted); }
    dd { margin: 0; font-family: ui-monospace, Menlo, monospace; word-break: break-all; }
    .note { margin-top: 8px; font-size: 12px; color: var(--muted); }
    details { margin-top: 10px; }
    summary { cursor: pointer; color: var(--muted); }
    ul { list-style: none; margin: 8px 0 0; padding: 0; font-size: 13px; }
    li { padding: 6px 0; border-top: 1px solid var(--line); }
    li:first-child { border-top: 0; }
    code { display: block; margin-top: 4px; padding: 6px 8px; border-radius: 6px; overflow-x: auto;
      white-space: pre; background: var(--surface-2); font: 12px ui-monospace, Menlo, monospace; }
    .src { font-family: ui-monospace, Menlo, monospace; font-size: 12px; }
    footer { margin-top: 12px; display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap;
      font-size: 12px; color: var(--muted); }
    a { color: var(--muted); }
  `;

  // Build DOM from text only: never innerHTML with data from the API.
  function h(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
    for (const c of children) if (c != null) node.append(c instanceof Node ? c : String(c));
    return node;
  }

  // "would_receive_raw" -> "Would receive (raw units)"
  function label(key) {
    const units = [["_raw", " (raw units)"], ["_sol", " (SOL)"], ["_pct", " (%)"], ["_bps", " (bps)"],
                   ["_lamports", " (lamports)"]];
    let suffix = "";
    for (const [end, unit] of units) {
      if (key.endsWith(end)) { key = key.slice(0, -end.length); suffix = unit; break; }
    }
    const words = key.replace(/_pct_of_/, " % of ").replace(/_/g, " ");
    return words.charAt(0).toUpperCase() + words.slice(1) + suffix;
  }

  class RektopsyAutopsy extends HTMLElement {
    static observedAttributes = ["signature"];

    constructor() {
      super();
      this.shadow = this.attachShadow({ mode: "open" });
      this.controller = null;
    }

    get api() {
      return (this.getAttribute("api") || SCRIPT_ORIGIN || "http://localhost:8000").replace(/\/+$/, "");
    }

    connectedCallback() {
      if (this.card) return;
      this.card = h("div", { class: "card", part: "card" });
      this.shadow.append(h("style", {}, CSS), this.card);
      this.renderShell();
      const sig = this.getAttribute("signature");
      if (sig) this.run(sig);
    }

    attributeChangedCallback(name, oldValue, value) {
      if (this.card && value && value !== oldValue) this.run(value);
    }

    renderShell() {
      this.card.replaceChildren(h("p", { class: "brand" }, "Rektopsy · why did it fail?"));
      if (!this.getAttribute("signature")) {
        this.input = h("input", { placeholder: "Transaction signature", "aria-label": "Transaction signature",
                                  spellcheck: "false", autocomplete: "off" });
        this.button = h("button", { type: "submit" }, "Run autopsy");
        const form = h("form", {}, this.input, this.button);
        form.addEventListener("submit", (e) => {
          e.preventDefault();
          const sig = this.input.value.trim();
          if (sig) this.run(sig);
        });
        this.card.append(form);
      }
      this.out = h("div", { "aria-live": "polite" });
      this.card.append(this.out);
    }

    async run(signature) {
      signature = signature.trim();
      this.controller?.abort();
      const controller = (this.controller = new AbortController());
      if (!SIGNATURE_RE.test(signature)) {
        return this.fail("That doesn't look like a Solana transaction signature (86-88 base58 characters).");
      }
      this.out.replaceChildren(h("p", { class: "status" }, "Reading the transaction from Solana…"));
      if (this.button) this.button.disabled = true;
      try {
        const resp = await fetch(`${this.api}/autopsy`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signature }),
          signal: controller.signal,
        });
        const body = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(typeof body.detail === "string" ? body.detail : `Request failed (${resp.status}).`);
        if (controller !== this.controller) return;
        this.renderResult(body);
        this.dispatchEvent(new CustomEvent("rektopsy:result", { detail: body, bubbles: true, composed: true }));
      } catch (e) {
        if (e.name === "AbortError") return;
        this.fail(e instanceof TypeError ? `Can't reach the Rektopsy API at ${this.api}.` : e.message);
      } finally {
        if (this.button && controller === this.controller) this.button.disabled = false;
      }
    }

    fail(message) {
      this.out.replaceChildren(h("p", { class: "error", role: "alert" }, message));
      this.dispatchEvent(new CustomEvent("rektopsy:error", { detail: { message }, bubbles: true, composed: true }));
    }

    renderResult(r) {
      const failed = r.category !== "succeeded";
      const fix = (r.brief && r.brief.fix) || {};
      const safe = !!(r.brief && r.brief.funds && r.brief.funds.safe);
      const values = Object.entries(fix.values || {}).filter(([, v]) => v !== null && v !== "");
      const logLines = r.log_lines || {};

      const fixSection = failed && r.fix
        ? h("section", { class: "fix" }, h("h3", {}, "The fix"), h("p", {}, r.fix),
            values.length
              ? h("dl", {}, ...values.map(([k, v]) => h("div", {}, h("dt", {}, label(k)), h("dd", {}, String(v)))))
              : null,
            failed && fix.simulated === false ? h("p", { class: "note" }, "Suggested, not simulated.") : null)
        : null;

      const evidence = h("ul", {}, ...(r.evidence || []).map((e) =>
        h("li", {}, `${e.claim}: `, h("span", { class: "src" }, e.source),
          ...[...String(e.source).matchAll(/logs\[(\d+)\]/g)]
            .map(([, n]) => (logLines[n] ? h("code", {}, logLines[n]) : null)))));

      const explorer = h("a", { href: `https://explorer.solana.com/tx/${encodeURIComponent(r.signature)}`,
                                target: "_blank", rel: "noopener noreferrer" }, "Solana Explorer ↗");

      this.out.replaceChildren(
        h("span", { class: `pill ${failed ? "fail" : "ok"}` }, LABELS[r.category] || r.category),
        h("section", { class: failed ? "fail" : "fix" }, h("h3", {}, failed ? "Cause of death" : "What happened"),
          h("p", {}, r.cause)),
        fixSection,
        h("section", { class: safe ? "fix" : "fail" }, h("h3", {}, "Your funds"), h("p", {}, r.funds)),
        h("details", {}, h("summary", {}, "Evidence: where each claim comes from"), evidence),
        h("footer", {}, h("span", {}, "Read-only · no wallet, no keys"), explorer),
      );
    }
  }

  customElements.define(TAG, RektopsyAutopsy);
})();
