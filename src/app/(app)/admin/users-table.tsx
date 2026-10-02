"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Check, Copy, Download, Search } from "lucide-react";
import { clsx } from "clsx";
import { Pill } from "@/components/ui/card";
import { STATUS_LABEL, STATUS_ORDER, STATUS_TONE, type UserStatus } from "@/lib/admin-status";
import type { AdminUserRow } from "@/lib/repo/admin";
import { Readiness } from "./readiness";

type Key =
  | "name"
  | "status"
  | "certName"
  | "daysLeft"
  | "createdAt"
  | "lastActiveAt"
  | "streak"
  | "xp"
  | "lessonsDone"
  | "answered"
  | "accuracy"
  | "mockAnswers"
  | "mockAttempts"
  | "bestMock"
  | "readiness";

const COLS: { key: Key; label: string; numeric?: boolean; title?: string }[] = [
  { key: "name", label: "User" },
  { key: "status", label: "Status" },
  { key: "certName", label: "Exam" },
  { key: "daysLeft", label: "Exam date" },
  { key: "createdAt", label: "Joined" },
  { key: "lastActiveAt", label: "Last studied" },
  { key: "streak", label: "Streak", numeric: true },
  { key: "xp", label: "XP", numeric: true },
  { key: "lessonsDone", label: "Lessons", numeric: true },
  { key: "answered", label: "Practice answers", numeric: true, title: "Answers outside mock exams" },
  { key: "accuracy", label: "Practice accuracy", numeric: true, title: "Share correct, outside mock exams" },
  { key: "mockAnswers", label: "Mock answers", numeric: true, title: "Answers given inside mock exams" },
  { key: "mockAttempts", label: "Mocks", numeric: true },
  { key: "bestMock", label: "Best / last mock", numeric: true },
  { key: "readiness", label: "Readiness", numeric: true, title: "Predicted score on the active exam, shown from 20 answers" },
];

