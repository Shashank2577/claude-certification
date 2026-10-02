"use client";

import { motion } from "motion/react";

/** Line of scaled scores (oldest first) against the pass line. */
export function ScoreTrend({ scores, pass }: { scores: number[]; pass: number }) {
  const W = 320;
  const H = 140;
  const pad = { l: 34, r: 10, t: 10, b: 20 };
  const min = 100;
  const max = 1000;
  const x = (i: number) => pad.l + (scores.length === 1 ? (W - pad.l - pad.r) / 2 : (i / (scores.length - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);
  const d = scores.map((s, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(s).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 w-full" role="img" aria-label={`Scores over time: ${scores.join(", ")}. Pass line ${pass}.`}>
      {[100, 550, 1000].map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} />
          <text x={pad.l - 6} y={y(v) + 3.5} textAnchor="end" fontSize={10} fill="var(--muted)">
            {v}
          </text>
        </g>
      ))}
      <line x1={pad.l} x2={W - pad.r} y1={y(pass)} y2={y(pass)} stroke="var(--good)" strokeWidth={1.5} strokeDasharray="4 4" />
      <text x={W - pad.r} y={y(pass) - 5} textAnchor="end" fontSize={10} fill="var(--good)">
        pass {pass}
      </text>
      {scores.length > 1 ? (
        <motion.path d={d} fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9 }} />
      ) : null}
      {scores.map((s, i) => (
        <circle key={i} cx={x(i)} cy={y(s)} r={4} fill={s >= pass ? "var(--good)" : "var(--accent)"} stroke="var(--surface)" strokeWidth={2} />
      ))}
    </svg>
  );
}
