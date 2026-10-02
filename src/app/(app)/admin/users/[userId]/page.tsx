import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, CardHeader, Pill } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress";
import { levelFor } from "@/lib/gamification";
import { userDetail } from "@/lib/repo/admin";
import { totalXp } from "@/lib/repo/activity";
import { getAdminViewer } from "@/lib/viewer";
import { daysUntil } from "@/lib/plan-builder";
import { Readiness } from "../../readiness";
import { ActivityTimeline } from "./activity-timeline";
import { UserControls } from "./user-controls";

export const metadata: Metadata = { title: "User detail" };

const dt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const d = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" });

export default async function AdminUserPage({ params }: PageProps<"/admin/users/[userId]">) {
  const { user: me, settings: mySettings } = await getAdminViewer();
  const { userId } = await params;
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const detail = await userDetail(id);
  if (!detail) notFound();
  const { user, settings, cert, mastery, readiness, readinessAnswers, passingScore, lastMock, lastStudiedAt, streak, timeline, mocks } = detail;
  const left = daysUntil(settings.examDate, settings.tz);
  const lvl = levelFor(await totalXp(user.id));

  return (
    <>
      <Link href="/admin" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft size={16} /> All users
      </Link>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-semibold tracking-[-0.025em] break-words sm:text-4xl">{user.name}</h1>
          <p className="mt-1 break-all text-ink-2">
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
        <Stat label="Last studied" value={lastStudiedAt ? dt.format(lastStudiedAt) : "Never studied"} />
        <Stat label="Current streak" value={`${streak.current} day${streak.current === 1 ? "" : "s"}`} />
        <div className="min-w-0 rounded-2xl border border-line bg-surface px-4 py-3">
          <dd className="font-display text-lg font-semibold">
            <Readiness score={readiness} answers={readinessAnswers} pass={passingScore} />
          </dd>
          <dt className="text-xs text-muted">
            Readiness{lastMock ? `, last mock ${lastMock.score} (${lastMock.passed ? "pass" : "fail"})` : ", no mock yet"}
          </dt>
        </div>
        <Stat label={left == null ? "Exam date" : left < 0 ? "Exam date (passed)" : `Exam date, ${left} day${left === 1 ? "" : "s"} left`} value={settings.examDate ?? "Not set"} />
        <Stat label="Daily goal" value={`${settings.dailyMinutes} min`} />
        <Stat label="Background" value={settings.background === "technical" ? "Technical" : "Non-technical"} />
        <Stat label="XP and level" value={`${lvl.xp.toLocaleString()} XP, level ${lvl.level}`} />
      </dl>

      <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-[1fr_1.1fr]">
        <Card className="min-w-0 p-5">
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

        <Card className="min-w-0 p-5">
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
                          <span className="w-40 shrink-0 leading-snug text-ink-2 sm:w-56">{b.name}</span>
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
        <CardHeader title="Activity" sub={`Most recent ${timeline.length} events, grouped by the user’s day`} />
        {timeline.length === 0 ? <p className="mt-4 text-sm text-muted">No activity yet.</p> : <ActivityTimeline items={timeline} tz={mySettings.tz} />}
      </Card>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-surface px-4 py-3">
      <dd className="truncate font-display text-lg font-semibold" title={value}>{value}</dd>
      <dt className="text-xs text-muted">{label}</dt>
    </div>
  );
}
