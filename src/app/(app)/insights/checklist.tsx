"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { clsx } from "clsx";
import { Check } from "lucide-react";

const KEY = "ccp-exam-checklist";

/** Exam-day checklist. Ticks are a per-device convenience, kept in localStorage. */
export function Checklist({ items }: { items: string[] }) {
  const [ticked, setTicked] = useState<Set<number>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrating from localStorage
      if (raw) setTicked(new Set(JSON.parse(raw) as number[]));
    } catch {}
  }, []);

  const toggle = (i: number) => {
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      try {
        localStorage.setItem(KEY, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  };

  return (
    <div>
      <p className="mb-3 text-sm text-muted tabular" aria-live="polite">
        {ticked.size} of {items.length} ready
      </p>
      <ul className="space-y-1">
        {items.map((item, i) => {
          const on = ticked.has(i);
          return (
            <li key={i}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(i)}
                className="flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-surface-2/70"
              >
                <span className={clsx("mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border transition-colors", on ? "border-good bg-good text-white" : "border-line-strong")}>
                  {on ? (
                    <motion.span initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 20 }}>
                      <Check size={13} strokeWidth={3} />
                    </motion.span>
                  ) : null}
                </span>
                <span className={clsx("transition-colors", on && "text-muted line-through decoration-line-strong")}>{item}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
