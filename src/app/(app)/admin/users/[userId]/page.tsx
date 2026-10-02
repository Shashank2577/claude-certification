import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, CardHeader, Pill } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress";
import { achievementById, levelFor } from "@/lib/gamification";
import { userDetail } from "@/lib/repo/admin";
import { totalXp } from "@/lib/repo/activity";
import { getAdminViewer } from "@/lib/viewer";
import { UserControls } from "./user-controls";

export const metadata: Metadata = { title: "User detail" };

const dt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const d = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" });

const KIND_LABEL: Record<string, string> = {
  lesson: "Completed a lesson",
  answer: "Answered a question",
  quiz: "Finished a practice set",
  flashcard: "Reviewed a flashcard",
  mock: "Finished a mock exam",
  focus: "Finished a focus block",
  resource: "Marked a resource done",
  "daily-goal": "Hit the daily goal",
  onboarding: "Set up a study plan",
  achievement: "Unlocked a badge",
};

export default async function AdminUserPage({ params }: PageProps<"/admin/users/[userId]">) {
  const { user: me } = await getAdminViewer();
  const { userId } = await params;
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const detail = await userDetail(id);
  if (!detail) notFound();
  const { user, settings, cert, mastery, readiness, streak, activity, mocks } = detail;
  const lvl = levelFor(await totalXp(user.id));

  return (
    <>
      <Link href="/admin" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft size={16} /> All users
      </Link>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-[-0.025em] sm:text-4xl">{user.name}</h1>
          <p className="mt-1 text-ink-2">
            {user.email}
            {user.role === "admin" ? (
              <Pill tone="info" className="ml-2 align-middle">
                Admin
              </Pill>
            ) : null}
          </p>
        </div>
        <UserControls userId={user.id} role={user.role} isSelf={user.id === me.id} name={user.name} />
      </header>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Joined" value={d.format(user.createdAt)} />
        <Stat label="Last active" value={user.lastActiveAt ? dt.format(user.lastActiveAt) : "Never"} />
        <Stat label="Current streak" value={`${streak.current} day${streak.current === 1 ? "" : "s"}`} />
        <Stat label="Readiness" value={readiness == null ? "Not enough data" : String(readiness)} />
        <Stat label="Exam date" value={settings.examDate ?? "Not set"} />
        <Stat label="Daily goal" value={`${settings.dailyMinutes} min`} />
        <Stat label="Background" value={settings.background === "technical" ? "Technical" : "Non-technical"} />
        <Stat label="XP and level" value={`${lvl.xp.toLocaleString()} XP, level ${lvl.level}`} />
      </dl>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <Card className="p-5">
          <CardHeader title="Domain mastery" sub={cert?.name} />
          {mastery.length === 0 ? (
            <p className="mt-4 text-sm text-muted">No exam content loaded.</p>
          ) : (
            <ul className="mt-4 space-y-4">
              {mastery.map((m) => (
                <li key={m.domainId}>
                  <div className="mb-1 flex justify-between gap-3 text-sm">
                    <span className="truncate">{m.name}</span>
                    <span className="shrink-0 text-muted tabular">{m.attempts ? `${Math.round(m.mastery * 100)}%, ${m.attempts} answer${m.attempts === 1 ? "" : "s"}` : "No answers"}</span>
                  </div>
                  <ProgressBar value={m.attempts ? m.mastery : 0} color={m.color} label={`${m.name} mastery`} height={7} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <CardHeader title="Mock exams" sub={`${mocks.filter((m) => m.status === "submitted").length} submitted`} />
          {mocks.length === 0 ? (
            <p className="mt-4 text-sm text-muted">No mock exams yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {mocks.map((m) => (
                <li key={m.id} className="py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm text-ink-2">{dt.format(m.startedAt)}</span>
                    {m.status === "submitted" ? (
                      <span className="flex items-baseline gap-2">
                        <span className="font-display text-xl font-semibold tabular">{m.score}</span>
                        <Pill tone={m.passed ? "good" : "bad"}>{m.passed ? "Pass" : "Fail"}</Pill>
                      </span>
                    ) : (
                      <Pill>In progress</Pill>
                    )}
                  </div>
                  {m.status === "submitted" ? (
                    <p className="mt-0.5 text-xs text-muted tabular">
                      {m.correct} of {m.total} correct
                    </p>
                  ) : null}
                  {m.breakdown.length ? (
                    <div className="mt-2 grid gap-1">
                      {m.breakdown.map((b) => (
                        <div key={b.domainId} className="flex items-center gap-2 text-xs">
                          <span className="w-40 truncate text-ink-2 sm:w-56">{b.name}</span>
                          <div className="flex-1">
                            <ProgressBar value={b.total ? b.correct / b.total : 0} height={5} color="var(--ink-2)" label={`${b.name} score`} />
                          </div>
                          <span className="w-10 text-right text-muted tabular">
                            {b.correct}/{b.total}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-6 p-5">
        <CardHeader title="Activity" sub="Most recent 60 events" />
        {activity.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No activity yet.</p>
        ) : (
          <ol className="relative mt-4 ml-2 border-l border-line">
            {activity.map((a) => (
              <li key={a.id} className="relative pb-3 pl-5">
                <span className="absolute top-1.5 -left-[5px] size-2.5 rounded-full border-2 border-surface bg-line-strong" aria-hidden />
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="text-sm">
                    {KIND_LABEL[a.kind] ?? a.kind}
                    {a.kind === "achievement" && a.refId ? `: ${achievementById(a.refId)?.title ?? a.refId}` : a.refId && (a.kind === "lesson" || a.kind === "answer" || a.kind === "flashcard" || a.kind === "resource") ? ` (${a.refId})` : ""}
                    {a.kind === "answer" && typeof a.meta.correct !== "undefined" ? (a.meta.correct ? ", correct" : ", wrong") : ""}
                  </span>
                  <span className="text-xs text-muted">{dt.format(a.createdAt)}</span>
                  {a.xp ? <span className="text-xs font-medium text-accent-text tabular">+{a.xp} XP</span> : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-4 py-3">
      <dd className="truncate font-display text-lg font-semibold">{value}</dd>
      <dt className="text-xs text-muted">{label}</dt>
    </div>
  );
}
