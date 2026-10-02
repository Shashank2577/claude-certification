"use client";

import { motion } from "motion/react";
import { cos, sin } from "@/lib/trig";

/** Decorative clock face: sixty ticks with the first five minutes lit. */
export function CommitDialArt({ size = 220 }: { size?: number }) {
  const ticks = Array.from({ length: 60 }, (_, i) => i);
  const r = 96;
  return (
    <svg width={size} height={size} viewBox="0 0 220 220" aria-hidden>
      {ticks.map((i) => {
        const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
        const long = i % 5 === 0;
        const r1 = long ? r - 12 : r - 7;
        const lit = i < 5;
        return (
          <motion.line
            key={i}
            x1={110 + cos(a) * r1}
            y1={110 + sin(a) * r1}
            x2={110 + cos(a) * r}
            y2={110 + sin(a) * r}
            stroke={lit ? "var(--accent)" : "currentColor"}
            strokeOpacity={lit ? 1 : 0.28}
            strokeWidth={lit ? 3.2 : long ? 2 : 1.2}
            strokeLinecap="round"
            initial={lit ? { pathLength: 0, opacity: 0 } : false}
            animate={lit ? { pathLength: 1, opacity: 1 } : undefined}
            transition={{ delay: 0.4 + i * 0.12, duration: 0.3 }}
          />
        );
      })}
      <text x="110" y="122" textAnchor="middle" fill="currentColor" style={{ font: "600 38px var(--font-display)", fontVariantNumeric: "tabular-nums" }}>
        5:00
      </text>
    </svg>
  );
}
