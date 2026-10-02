"use client";

import { motion, useReducedMotion } from "motion/react";
import { NumberTicker } from "@/components/ui/number-ticker";
import { cos, sin } from "@/lib/trig";

/** Half-dial on the 100–1000 scale with a tick at the pass mark. */
export function ScoreDial({ score, pass }: { score: number; pass: number }) {
  const reduce = useReducedMotion();
  const W = 220;
  const r = 90;
  const cx = W / 2;
  const cy = 104;
  const frac = (v: number) => Math.max(0, Math.min(1, (v - 100) / 900));
  const point = (f: number, rr = r) => {
    const a = Math.PI * (1 - f);
    return [cx + cos(a) * rr, cy - sin(a) * rr] as const;
  };
  const arc = `M${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r},${cy}`;
  const len = Math.PI * r;
  const passed = score >= pass;
  const [px1, py1] = point(frac(pass), r - 14);
  const [px2, py2] = point(frac(pass), r + 12);
  const [lx, ly] = point(frac(pass), r + 24);
  return (
    <div className="relative w-[220px] shrink-0" role="img" aria-label={`Scaled score ${score}, pass mark ${pass}`}>
      <svg viewBox={`0 0 ${W} 124`} className="w-full overflow-visible" aria-hidden>
        <path d={arc} fill="none" stroke="var(--surface-2)" strokeWidth={14} strokeLinecap="round" />
        <motion.path
          d={arc}
          fill="none"
          stroke={passed ? "var(--good)" : "var(--accent)"}
          strokeWidth={14}
          strokeLinecap="round"
          strokeDasharray={len}
          initial={{ strokeDashoffset: reduce ? len * (1 - frac(score)) : len }}
          animate={{ strokeDashoffset: len * (1 - frac(score)) }}
          transition={{ duration: 1.3, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
        />
        <line x1={px1} y1={py1} x2={px2} y2={py2} stroke="var(--ink)" strokeWidth={2.5} strokeLinecap="round" />
        <text x={lx} y={ly} textAnchor="middle" fontSize={11} fill="var(--ink-2)">
          {pass}
        </text>
        <text x={cx - r} y={cy + 18} textAnchor="middle" fontSize={10} fill="var(--muted)">
          100
        </text>
        <text x={cx + r} y={cy + 18} textAnchor="middle" fontSize={10} fill="var(--muted)">
          1000
        </text>
      </svg>
      <div className="absolute inset-x-0 top-[52px] text-center">
        <NumberTicker value={score} duration={1.3} className="font-display text-5xl font-semibold tracking-tight" />
      </div>
    </div>
  );
}