const date = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });
const examFmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function relative(ts: number | null) {
  if (!ts) return "Never studied";
  const days = Math.floor((Date.now() - ts) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  return date.format(ts);
}

function daysLeftText(n: number | null) {
  if (n == null) return null;
  if (n < 0) return "Exam passed";
  if (n === 0) return "Today";
  return `${n} day${n === 1 ? "" : "s"} left`;
}

function sortValue(r: AdminUserRow, key: Key): string | number | null {
  if (key === "status") return STATUS_ORDER.indexOf(r.status);
  return r[key];
}

// --- CSV ----------------------------------------------------------------------------------------

const iso = (ts: number | null) => (ts == null ? "" : new Date(ts).toISOString());

function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  // Neutralise spreadsheet formulas in user-controlled text (names, emails).
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: AdminUserRow[]): string {
  const header = [
    "Name", "Email", "Role", "Status", "Reasons", "Exam", "Exam date", "Days left", "Joined", "Last studied", "Streak", "XP", "Lessons",
    "Practice answers", "Practice accuracy %", "Mock answers", "Mocks", "Best mock", "Last mock", "Readiness", "Readiness answers",
  ];
  const lines = rows.map((r) =>
    [
      r.name, r.email, r.role, STATUS_LABEL[r.status], r.reasons.join("; "), r.certName, r.examDate, r.daysLeft, iso(r.createdAt), iso(r.lastActiveAt),
      r.streak, r.xp, r.lessonsDone, r.answered, r.accuracy == null ? "" : Math.round(r.accuracy * 100), r.mockAnswers, r.mockAttempts, r.bestMock,
      r.lastMock, r.readiness, r.readinessAnswers,
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.map(csvCell).join(","), ...lines].join("\r\n");
}

function downloadCsv(rows: AdminUserRow[]) {
  const blob = new Blob(["﻿", toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `users-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// --- Table --------------------------------------------------------------------------------------

export function UsersTable({ rows }: { rows: AdminUserRow[] }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<UserStatus | "all">("all");
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({ key: "lastActiveAt", dir: -1 });

  const counts = useMemo(() => {
    const m = new Map<UserStatus, number>();
    for (const r of rows) m.set(r.status, (m.get(r.status) ?? 0) + 1);
    return m;
  }, [rows]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = rows.filter(
      (r) => (status === "all" || r.status === status) && (!needle || r.name.toLowerCase().includes(needle) || r.email.toLowerCase().includes(needle)),
    );
    return filtered.sort((a, b) => {
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * sort.dir;
      return ((av as number) - (bv as number)) * sort.dir;
    });
  }, [rows, q, status, sort]);

  return (
    <div className="mt-4 min-w-0">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <label className="relative block w-full min-w-0 sm:w-72">
          <span className="sr-only">Search users</span>
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or email"
            className="h-10 w-full rounded-xl border border-line-strong bg-surface pr-3 pl-9 text-sm focus:border-ink focus:outline-none"
          />
        </label>
        <label className="flex min-w-0 items-center gap-2 text-sm text-ink-2">
          Status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as UserStatus | "all")}
            className="h-10 min-w-0 rounded-xl border border-line-strong bg-surface px-2 text-sm text-ink focus:border-ink focus:outline-none"
          >
            <option value="all">All ({rows.length})</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]} ({counts.get(s) ?? 0})
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => downloadCsv(shown)}
          disabled={shown.length === 0}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-line-strong px-3 text-sm font-medium hover:bg-surface-2 disabled:opacity-50 sm:ml-auto"
        >
          <Download size={15} aria-hidden /> Export CSV ({shown.length})
        </button>
      </div>
      <div className="relative mt-3 max-w-full min-w-0 overflow-x-auto">
        <table className="w-full min-w-[78rem] text-sm">
          <thead>
            <tr className="border-b border-line-strong">
              {COLS.map((c) => {
                const active = sort.key === c.key;
                return (
                  <th key={c.key} scope="col" aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"} className={clsx("py-1 pr-3 font-medium", c.numeric ? "text-right" : "text-left")}>
                    <button
                      type="button"
                      title={c.title}
                      onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : c.numeric || !["name", "certName", "daysLeft", "status"].includes(c.key) ? -1 : 1 }))}
                      className={clsx(
                        "inline-flex min-h-8 items-center gap-1 rounded px-1 text-left leading-tight hover:text-ink pointer-coarse:min-h-11",
                        c.numeric && "justify-end",
                        active ? "text-ink" : "text-muted",
                      )}
                    >
                      {c.label}
                      {active ? sort.dir === 1 ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden /> : null}
                    </button>
                  </th>
                );
              })}
              <th scope="col" className="py-1 text-right font-medium text-muted">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0 hover:bg-surface-2/60">
                <td className="py-2.5 pr-3">
                  <div className="flex w-56 min-w-0 items-center gap-2">
                    <Link href={`/admin/users/${r.id}`} className="min-w-0 truncate font-medium hover:underline" title={r.name}>
                      {r.name}
                    </Link>
                    {r.role === "admin" ? <span className="shrink-0 rounded-full bg-info-soft px-1.5 py-0.5 text-[11px] font-medium text-info">Admin</span> : null}
                  </div>
                  <span className="block w-56 truncate text-xs text-muted" title={r.email}>
                    {r.email}
                  </span>
                </td>
                <td className="py-2.5 pr-3" title={r.reasons.join("; ") || undefined}>
                  <Pill tone={STATUS_TONE[r.status]} className="whitespace-nowrap">
                    {STATUS_LABEL[r.status]}
                  </Pill>
                </td>
                <td className="py-2.5 pr-3">{r.certName ? <Pill tone="info">{r.certName}</Pill> : <span className="text-muted">–</span>}</td>
                <td className="py-2.5 pr-3 whitespace-nowrap text-ink-2">
                  {r.examDate ? (
                    <>
                      {examFmt.format(new Date(`${r.examDate}T00:00:00Z`))}
                      <span className="block text-xs text-muted">{daysLeftText(r.daysLeft)}</span>
                    </>
                  ) : (
                    <span className="text-muted">Not set</span>
                  )}
                </td>
                <td className="py-2.5 pr-3 whitespace-nowrap text-ink-2">{date.format(r.createdAt)}</td>
                <td className={clsx("py-2.5 pr-3 whitespace-nowrap", r.lastActiveAt ? "text-ink-2" : "text-muted")}>{relative(r.lastActiveAt)}</td>
                <Num v={r.streak} />
                <Num v={r.xp} />
                <Num v={r.lessonsDone} />
                <Num v={r.answered} />
                <Num v={r.accuracy == null ? null : `${Math.round(r.accuracy * 100)}%`} />
                <Num v={r.mockAnswers} />
                <Num v={r.mockAttempts} />
                <Num v={r.bestMock == null ? null : `${r.bestMock} / ${r.lastMock ?? "–"}`} />
                <td className="py-2.5 pr-3 text-right whitespace-nowrap tabular">
                  <Readiness score={r.readiness} answers={r.readinessAnswers} pass={r.passingScore} />
                </td>
                <td className="py-2.5 text-right">
                  <CopyEmail email={r.email} name={r.name} />
                </td>
              </tr>
            ))}
            {shown.length === 0 ? (
              <tr>
                <td colSpan={COLS.length + 1} className="py-6 text-center text-muted">
                  {q ? `No users match “${q}”.` : "No users with this status."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CopyEmail({ email, name }: { email: string; name: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(email);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {}
      }}
      aria-label={copied ? `Copied ${name}’s email` : `Copy ${name}’s email`}
      title={copied ? "Copied" : "Copy email"}
      className="inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink pointer-coarse:size-11"
    >
      {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
    </button>
  );
}

function Num({ v }: { v: number | string | null }) {
  return <td className="py-2.5 pr-3 text-right whitespace-nowrap tabular">{v == null ? <span className="text-muted">–</span> : typeof v === "number" ? v.toLocaleString() : v}</td>;
}
