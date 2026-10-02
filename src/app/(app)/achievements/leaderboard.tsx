"use client";

import { useState, useTransition } from "react";
import { clsx } from "clsx";
import { motion } from "motion/react";
import { setLeaderboardOptOut } from "@/app/actions/profile";
import { Card, CardHeader } from "@/components/ui/card";

interface Row {
  userId: number;
  name: string;
  xp: number;
}

export function Leaderboard({ week, all, meId, optedOut }: { week: Row[]; all: Row[]; meId: number; optedOut: boolean }) {
  const [range, setRange] = useState<"week" | "all">("week");
  const [out, setOut] = useState(optedOut);
  const [pending, start] = useTransition();
  const rows = range === "week" ? week : all;
  const max = rows[0]?.xp || 1;

  return (
    <Card className="p-5">
      <CardHeader
        title="Leaderboard"
        sub="Everyone studying on this site, by XP."
        action={
          <div role="tablist" aria-label="Time range" className="flex rounded-xl bg-surface-2 p-0.5 text-sm">
            {(["week", "all"] as const).map((r) => (
              <button
                key={r}
                role="tab"
                aria-selected={range === r}
                onClick={() => setRange(r)}
                className={clsx("rounded-lg px-3 py-1 font-medium", range === r ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink")}
              >
                {r === "week" ? "This week" : "All time"}
              </button>
            ))}
          </div>
        }
      />
      {rows.length === 0 ? (
        <p className="mt-6 rounded-xl bg-surface-2 px-4 py-6 text-center text-sm text-ink-2">No one has earned XP {range === "week" ? "this week" : "yet"}. Answer a question to take first place.</p>
      ) : (
        <ol className="mt-4 space-y-1.5">
          {rows.map((r, i) => {
            const me = r.userId === meId;
            return (
              <li key={r.userId} className={clsx("relative overflow-hidden rounded-xl px-3 py-2", me ? "ring-2 ring-accent" : "")}>
                <motion.span
                  aria-hidden
                  className="absolute inset-y-0 left-0 bg-surface-2"
                  initial={{ width: 0 }}
                  animate={{ width: `${(r.xp / max) * 100}%` }}
                  transition={{ duration: 0.6, delay: i * 0.03, ease: [0.22, 1, 0.36, 1] }}
                />
                <span className="relative flex items-center gap-3">
                  <span className="w-6 text-right font-display font-semibold text-muted tabular">{i + 1}</span>
                  <span className={clsx("flex-1 truncate", me && "font-semibold")}>
                    {r.name}
                    {me ? <span className="ml-1.5 text-xs font-normal text-muted">(you)</span> : null}
                  </span>
                  <span className="font-display font-semibold tabular">{r.xp.toLocaleString()}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
      <label className="mt-5 flex cursor-pointer items-start gap-3 border-t border-line pt-4 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-[var(--ink)]"
          checked={out}
          disabled={pending}
          onChange={(e) => {
            const v = e.target.checked;
            setOut(v);
            start(() => setLeaderboardOptOut(v));
          }}
        />
        <span>
          <span className="font-medium">Hide me from the leaderboard</span>
          <span className="block text-muted">You keep your XP and badges; other people just won’t see your name here.</span>
        </span>
      </label>
    </Card>
  );
}
