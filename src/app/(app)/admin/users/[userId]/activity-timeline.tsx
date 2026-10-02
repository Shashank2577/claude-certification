"use client";

import { useMemo, useState } from "react";
import { clsx } from "clsx";
import type { TimelineGroup, TimelineItem } from "@/lib/repo/admin";

const FILTERS: { id: TimelineGroup | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "lessons", label: "Lessons" },
  { id: "practice", label: "Practice" },
  { id: "mocks", label: "Mocks" },
];

const dayFmt = new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

function daySummary(items: TimelineItem[]): string {
  const parts: string[] = [];
  const answers = items.filter((i) => i.kind === "answer");
  if (answers.length) {
    const right = answers.filter((i) => i.correct).length;
    parts.push(`${answers.length} answer${answers.length === 1 ? "" : "s"}, ${Math.round((right / answers.length) * 100)}%`);
  }
  const lessons = items.filter((i) => i.kind === "lesson").length;
  if (lessons) parts.push(`${lessons} lesson${lessons === 1 ? "" : "s"}`);
  const mocks = items.filter((i) => i.kind === "mock").length;
  if (mocks) parts.push(`${mocks} mock${mocks === 1 ? "" : "s"}`);
  const xp = items.reduce((s, i) => s + i.xp, 0);
  if (xp) parts.push(`+${xp} XP`);
  return parts.join(" · ");
}

/** `tz` fixes the time zone so server and browser render the same times. */
export function ActivityTimeline({ items, tz }: { items: TimelineItem[]; tz: string }) {
  const timeFmt = useMemo(() => {
    try {
      return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", timeZone: tz });
    } catch {
      return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
    }
  }, [tz]);
  const [filter, setFilter] = useState<TimelineGroup | "all">("all");

  const days = useMemo(() => {
    const shown = filter === "all" ? items : items.filter((i) => i.group === filter);
    const m = new Map<string, TimelineItem[]>();
    for (const i of shown) (m.get(i.day) ?? m.set(i.day, []).get(i.day)!).push(i);
    return [...m];
  }, [items, filter]);

  return (
    <div className="mt-4 min-w-0">
      <div role="group" aria-label="Filter activity" className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={clsx(
              "inline-flex min-h-8 items-center rounded-full border px-3 text-sm font-medium pointer-coarse:min-h-11",
              filter === f.id ? "border-ink bg-ink text-bg" : "border-line-strong text-ink-2 hover:text-ink",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {days.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Nothing here yet.</p>
      ) : (
        <div className="mt-4 space-y-5">
          {days.map(([day, list]) => (
            <section key={day} aria-label={dayFmt.format(new Date(`${day}T00:00:00Z`))}>
              <h3 className="flex flex-wrap items-baseline gap-x-3 border-b border-line pb-1 text-sm font-semibold">
                {dayFmt.format(new Date(`${day}T00:00:00Z`))}
                <span className="text-xs font-normal text-muted">{daySummary(list)}</span>
              </h3>
              <ol className="relative mt-2 ml-2 border-l border-line">
                {list.map((a) => (
                  <li key={a.id} className="relative pb-2.5 pl-5">
                    <span
                      className={clsx(
                        "absolute top-1.5 -left-[5px] size-2.5 rounded-full border-2 border-surface",
                        a.correct === true ? "bg-good" : a.correct === false ? "bg-bad" : "bg-line-strong",
                      )}
                      aria-hidden
                    />
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
                      <span className="min-w-0 text-sm">
                        {a.action}
                        {a.correct != null ? <span className={a.correct ? "text-good" : "text-bad"}>{a.correct ? ", correct" : ", wrong"}</span> : null}
                      </span>
                      <span className="text-xs text-muted">{timeFmt.format(a.createdAt)}</span>
                      {a.xp ? <span className="text-xs font-medium text-accent-text tabular">+{a.xp} XP</span> : null}
                    </div>
                    {a.detail ? <p className="mt-0.5 text-sm break-words text-ink-2">{a.detail}</p> : null}
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
