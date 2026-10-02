"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { cos, sin } from "@/lib/trig";

/** Cycles through progress-based messages. Pauses on hover so people can finish reading. */
export function RotatingMessage({ messages }: { messages: string[] }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (messages.length < 2 || paused) return;
    const t = setInterval(() => setI((x) => (x + 1) % messages.length), 7000);
    return () => clearInterval(t);
  }, [messages.length, paused]);
  const msg = messages[i % messages.length] ?? "";
  return (
    <div className="relative min-h-[3.4em]" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} aria-live="polite">
      <AnimatePresence mode="wait">
        <motion.p
          key={msg}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6, filter: "blur(4px)" }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-[56ch] text-lg text-ink-2"
        >
          {msg}
        </motion.p>
      </AnimatePresence>
      {messages.length > 1 ? (
        <div className="mt-3 flex gap-1.5" role="tablist" aria-label="Messages">
          {messages.map((m, k) => (
            <button
              key={m}
              role="tab"
              aria-selected={k === i % messages.length}
              aria-label={`Message ${k + 1}`}
              onClick={() => setI(k)}
              className="h-1.5 rounded-full transition-[width,background-color] duration-300"
              style={{ width: k === i % messages.length ? 18 : 6, background: k === i % messages.length ? "var(--ink)" : "var(--line-strong)" }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export interface RadarDomain {
  id: string;
  short: string;
  /** Full domain name, shown as a tooltip. */
  name: string;
  mastery: number;
  color: string;
  attempts: number;
}

/** Split a label into at most two lines of roughly `max` characters, on word boundaries. */
function wrapLabel(text: string, max = 12): string[] {
  if (text.length <= max) return [text];
  const words = text.split(" ");
  let first = "";
  let i = 0;
  while (i < words.length && (first + (first ? " " : "") + words[i]).length <= max) {
    first += (first ? " " : "") + words[i];
    i++;
  }
  if (!first) return [text.slice(0, max - 1) + "…"];
  const rest = words.slice(i).join(" ");
  return rest ? [first, rest.length > max + 2 ? `${rest.slice(0, max + 1)}…` : rest] : [first];
}

/** Mastery radar. Falls back to bars when there are fewer than three domains. */
export function MasteryRadar({ domains }: { domains: RadarDomain[] }) {
  const reduce = useReducedMotion();
  if (domains.length < 3) {
    return (
      <ul className="space-y-4">
        {domains.map((d) => (
          <li key={d.id}>
            <div className="flex justify-between gap-3 text-sm">
              <span className="min-w-0 font-medium [overflow-wrap:anywhere]" title={d.name}>
                {d.short}
              </span>
              <span className="text-muted tabular">{d.attempts ? `${Math.round(d.mastery * 100)}%` : "no data"}</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
              <motion.div
                className="h-full rounded-full"
                style={{ background: d.color, originX: 0 }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: d.attempts ? d.mastery : 0 }}
                transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </li>
        ))}
      </ul>
    );
  }
  const size = 300;
  const c = size / 2;
  const R = 100;
  // Room around the chart for labels: about 80px each side, 34px top and bottom.
  const padX = 80;
  const padY = 34;
  const n = domains.length;
  const pt = (i: number, r: number) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return [c + cos(a) * r, c + sin(a) * r] as const;
  };
  // A shape built from domains with no answers would be a guess; draw it only once every domain has data.
  const complete = domains.every((d) => d.attempts > 0);
  const poly = domains.map((d, i) => pt(i, R * Math.max(0.04, d.mastery)).join(",")).join(" ");
  return (
    <figure className="mx-auto w-full max-w-[420px]">
      <svg
        viewBox={`${-padX} ${-padY} ${size + padX * 2} ${size + padY * 2}`}
        className="w-full"
        role="img"
        aria-label={`Domain mastery: ${domains.map((d) => `${d.name} ${d.attempts ? `${Math.round(d.mastery * 100)}%` : "no data"}`).join(", ")}`}
      >
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <polygon key={f} points={domains.map((_, i) => pt(i, R * f).join(",")).join(" ")} fill="none" stroke="var(--line)" strokeWidth={f === 1 ? 1.2 : 0.8} />
        ))}
        {domains.map((_, i) => {
          const [x, y] = pt(i, R);
          return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="var(--line)" strokeWidth={0.8} />;
        })}
        {/* Pass-line reference ring at ~69% raw */}
        <polygon points={domains.map((_, i) => pt(i, R * 0.69).join(",")).join(" ")} fill="none" stroke="var(--good)" strokeDasharray="3 4" strokeWidth={1} opacity={0.7} />
        {complete ? (
          <motion.polygon
            points={poly}
            fill="var(--accent)"
            fillOpacity={0.22}
            stroke="var(--accent-strong)"
            strokeWidth={2}
            strokeLinejoin="round"
            style={{ transformOrigin: `${c}px ${c}px` }}
            initial={reduce ? false : { scale: 0.2, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          />
        ) : null}
        {domains.map((d, i) => {
          if (!d.attempts) return null;
          const [x, y] = pt(i, R * Math.max(0.04, d.mastery));
          return <circle key={d.id} cx={x} cy={y} r={3.5} fill={d.color} stroke="var(--surface)" strokeWidth={1.5} />;
        })}
        {domains.map((d, i) => {
          const [x, y] = pt(i, R + 16);
          const anchor = Math.abs(x - c) < 8 ? "middle" : x > c ? "start" : "end";
          const lines = [...wrapLabel(d.short), d.attempts ? `${Math.round(d.mastery * 100)}%` : "no data"];
          const lh = 14;
          // Top labels grow upward, bottom ones downward, side ones stay centred on their spoke.
          const y0 = y < c - R * 0.5 ? y - (lines.length - 1) * lh : y > c + R * 0.5 ? y + 4 : y - ((lines.length - 1) * lh) / 2;
          return (
            <text key={d.id} x={x} y={y0} textAnchor={anchor} dominantBaseline="middle" fill="var(--ink-2)" style={{ font: "500 12.5px var(--font-display)" }}>
              <title>{d.name}</title>
              {lines.map((line, k) => (
                <tspan
                  key={k}
                  x={x}
                  dy={k === 0 ? 0 : lh}
                  fill={k === lines.length - 1 ? "var(--muted)" : undefined}
                  style={k === lines.length - 1 ? { fontVariantNumeric: "tabular-nums" } : undefined}
                >
                  {line}
                </tspan>
              ))}
            </text>
          );
        })}
      </svg>
      {!complete ? <figcaption className="mt-1 text-center text-xs text-muted">Answer a few questions in every domain to draw your shape.</figcaption> : null}
    </figure>
  );
}

/**
 * Semicircle gauge on the 100–1000 scale with the pass line marked. Shows a range, never a
 * single number, because the estimate has error bars. Locked until there's enough evidence.
 */
export function ReadinessGauge({
  low,
  high,
  mid,
  pass,
  locked,
  caption,
}: {
  low: number;
  high: number;
  mid: number;
  pass: number;
  locked: boolean;
  caption: string;
}) {
  const reduce = useReducedMotion();
  const W = 240;
  const cx = W / 2;
  const cy = 120;
  const r = 96;
  const frac = (v: number) => (Math.min(1000, Math.max(100, v)) - 100) / 900;
  const at = (f: number, rr = r) => {
    const a = Math.PI * (1 - f);
    return [cx + cos(a) * rr, cy - sin(a) * rr] as const;
  };
  const arc = (f0: number, f1: number) => {
    const [x0, y0] = at(f0);
    const [x1, y1] = at(f1);
    return `M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`;
  };
  const passF = frac(pass);
  const [px0, py0] = at(passF, r - 14);
  const [px1, py1] = at(passF, r + 10);
  const color = mid >= pass ? "var(--good)" : "var(--accent-strong)";
  return (
    <svg
      viewBox={`0 0 ${W} 136`}
      className="w-full max-w-[280px]"
      role="img"
      aria-label={locked ? `Readiness locked. Pass line ${pass} of 1000.` : `Estimated score ${low} to ${high} of 1000, pass line ${pass}`}
    >
      <path d={arc(0, 1)} stroke="var(--surface-2)" strokeWidth={14} fill="none" strokeLinecap="round" />
      {!locked ? (
        <>
          <motion.path
            d={arc(0, Math.max(0.001, frac(low)))}
            stroke={color}
            strokeWidth={14}
            fill="none"
            strokeLinecap="round"
            initial={reduce ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
          />
          {/* The uncertainty band */}
          <path d={arc(frac(low), Math.max(frac(low) + 0.001, frac(high)))} stroke={color} strokeOpacity={0.35} strokeWidth={14} fill="none" />
        </>
      ) : null}
      <line x1={px0} y1={py0} x2={px1} y2={py1} stroke="var(--ink)" strokeWidth={2} />
      <text x={px1} y={py1 - 6} textAnchor="middle" fill="var(--ink-2)" style={{ font: "600 10px var(--font-display)" }}>
        {pass}
      </text>
      {locked ? (
        <text x={cx} y={cy - 22} textAnchor="middle" fill="var(--muted)" style={{ font: "600 22px var(--font-display)" }}>
          Locked
        </text>
      ) : (
        <text x={cx} y={cy - 18} textAnchor="middle" fill="var(--ink)" style={{ font: "650 32px var(--font-display)", letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" }}>
          {low}–{high}
        </text>
      )}
      <text x={cx} y={cy + 2} textAnchor="middle" fill="var(--muted)" style={{ font: "500 11px var(--font-display)" }}>
        {caption}
      </text>
    </svg>
  );
}
