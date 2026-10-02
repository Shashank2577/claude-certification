"use client";

import { useRef, useState } from "react";
import { clsx } from "clsx";
import type { Retention } from "@/lib/admin-status";

const fmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });
const label = (day: string) => fmt.format(new Date(`${day}T00:00:00Z`));

/** Round the axis top up to a friendly number so gridlines land on integers. */
function niceMax(n: number): number {
  if (n <= 4) return 4;
  const step = Math.pow(10, Math.floor(Math.log10(n)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * step >= n && Number.isInteger((m * step) / 4)) return m * step;
  return Math.ceil(n / 4) * 4;
}

export function ActiveChart({ data, retention }: { data: { day: string; users: number }[]; retention: Retention }) {
  const [sel, setSel] = useState(data.length - 1);
  const bars = useRef<(HTMLButtonElement | null)[]>([]);
  const peak = Math.max(0, ...data.map((d) => d.users));
  const top = niceMax(peak);
  const ticks = [0, top / 4, top / 2, (top * 3) / 4, top];
  const total = data.reduce((s, d) => s + d.users, 0);
  const current = data[sel];

  const move = (i: number) => {
    const next = Math.max(0, Math.min(data.length - 1, i));
    setSel(next);
    bars.current[next]?.focus();
  };

  return (
    <figure className="mt-4 min-w-0">
      <p className="text-sm text-ink-2" aria-live="polite">
        {current ? (
          <>
            <span className="font-medium text-ink">{label(current.day)}</span>: {current.users} {current.users === 1 ? "user" : "users"} studied
          </>
        ) : null}
      </p>
      <div className="mt-2 flex min-w-0 gap-2">
        {/* y axis */}
        <div className="relative h-40 w-6 shrink-0 text-right text-[11px] text-muted tabular" aria-hidden>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 translate-y-1/2 leading-none" style={{ bottom: `${(t / top) * 100}%` }}>
              {t}
            </span>
          ))}
        </div>
        <div className="relative h-40 min-w-0 flex-1">
          {ticks.map((t) => (
            <div key={t} className={clsx("absolute inset-x-0 border-t", t === 0 ? "border-line-strong" : "border-dashed border-line")} style={{ bottom: `${(t / top) * 100}%` }} aria-hidden />
          ))}
          <div role="group" aria-label="Users studying per day, use arrow keys to move between days" className="absolute inset-0 flex items-end">
            {data.map((d, i) => (
              <button
                key={d.day}
                ref={(el) => {
                  bars.current[i] = el;
                }}
                type="button"
                tabIndex={i === sel ? 0 : -1}
                aria-label={`${label(d.day)}: ${d.users} ${d.users === 1 ? "user" : "users"}`}
                aria-pressed={i === sel}
                onPointerEnter={() => setSel(i)}
                onFocus={() => setSel(i)}
                onClick={() => setSel(i)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft") move(sel - 1);
                  else if (e.key === "ArrowRight") move(sel + 1);
                  else if (e.key === "Home") move(0);
                  else if (e.key === "End") move(data.length - 1);
                  else return;
                  e.preventDefault();
                }}
                className="group flex h-full min-w-0 flex-1 items-end justify-center px-[1px] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink sm:px-0.5"
              >
                <span
                  className={clsx("block w-full rounded-t-[3px] transition-colors", i === sel ? "bg-ink" : "bg-accent group-hover:bg-ink-2")}
                  style={{ height: d.users ? `max(2px, ${(d.users / top) * 100}%)` : 0 }}
                />
              </button>
            ))}
          </div>
        </div>
      </div>
      {/* week labels, aligned under every 7th bar counting back from today */}
      <div className="relative mt-1 ml-8 h-4 text-[11px] text-muted" aria-hidden>
        {data.map((d, i) =>
          (data.length - 1 - i) % 7 === 0 ? (
            <span
              key={d.day}
              className="absolute whitespace-nowrap"
              style={i === data.length - 1 ? { right: 0 } : { left: `${((i + 0.5) / data.length) * 100}%`, transform: i === 0 ? undefined : "translateX(-50%)" }}
            >
              {i === data.length - 1 ? "Today" : label(d.day)}
            </span>
          ) : null,
        )}
      </div>
      <figcaption className="mt-3 text-sm text-muted">
        {total === 0 ? "Nobody studied in the last 30 days. " : `Peak ${peak} ${peak === 1 ? "user" : "users"} in a day. `}
        {retention.eligible > 0
          ? `${Math.round((retention.returned / retention.eligible) * 100)}% returned within 3 days of their first study day (${retention.returned} of ${retention.eligible}).`
          : "Return rate appears once users have studied for 3 days."}
      </figcaption>
    </figure>
  );
}
