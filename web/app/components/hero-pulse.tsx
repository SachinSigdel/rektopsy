"use client";

import { useEffect, useRef } from "react";

// Live hero background: a heart-monitor trace sweeping over a faint grid.
// Every few beats it flatlines ("your transaction died"), then recovers.
// Decorative only: pointer-events off, hidden from screen readers, paused when
// off screen, and drawn once without motion for prefers-reduced-motion.

const GRID = 32; // px between grid lines
const BEAT = 230; // px per heartbeat
const SPEED = 120; // sweep speed, px per second
const GAP = 46; // erased gap ahead of the sweep, like a real monitor
const FLATLINE_EVERY = 6; // every 6th beat is a flatline
const FAIL = [232, 112, 58]; // --fail

// One heartbeat, phase 0..1 -> height -1..1 (P wave, QRS spike, T wave).
function beat(t: number): number {
  if (t > 0.1 && t < 0.18) return 0.12 * Math.sin(((t - 0.1) / 0.08) * Math.PI);
  if (t >= 0.28 && t < 0.31) return -0.14 * ((t - 0.28) / 0.03);
  if (t >= 0.31 && t < 0.335) return -0.14 + 1.14 * ((t - 0.31) / 0.025);
  if (t >= 0.335 && t < 0.365) return 1 - 1.4 * ((t - 0.335) / 0.03);
  if (t >= 0.365 && t < 0.39) return -0.4 + 0.4 * ((t - 0.365) / 0.025);
  if (t > 0.5 && t < 0.66) return 0.22 * Math.sin(((t - 0.5) / 0.16) * Math.PI);
  return 0;
}

export default function HeroPulse({ className = "" }: { className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = 0;
    let h = 0;
    let trace: Float32Array = new Float32Array(0); // y offset per x column, NaN = not drawn yet
    let head = 0; // sweep position, px
    let distance = 0; // total px swept, picks which beats flatline
    let last = 0;
    let carry = 0;
    let frame = 0;
    let visible = true;

    const sample = (d: number) => {
      const n = Math.floor(d / BEAT);
      if (n % FLATLINE_EVERY === FLATLINE_EVERY - 1) return 0;
      return beat((d % BEAT) / BEAT);
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = el.getBoundingClientRect();
      w = Math.max(1, Math.round(rect.width));
      h = Math.max(1, Math.round(rect.height));
      el.width = w * dpr;
      el.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      trace = new Float32Array(w).fill(NaN);
      if (reduce) for (let x = 0; x < w; x++) trace[x] = sample(x);
      head = reduce ? w : 0;
      distance = 0;
      draw();
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      // grid
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(237, 234, 227, 0.045)";
      ctx.beginPath();
      for (let x = (w % GRID) / 2; x < w; x += GRID) {
        ctx.moveTo(Math.round(x) + 0.5, 0);
        ctx.lineTo(Math.round(x) + 0.5, h);
      }
      for (let y = GRID; y < h; y += GRID) {
        ctx.moveTo(0, Math.round(y) + 0.5);
        ctx.lineTo(w, Math.round(y) + 0.5);
      }
      ctx.stroke();

      // trace: brightest at the sweep head, fading behind it
      const base = h * 0.58;
      const amp = Math.min(90, h * 0.16);
      ctx.lineWidth = 1.7;
      ctx.lineJoin = "round";
      const seg = 24;
      for (let start = 0; start < w; start += seg) {
        const age = (head - (start + seg / 2) + w) % w; // px behind the head
        const alpha = reduce ? 0.32 : Math.max(0, 0.6 * (1 - age / w) ** 1.3);
        if (alpha <= 0.01) continue;
        ctx.strokeStyle = `rgba(${FAIL[0]}, ${FAIL[1]}, ${FAIL[2]}, ${alpha})`;
        ctx.beginPath();
        let pen = false;
        for (let x = start; x <= Math.min(w - 1, start + seg); x++) {
          const v = trace[x];
          if (Number.isNaN(v)) {
            pen = false;
            continue;
          }
          const y = base - v * amp;
          if (pen) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
          pen = true;
        }
        ctx.stroke();
      }

      // glowing dot at the sweep head
      if (!reduce && head > 0) {
        const x = Math.min(w - 1, Math.floor(head));
        const v = trace[x];
        if (!Number.isNaN(v)) {
          const y = base - v * amp;
          const g = ctx.createRadialGradient(x, y, 0, x, y, 14);
          g.addColorStop(0, `rgba(${FAIL[0]}, ${FAIL[1]}, ${FAIL[2]}, 0.75)`);
          g.addColorStop(1, `rgba(${FAIL[0]}, ${FAIL[1]}, ${FAIL[2]}, 0)`);
          ctx.fillStyle = g;
          ctx.fillRect(x - 14, y - 14, 28, 28);
          ctx.fillStyle = `rgba(${FAIL[0]}, ${FAIL[1]}, ${FAIL[2]}, 0.9)`;
          ctx.beginPath();
          ctx.arc(x, y, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    const tick = (now: number) => {
      frame = 0;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      carry += SPEED * dt; // whole pixels only; the remainder carries to the next frame
      for (; carry >= 1; carry -= 1) {
        const x = Math.floor(head) % w;
        trace[x] = sample(distance);
        for (let k = 1; k <= GAP; k++) trace[(x + k) % w] = NaN;
        head = (head + 1) % w;
        distance += 1;
      }
      draw();
      if (visible) frame = requestAnimationFrame(tick);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !reduce && !frame) {
        last = 0;
        frame = requestAnimationFrame(tick);
      }
    });
    if (!reduce) io.observe(el);

    return () => {
      ro.disconnect();
      io.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return <canvas ref={canvas} aria-hidden="true" className={`pointer-events-none block size-full ${className}`} />;
}
