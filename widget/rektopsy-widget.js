/*
 * Rektopsy embeddable widget. No dependencies, no build step. Design: designs/Widget.html.
 *
 *   <script src="https://YOUR-API-HOST/widget.js" defer></script>
 *   <rektopsy-autopsy></rektopsy-autopsy>                      <!-- input box -->
 *   <rektopsy-autopsy signature="5VER..."></rektopsy-autopsy>  <!-- runs at once -->
 *
 * or from code:  Rektopsy.attach({ sig, theme: "dark", target: "#help" })
 *
 * Attributes (attach() options in brackets):
 *   signature [sig]  run at once; without it the widget shows an input box
 *   api       [api]  API origin; defaults to the origin this script was loaded from
 *   report    [report]  web UI origin; adds a "Full autopsy" link to /report?sig=...
 *   theme     [theme]   only "dark" for now
 * Events (bubbling): `rektopsy:result` (detail = autopsy JSON), `rektopsy:error`
 * (detail = { message }), `rektopsy:dismiss`.
 *
 * Styles live in a shadow root, so host CSS can't break it and it can't leak out.
 * API data is only ever inserted as text (textContent), never as HTML.
 * Read-only: no wallet, no signing, no keys. The retry button is a disabled preview.
 */
(() => {
  const TAG = "rektopsy-autopsy";
  if (customElements.get(TAG)) return;

  // document.currentScript is only set while this file first runs.
  const SCRIPT_ORIGIN = document.currentScript?.src ? new URL(document.currentScript.src).origin : null;
  const SIGNATURE_RE = /^[1-9A-HJ-NP-Za-km-z]{86,88}$/;

  const TITLES = {
    slippage: "Your swap didn’t go through",
    compute_budget: "Your transaction ran out of compute",
    insufficient_funds: "Not enough balance to go through",
    account_not_found: "An account it needed doesn’t exist yet",
    unknown_custom: "Your transaction was refused",
    never_landed: "Your transaction never reached the chain",
    succeeded: "This transaction went through",
    other: "Your transaction didn’t go through",
  };

  const CSS = `
    :host { display: block; max-width: 440px; color-scheme: dark;
      --bg: #0b0c0e; --surface: #141619; --surface-2: #1b1e22; --line: #262a2f; --line-2: #1f2329;
      --text: #edeae3; --text-2: #c9c5bb; --muted: #9a968c; --faint: #6f6c65; --log: #7e7b73;
      --fail: #e8703a; --fail-hover: #f28b59; --fail-text: #f0906b;
      --fix: #4fb3a0; --fix-text: #7fc9ba; --fix-body: #d6dedb; --fix-muted: #7e948f; --fix-ink: #062421;
      --fix-bg: #10181a; --fix-border: #234641;
      --sans: "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
      --mono: "IBM Plex Mono", ui-monospace, Menlo, monospace;
      font: 14px/1.55 var(--sans); }
    :host([hidden]) { display: none; }
    * { box-sizing: border-box; }
    .card { background: var(--surface); color: var(--text); border: 1px solid var(--line);
      border-radius: 18px; padding: 24px; display: flex; flex-direction: column; gap: 18px; }
    .row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .title { display: flex; align-items: center; gap: 9px; font-size: 15px; font-weight: 500; }
    .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--fail); flex: none; }
    .dot.ok { background: var(--fix); }
    .icon-btn { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
      background: transparent; border: 0; border-radius: 7px; cursor: pointer; padding: 0; }
    .icon-btn:hover { background: var(--surface-2); }
    p { margin: 0; }
    .summary { font-size: 14.5px; line-height: 1.65; color: var(--text-2); }
    form { display: flex; gap: 8px; flex-wrap: wrap; }
    input { flex: 1 1 200px; min-width: 0; height: 44px; background: var(--bg); color: var(--text);
      border: 1px solid var(--line); border-radius: 10px; padding: 0 12px; font: 13px var(--mono); outline: none; }
    input::placeholder { color: var(--faint); }
    input:focus { border-color: var(--muted); }
    .run { height: 44px; padding: 0 16px; background: var(--fail); color: #150a05; border: 0; border-radius: 10px;
      font: 500 14px var(--sans); cursor: pointer; }
    .run:hover { background: var(--fail-hover); }
    .run:disabled { opacity: .45; cursor: default; }
    .status { color: var(--muted); }
    .error { padding: 10px 12px; border-radius: 10px; border: 1px solid #5a2a1c; background: #2a1410;
      color: var(--fail-text); }
    .fix { background: var(--fix-bg); border: 1px solid var(--fix-border); border-radius: 13px; padding: 16px;
      display: flex; flex-direction: column; gap: 12px; }
    .eyebrow { font: 10.5px var(--mono); letter-spacing: 1.3px; text-transform: uppercase; color: var(--fix-text); }
    .fix p { font-size: 14px; line-height: 1.6; color: var(--fix-body); }
    .retry { position: relative; height: 46px; width: 100%; background: var(--fix); color: var(--fix-ink); border: 0;
      border-radius: 10px; font: 500 14.5px var(--sans); opacity: .55; cursor: not-allowed; }
    .soon { position: absolute; top: -8px; right: -6px; padding: 2px 6px; border-radius: 6px;
      border: 1px solid var(--line); background: var(--surface-2); color: var(--muted);
      font: 9.5px var(--mono); letter-spacing: .5px; text-transform: uppercase; }
    .note { font-size: 12px; color: var(--fix-muted); }
    .vitals { display: flex; flex-direction: column; gap: 9px; }
    .vitals .row { font-size: 13px; }
    .k { color: var(--muted); }
    .v { font-family: var(--mono); text-align: right; word-break: break-all; }
    .v.good { color: var(--fix-text); } .v.bad { color: var(--fail-text); } .v.dim { color: var(--muted); }
    details { font-size: 12.5px; color: var(--muted); }
    summary { cursor: pointer; }
    ul { list-style: none; margin: 8px 0 0; padding: 0; }
    li { padding: 6px 0; border-top: 1px solid var(--line); }
    li:first-child { border-top: 0; }
    .src { font-family: var(--mono); font-size: 11.5px; word-break: break-word; }
    code { display: block; margin-top: 4px; padding: 6px 8px; border-radius: 6px; overflow-x: auto;
      white-space: pre; background: var(--bg); color: var(--log); font: 11.5px var(--mono); }
    hr { height: 1px; margin: 0; border: 0; background: var(--line); }
    a { color: var(--fail); text-decoration: none; font-size: 13.5px; }
    a:hover { color: var(--fail-hover); }
    .brand { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--faint); }
  `;

  const SVG_NS = "http://www.w3.org/2000/svg";
  function icon(pathD, color, size, width = 2) {
    const svg = document.createElementNS(SVG_NS, "svg");
    for (const [k, v] of Object.entries({ width: size, height: size, viewBox: "0 0 24 24", fill: "none",
      stroke: color, "stroke-width": width, "stroke-linecap": "round", "stroke-linejoin": "round",
      "aria-hidden": "true" })) svg.setAttribute(k, v);
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", pathD);
    svg.append(path);
    return svg;
  }
  const PULSE = "M3 12h4l2 5 4-12 2 7h6";
  const CROSS = "M18 6 6 18M6 6l12 12";

  // Build DOM from text only: never innerHTML with data from the API.
  function h(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
    for (const c of children) if (c != null) node.append(c instanceof Node ? c : String(c));
    return node;
  }

  // Retry label from values Python computed; the button itself is a disabled preview.
  function retryLabel(r) {
    const v = (r.brief && r.brief.fix && r.brief.fix.values) || {};
    switch (r.category) {
      case "slippage": return v.suggested_slippage_pct != null ? `Retry with ${v.suggested_slippage_pct}%` : "Retry with a fresh quote";
      case "compute_budget": return v.new_cu_limit != null ? `Retry with ${Number(v.new_cu_limit).toLocaleString("en-US")} CU` : "Retry";
      case "insufficient_funds": return "Retry after topping up";
      case "never_landed": return "Retry";
      default: return null;
    }
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

    get reportBase() {
      const base = this.getAttribute("report");
      return base ? base.replace(/\/+$/, "") : null;
    }

    connectedCallback() {
      if (this.card) return;
      this.card = h("div", { class: "card", part: "card" });
      this.shadow.append(h("style", {}, CSS), this.card);
      const sig = this.getAttribute("signature");
      if (sig) this.run(sig);
      else this.renderInput();
    }

    attributeChangedCallback(name, oldValue, value) {
      if (this.card && value && value !== oldValue) this.run(value);
    }

    header(text, ok = false) {
      const dismiss = h("button", { type: "button", class: "icon-btn", "aria-label": "Dismiss" },
        icon(CROSS, "#6F6C65", 14));
      dismiss.addEventListener("click", () => {
        this.hidden = true;
        this.dispatchEvent(new CustomEvent("rektopsy:dismiss", { bubbles: true, composed: true }));
      });
      return h("div", { class: "row" },
        h("div", { class: "title" }, h("span", { class: ok ? "dot ok" : "dot" }), text), dismiss);
    }

    footer(signature) {
      const link = this.reportBase
        ? h("a", { href: `${this.reportBase}/report?sig=${encodeURIComponent(signature)}`, target: "_blank",
                   rel: "noopener noreferrer" }, "Full autopsy →")
        : h("a", { href: `https://explorer.solana.com/tx/${encodeURIComponent(signature)}`, target: "_blank",
                   rel: "noopener noreferrer" }, "Solana Explorer ↗");
      return h("div", { class: "row" }, link, h("span", { class: "brand" }, icon(PULSE, "#6F6C65", 12, 1.8), "Rektopsy"));
    }

    renderInput(message) {
      this.input = h("input", { placeholder: "Paste a transaction signature", "aria-label": "Transaction signature",
                                spellcheck: "false", autocomplete: "off" });
      this.button = h("button", { type: "submit", class: "run" }, "Run autopsy");
      const form = h("form", {}, this.input, this.button);
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const sig = this.input.value.trim();
        if (sig) this.run(sig);
      });
      this.out = h("div", { "aria-live": "polite" });
      if (message) this.out.append(h("p", { class: "error", role: "alert" }, message));
      this.card.replaceChildren(this.header("Why did my transaction fail?"), form, this.out);
    }

    async run(signature) {
      signature = signature.trim();
      this.controller?.abort();
      const controller = (this.controller = new AbortController());
      if (!this.out) {
        // Pinned mode (or a new signature after a result): no input box while loading.
        this.out = h("div", { "aria-live": "polite" });
        this.card.replaceChildren(this.header("Why did my transaction fail?"), this.out);
      }
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
      if (!this.out || !this.out.isConnected) this.renderInput();
      this.out.replaceChildren(h("p", { class: "error", role: "alert" }, message));
      this.dispatchEvent(new CustomEvent("rektopsy:error", { detail: { message }, bubbles: true, composed: true }));
    }

    renderResult(r) {
      const ok = r.category === "succeeded";
      const brief = r.brief || {};
      const funds = brief.funds || {};
      const cause = brief.cause || {};
      const logLines = r.log_lines || {};
      const retry = ok ? null : retryLabel(r);

      const fix = !ok && r.fix
        ? h("div", { class: "fix" },
            h("span", { class: "eyebrow" }, "Suggested fix"),
            h("p", {}, r.fix),
            retry ? h("button", { type: "button", class: "retry", disabled: "",
                                  title: "Coming soon: Rektopsy is read-only for now (no wallet, no signing)." },
                      retry, h("span", { class: "soon" }, "Soon")) : null,
            h("span", { class: "note" },
              retry ? "One-click retry is coming. For now, change this in your wallet or app." : "Suggested, not simulated."))
        : null;

      const errorText = cause.custom_code != null ? `0x${Number(cause.custom_code).toString(16)}`
        : cause.error_name || (r.category === "never_landed" ? "not landed" : ok ? "none" : "—");
      const vitals = h("div", { class: "vitals" },
        h("div", { class: "row" }, h("span", { class: "k" }, "Fee paid"),
          h("span", { class: "v" }, r.tx ? `${funds.fee_sol} SOL` : "none")),
        h("div", { class: "row" }, h("span", { class: "k" }, "Tokens lost"),
          h("span", { class: funds.safe ? "v good" : "v bad" }, funds.safe ? "none" : "check balances")),
        h("div", { class: "row" }, h("span", { class: "k" }, "Error"), h("span", { class: "v dim" }, errorText)));

      const evidence = h("details", {}, h("summary", {}, "Evidence: where each claim comes from"),
        h("ul", {}, ...(r.evidence || []).map((e) =>
          h("li", {}, `${e.claim}: `, h("span", { class: "src" }, e.source),
            ...[...String(e.source).matchAll(/logs\[(\d+)\]/g)]
              .map(([, n]) => (logLines[n] ? h("code", {}, logLines[n]) : null))))));

      this.input = this.button = null;
      this.out = null;
      this.card.replaceChildren(
        this.header(TITLES[r.category] || TITLES.other, ok),
        h("p", { class: "summary" }, `${r.cause} ${r.funds}`),
        fix,
        vitals,
        evidence,
        h("hr"),
        this.footer(r.signature),
      );
    }
  }

  customElements.define(TAG, RektopsyAutopsy);

  // Rektopsy.attach({ sig, theme, target, api, report }) -> the created element.
  if (!window.Rektopsy) {
    window.Rektopsy = {
      attach(opts = {}) {
        const el = document.createElement(TAG);
        for (const [attr, key] of [["api", "api"], ["report", "report"], ["theme", "theme"]]) {
          if (opts[key]) el.setAttribute(attr, opts[key]);
        }
        if (opts.sig) el.setAttribute("signature", opts.sig);
        const target = typeof opts.target === "string" ? document.querySelector(opts.target) : opts.target;
        (target || document.body).append(el);
        return el;
      },
    };
  }
})();
