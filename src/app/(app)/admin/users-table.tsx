"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { clsx } from "clsx";
import type { AdminUserRow } from "@/lib/repo/admin";

type Key = keyof Pick<AdminUserRow, "name" | "createdAt" | "lastActiveAt" | "streak" | "xp" | "lessonsDone" | "answered" | "accuracy" | "mockAttempts" | "bestMock" | "readiness">;

const COLS: { key: Key; label: string; numeric?: boolean }[] = [
  { key: "name", label: "User" },
  { key: "createdAt", label: "Joined" },
  { key: "lastActiveAt", label: "Last active" },
  { key: "streak", label: "Streak", numeric: true },
  { key: "xp", label: "XP", numeric: true },
  { key: "lessonsDone", label: "Lessons", numeric: true },
  { key: "answered", label: "Answers", numeric: true },
  { key: "accuracy", label: "Accuracy", numeric: true },
  { key: "mockAttempts", label: "Mocks", numeric: true },
  { key: "bestMock", label: "Best mock", numeric: true },
  { key: "readiness", label: "Readiness", numeric: true },
];

const date = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });

function relative(ts: number | null) {
  if (!ts) return "Never";
  const days = Math.floor((Date.now() - ts) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  return date.format(ts);
}

export function UsersTable({ rows }: { rows: AdminUserRow[] }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({ key: "lastActiveAt", dir: -1 });

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = needle ? rows.filter((r) => r.name.toLowerCase().includes(needle) || r.email.toLowerCase().includes(needle)) : rows;
    return [...filtered].sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * sort.dir;
      return ((av as number) - (bv as number)) * sort.dir;
    });
  }, [rows, q, sort]);

  return (
    <div className="mt-4">
      <label className="relative block max-w-sm">
        <span className="sr-only">Search users</span>
        <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or email"
          className="h-10 w-full rounded-xl border border-line-strong bg-surface pr-3 pl-9 text-sm focus:border-ink focus:outline-none"
        />
      </label>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[60rem] text-sm">
          <thead>
            <tr className="border-b border-line-strong">
              {COLS.map((c) => {
                const active = sort.key === c.key;
                return (
                  <th key={c.key} scope="col" aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"} className={clsx("py-2 pr-3 font-medium", c.numeric ? "text-right" : "text-left")}>
                    <button
                      type="button"
                      onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : c.numeric || c.key !== "name" ? -1 : 1 }))}
                      className={clsx("inline-flex items-center gap-1 rounded hover:text-ink", active ? "text-ink" : "text-muted")}
                    >
                      {c.label}
                      {active ? sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} /> : null}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0 hover:bg-surface-2/60">
                <td className="py-2.5 pr-3">
                  <Link href={`/admin/users/${r.id}`} className="font-medium hover:underline">
                    {r.name}
                  </Link>
                  {r.role === "admin" ? <span className="ml-2 rounded-full bg-info-soft px-1.5 py-0.5 text-[11px] font-medium text-info">Admin</span> : null}
                  <span className="block text-xs text-muted">{r.email}</span>
                </td>
                <td className="py-2.5 pr-3 text-ink-2">{date.format(r.createdAt)}</td>
                <td className="py-2.5 pr-3 text-ink-2">{relative(r.lastActiveAt)}</td>
                <Num v={r.streak} />
                <Num v={r.xp} />
                <Num v={r.lessonsDone} />
                <Num v={r.answered} />
                <Num v={r.accuracy == null ? null : `${Math.round(r.accuracy * 100)}%`} />
                <Num v={r.mockAttempts} />
                <Num v={r.bestMock} />
                <Num v={r.readiness} />
              </tr>
            ))}
            {shown.length === 0 ? (
              <tr>
                <td colSpan={COLS.length} className="py-6 text-center text-muted">
                  No users match “{q}”.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Num({ v }: { v: number | string | null }) {
  return <td className="py-2.5 pr-3 text-right tabular">{v == null ? <span className="text-muted">–</span> : typeof v === "number" ? v.toLocaleString() : v}</td>;
}
