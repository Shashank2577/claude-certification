"use client";

import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { useFocus } from "@/components/focus-timer";
import { cos, sin } from "@/lib/trig";

/**
 * The anti-procrastination button: commit to five minutes, not to "studying".
 * Starts a five-minute sprint timer and opens the next item in the plan.
 */
export function CommitDial({ href, nextTitle, kindLabel }: { href: string; nextTitle: string; kindLabel: string }) {
  const router = useRouter();
  const focus = useFocus();
  const reduce = useReducedMotion();
  const [hover, setHover] = useState(false);
  const [launching, setLaunching] = useState(false);
  const busy = focus.phase !== "idle";

  const go = () => {
    if (launching) return;
    setLaunching(true);
    if (!busy) focus.start("sprint", 5);
    // Let the tick sweep land before navigating.
    setTimeout(() => router.push(href), reduce ? 0 : 380);
  };

  const ticks = Array.from({ length: 60 }, (_, i) => i);
  const R = 118;
  return (
    <div className="flex flex-col items-center text-center">
      <motion.button
        type="button"
        onClick={go}
        onHoverStart={() => setHover(true)}
        onHoverEnd={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        whileTap={{ scale: 0.96 }}
        className="group relative grid size-[248px] place-items-center rounded-full outline-offset-4 sm:size-[268px]"
        aria-label={`Start the next five minutes: ${nextTitle}`}
      >
        <svg viewBox="0 0 268 268" className="absolute inset-0 size-full" aria-hidden>
          <circle cx="134" cy="134" r="104" fill="var(--ink)" />
          {ticks.map((i) => {
            const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
            const major = i % 5 === 0;
            const lit = i < 5 || (launching && i < 60);
            const r1 = major ? R - 11 : R - 6;
            return (
              <motion.line
                key={i}
                x1={134 + cos(a) * r1}
                y1={134 + sin(a) * r1}
                x2={134 + cos(a) * R}
                y2={134 + sin(a) * R}
                strokeLinecap="round"
                initial={false}
                animate={{
                  stroke: lit ? "var(--accent)" : "var(--line-strong)",
                  strokeWidth: i < 5 ? 3.4 : major ? 2.2 : 1.3,
                  opacity: lit ? 1 : hover ? 0.9 : 0.6,
                }}
                transition={{ duration: 0.18, delay: launching ? i * 0.005 : hover && i < 5 ? i * 0.04 : 0 }}
              />
            );
          })}
          {/* The five-minute wedge, glowing on hover */}
          <motion.path
            d={describeArc(134, 134, 96, 0, 30)}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="6"
            strokeLinecap="round"
            initial={false}
            animate={{ pathLength: hover || launching ? 1 : 0.0001, opacity: hover || launching ? 1 : 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          />
        </svg>
        <span className="relative flex flex-col items-center text-bg">
          <span className="text-sm text-bg/70">{busy ? "Timer running" : "Commit to"}</span>
          <span className="font-display text-[3.4rem] leading-none font-semibold tracking-[-0.04em] tabular">5:00</span>
          <span className="mt-1.5 rounded-full bg-accent px-3 py-1 text-sm font-semibold text-accent-ink">{launching ? "Here we go" : "Start now"}</span>
        </span>
      </motion.button>
      <p className="mt-5 max-w-[30ch] text-sm text-muted">
        {kindLabel}: <span className="font-medium text-ink">{nextTitle}</span>
      </p>
      <p className="mt-1 text-xs text-muted">Stop after five minutes if you want. You probably won’t.</p>
    </div>
  );
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * cos(a), y: cy + r * sin(a) };
}

function describeArc(cx: number, cy: number, r: number, start: number, end: number) {
  const s = polar(cx, cy, r, start);
  const e = polar(cx, cy, r, end);
  return `M ${s.x} ${s.y} A ${r} ${r} 0 0 1 ${e.x} ${e.y}`;
}
