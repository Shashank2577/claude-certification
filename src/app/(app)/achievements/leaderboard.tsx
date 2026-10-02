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

const COLLAPSED_ROWS = 3;

export function Leaderboard({ week, all, meId, optedOut }: { week: Row[]; all: Row[]; meId: number; optedOut: boolean }) {
  const [range, setRange] = useState<"week" | "all">("week");
  const [out, setOut] = useState(optedOut);
  const [pending, start] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const rows = range === "week" ? week : all;
  const max = rows[0]?.xp || 1;
  // Standard competition ranking: equal XP shares a rank.
  const ranks = rows.map((r) => rows.findIndex((x) => x.xp === r.xp) + 1);
  const allTied = rows.length > 1 && rows.every((r) => r.xp === rows[0].xp);
  const collapsible = rows.length > COLLAPSED_ROWS + 1 || (allTied && rows.length > COLLAPSED_ROWS);
  const myIndex = rows.findIndex((r) => r.userId === meId);
  const visible = rows
    .map((r, i) => ({ r, i }))
    .filter(({ i }) => expanded || !collapsible || i < COLLAPSED_ROWS || i === myIndex);

  return (
    <Card className="min-w-0 p-5">
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
                onClick={() => {
                  setRange(r);
                  setExpanded(false);
                }}
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
        <>
        {allTied ? (
          <p className="mt-4 text-sm text-ink-2">
            All {rows.length} people are tied on {rows[0].xp.toLocaleString()} XP. One more session puts you ahead.
          </p>
        ) : null}
        <ol className="mt-4 min-w-0 space-y-1.5">
          {visible.map(({ r, i }, k) => {
            const me = r.userId === meId;
            const gap = k > 0 && i - visible[k - 1].i > 1;
            return (
              <li
                key={r.userId}
                value={ranks[i]}
                className={clsx("relative min-w-0 overflow-hidden rounded-xl px-3 py-2", me ? "ring-2 ring-accent" : "", gap && "mt-4")}
              >
                <motion.span
                  aria-hidden
                  className="absolute inset-y-0 left-0 bg-surface-2/50"
                  initial={{ width: 0 }}
                  animate={{ width: `${(r.xp / max) * 100}%` }}
                  transition={{ duration: 0.6, delay: i * 0.03, ease: [0.22, 1, 0.36, 1] }}
                />
                <span className="relative flex min-w-0 items-center gap-3">
                  <span className="w-6 shrink-0 text-right font-display font-semibold text-muted tabular">{ranks[i]}</span>
                  <span className={clsx("flex min-w-0 flex-1 items-baseline", me && "font-semibold")}>
                    <span className="min-w-0 truncate" title={r.name}>
                      {r.name}
                    </span>
                    {me ? <span className="ml-1.5 shrink-0 text-xs font-normal text-muted">(you)</span> : null}
                  </span>
                  <span className="shrink-0 font-display font-semibold tabular">{r.xp.toLocaleString()}</span>
                </span>
              </li>
            );
          })}
        </ol>
        {collapsible ? (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((e) => !e)}
            className="mt-3 text-sm font-medium text-ink-2 underline-offset-4 hover:text-ink hover:underline"
          >
            {expanded ? "Show top 3" : `Show all ${rows.length}`}
          </button>
        ) : null}
        </>
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
