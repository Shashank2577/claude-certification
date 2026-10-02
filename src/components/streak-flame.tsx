"use client";

import { motion, useReducedMotion } from "motion/react";

/** A flame that grows with the streak and flickers while today's study is still pending. */
export function StreakFlame({ streak, activeToday, size = 22 }: { streak: number; activeToday: boolean; size?: number }) {
  const reduce = useReducedMotion();
  const lit = streak > 0;
  const intensity = Math.min(1, 0.55 + streak / 30);
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      style={{ originY: 1 }}
      animate={reduce || !lit ? undefined : { scaleY: [1, 1.06, 0.98, 1.04, 1], scaleX: [1, 0.97, 1.02, 0.99, 1] }}
      transition={{ duration: activeToday ? 2.4 : 1.2, repeat: Infinity, ease: "easeInOut" }}
    >
      <path
        d="M12 2.5c.6 3.1 2.6 4.9 4.3 6.8 1.6 1.8 2.7 3.7 2.7 6.1A7 7 0 0 1 12 22a7 7 0 0 1-7-6.6c-.1-2.4 1-4.4 2.7-5.9.3 1.6 1 2.7 2.1 3.3-.4-3.9.6-7.4 2.2-10.3Z"
        fill={lit ? "var(--flame)" : "var(--line-strong)"}
        opacity={lit ? intensity : 1}
      />
      <path
        d="M12 12.2c.4 1.6 1.4 2.5 2.1 3.4.6.8.9 1.6.9 2.4a3 3 0 0 1-6 0c0-1.3.6-2.3 1.6-3.1.1.8.5 1.3 1 1.6-.2-1.6.1-3 .4-4.3Z"
        fill={lit ? "var(--accent)" : "var(--surface-2)"}
      />
    </motion.svg>
  );
}
