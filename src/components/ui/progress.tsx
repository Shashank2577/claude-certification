"use client";

import { motion, useReducedMotion } from "motion/react";
import { clsx } from "clsx";
import type { ReactNode } from "react";

export function ProgressBar({
  value,
  color = "var(--accent)",
  className,
  label,
  height = 8,
}: {
  value: number; // 0..1
  color?: string;
  className?: string;
  label?: string;
  height?: number;
}) {
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      className={clsx("w-full overflow-hidden rounded-full bg-surface-2", className)}
      style={{ height }}
    >
      <motion.div
        className="h-full rounded-full"
        style={{ background: color, originX: 0 }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: v }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}

export function Ring({
  value,
  size = 96,
  stroke = 9,
  color = "var(--accent)",
  track = "var(--surface-2)",
  children,
  label,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  children?: ReactNode;
  label?: string;
}) {
  const reduce = useReducedMotion();
  const v = Math.max(0, Math.min(1, value || 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: reduce ? c * (1 - v) : c }}
          animate={{ strokeDashoffset: c * (1 - v) }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}
