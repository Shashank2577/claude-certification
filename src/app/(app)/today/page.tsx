import type { Metadata } from "next";
import Link from "next/link";
import { clsx } from "clsx";
import { BookOpen, CalendarClock, CalendarPlus, Check, ChevronDown, ClipboardCheck, Flame, Layers, Library, Lock, RotateCcw, Snowflake, Target, Undo2 } from "lucide-react";
import { rebuildPlanForActiveCert } from "@/app/actions/settings";
import { buildDashboard, type TodayBlock } from "@/lib/dashboard";
import { READINESS_UNLOCK } from "@/lib/scoring";
import { getViewer } from "@/lib/viewer";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { Button, ButtonLink, buttonClass } from "@/components/ui/button";
import { ProgressBar, Ring } from "@/components/ui/progress";
import { NumberTicker } from "@/components/ui/number-ticker";
import { StreakFlame } from "@/components/streak-flame";
import { CommitDial } from "./commit-dial";
import { MasteryRadar, ReadinessGauge, RotatingMessage } from "./widgets";

export const metadata: Metadata = { title: "Today" };

const KIND_ICON = { lesson: BookOpen, quiz: Target, flashcards: Layers, mock: ClipboardCheck, review: RotateCcw, resource: Library } as const;
const KIND_LABEL: Record<string, string> = { lesson: "Next lesson", quiz: "Next up", flashcards: "Next up", mock: "Next up", review: "Next up", resource: "Next up" };

function greeting(hour: number) {
  if (hour < 5) return "Up late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function relTime(ts: number, now: number) {
  const m = Math.round((now - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

export default async function TodayPage() {
  const viewer = await getViewer();
  const d = await buildDashboard(viewer);
  if (!d) {
    return <EmptyState title="No exam content found" body="Add content to the content folder following CONTENT_SCHEMA.md, then reload." />;
  }
  const { now, hour } = d;
  const goalFrac = d.dailyGoal ? d.minutesToday / d.dailyGoal : 0;
  const blocksDone = d.blocks.filter((b) => b.done).length;
  const must = d.blocks.slice(0, d.mustCount);
  const stretch = d.blocks.slice(d.mustCount);
  const nextIndex = d.blocks.findIndex((b) => !b.done);
  const r = d.readiness;
  const noStreakYet = d.streak === 0 && !d.activeToday;

  return (
    // Extra bottom room on phones so the last lines clear the fixed tab bar and the home indicator.
    <div className="space-y-6 pb-[calc(4.25rem+env(safe-area-inset-bottom))] lg:space-y-8 lg:pb-0">
      {/* Greeting + the one thing to do */}
      <section className="grid items-center gap-8 lg:grid-cols-[1fr_auto] lg:gap-12 [&>*]:min-w-0">
        <div className="min-w-0">
          <h1 className="min-w-0 font-display text-[2.4rem] leading-[1.02] font-semibold tracking-[-0.035em] [overflow-wrap:anywhere] sm:text-6xl">
            {greeting(hour)}, {d.firstName}{d.firstName.endsWith("…") ? "" : "."}
          </h1>
          <div className="mt-4">
            <RotatingMessage messages={d.messages} />
          </div>
          <dl className="mt-8 grid max-w-xl grid-cols-3 gap-3">
            <Stat label="Day streak">
              <span className="flex items-center gap-1.5">
                <StreakFlame streak={d.streak} activeToday={d.activeToday} size={26} />
                <NumberTicker value={d.streak} />
              </span>
            </Stat>
            <Stat label={`Level ${d.level.level}`}>
              <span className="line-clamp-2 block text-[0.9rem] leading-snug hyphens-auto [overflow-wrap:break-word] min-[400px]:text-[1.05rem]">{d.level.name}</span>
            </Stat>
            <Stat label={d.examDaysLeft != null ? "Days to exam" : "Exam date"}>
              {d.examDaysLeft != null ? (
                <NumberTicker value={Math.max(0, d.examDaysLeft)} />
              ) : (
                <Link href="/settings" className="text-[1.05rem] leading-8 underline decoration-line-strong underline-offset-4 hover:decoration-ink">
                  Set a date
                </Link>
              )}
            </Stat>
          </dl>
          {noStreakYet ? (
            <Link href={d.next.href} className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-sm font-medium text-accent-text hover:underline">
              <Flame size={14} aria-hidden /> Start your streak: one 5-minute lesson
            </Link>
          ) : null}
          {d.freezeNotice ? (
            <p className="mt-3 flex items-center gap-1.5 text-sm text-ink-2">
              <Snowflake size={14} className="shrink-0 text-info" aria-hidden />
              A streak freeze covered {weekday(d.freezeNotice.day)}. You have {d.freezes} left.
            </p>
          ) : null}
          <p className="mt-3 flex items-start gap-1.5 text-xs text-muted">
            <Snowflake size={13} className="mt-px shrink-0" aria-hidden />
            <span>
              {d.freezes} streak freeze{d.freezes === 1 ? "" : "s"} saved. A freeze covers a missed day automatically; you earn one every seven-day run.
            </span>
          </p>
          {/* A plain link: the route returns an .ics file, not a page. */}
          <a href={d.calendarHref} download="study-reminder.ics" className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink hover:decoration-ink">
            <CalendarPlus size={13} aria-hidden /> Add daily reminder to calendar
          </a>
        </div>
        <div className="justify-self-center lg:justify-self-end">
          <CommitDial href={d.next.href} nextTitle={d.next.title} kindLabel={KIND_LABEL[d.next.kind] ?? "Next up"} />
        </div>
      </section>

      {d.planMismatch ? (
        <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="min-w-0">
            <p className="font-display text-lg font-semibold">Your plan is for {d.planMismatch.planCertName}</p>
            <p className="mt-1 text-sm text-ink-2">You’re studying a different exam now. Rebuild the plan for it; finished lessons stay finished.</p>
          </div>
          <form action={rebuildPlanForActiveCert}>
            <Button type="submit" variant="accent" className="shrink-0">
              Rebuild for this exam
            </Button>
          </form>
        </Card>
      ) : null}

      {d.catchUp ? (
        <Card className="p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-text">
                <Undo2 size={18} aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="font-display text-lg font-semibold">Catch-up</p>
                <p className="mt-0.5 text-sm text-ink-2">
                  You missed {dayList(d.catchUp.missedDays)}. We moved {d.catchUp.blocks.length === 1 ? "its key lesson" : `${d.catchUp.missedDays.length === 1 ? "its" : "their"} ${d.catchUp.blocks.length} key lessons`} to today. ~{Math.round(d.catchUp.minutes)} min.
                  {d.catchUp.remaining > d.catchUp.blocks.length ? ` ${d.catchUp.remaining - d.catchUp.blocks.length} more will follow on later days.` : ""}
                </p>
              </div>
            </div>
            <ButtonLink href={d.catchUp.blocks[0].href} variant="primary" className="shrink-0">
              Start catch-up
            </ButtonLink>
          </div>
          <ul className="mt-4 space-y-1.5 text-sm">
            {d.catchUp.blocks.map((b) => (
              <li key={b.refId} className="flex items-center justify-between gap-3">
                <Link href={b.href} className="min-w-0 truncate underline-offset-4 hover:underline">
                  {b.title}
                </Link>
                <span className="shrink-0 text-xs text-muted tabular">{b.minutes} min</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr] [&>*]:min-w-0">
        {/* Today's plan */}
        <Card className="p-5 sm:p-6">
          <CardHeader
            title={d.dayTitle ? `Day ${d.planDay}: ${d.dayTitle}` : "Today’s plan"}
            sub={d.planTitle ? `${d.planTitle}. ${blocksDone} of ${d.blocks.length} done today.` : "No plan yet."}
            action={
              <span className="flex shrink-0 items-center gap-3">
                {d.blocks.length > 0 ? (
                  <Ring value={blocksDone / d.blocks.length} size={44} stroke={5} color={blocksDone === d.blocks.length ? "var(--good)" : "var(--accent)"} label={`${blocksDone} of ${d.blocks.length} done today`}>
                    <span className="text-[11px] font-semibold tabular">
                      {blocksDone}/{d.blocks.length}
                    </span>
                  </Ring>
                ) : null}
                <Link href="/onboarding" className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
                  Adjust
                </Link>
              </span>
            }
          />
          {d.blocks.length === 0 ? (
            <div className="mt-6">
              {d.planMismatch ? (
                <EmptyState title="Plan needs a rebuild" body="Your saved plan is for another exam. Use the button above to rebuild it." />
              ) : (
                <EmptyState title="Nothing scheduled" body="Build a plan from your exam date and daily goal." action={<ButtonLink href="/onboarding">Build my plan</ButtonLink>} />
              )}
            </div>
          ) : (
            <>
              <p className="mt-5 text-xs font-semibold tracking-wide text-muted uppercase">Must do today (~{Math.round(d.mustMinutes)} min)</p>
              <ol className="mt-2 space-y-2">
                {must.map((b, i) => (
                  <BlockRow key={`${b.kind}-${b.refId}-${i}`} b={b} isNext={i === nextIndex} />
                ))}
              </ol>
              {stretch.length > 0 ? (
                <details className="group/stretch mt-4">
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
                    <ChevronDown size={16} className="transition-transform group-open/stretch:rotate-180" aria-hidden />
                    Stretch: show the rest of today ({stretch.length})
                  </summary>
                  <ol className="mt-2 space-y-2">
                    {stretch.map((b, i) => (
                      <BlockRow key={`${b.kind}-${b.refId}-s${i}`} b={b} isNext={i + d.mustCount === nextIndex} />
                    ))}
                  </ol>
                </details>
              ) : null}
            </>
          )}
        </Card>

        {/* Daily goal + week */}
        <Card className="flex flex-col p-5 sm:p-6">
          <CardHeader title="Daily goal" sub={`${d.dailyGoal} minutes of focused study`} />
          <div className="mt-5 flex items-center gap-6">
            <Ring value={goalFrac} size={124} stroke={12} color={goalFrac >= 1 ? "var(--good)" : "var(--accent)"} label={`${Math.round(d.minutesToday)} of ${d.dailyGoal} minutes`}>
              <span className="font-display text-3xl font-semibold tracking-tight tabular">{Math.round(d.minutesToday)}</span>
              <span className="-mt-1 block text-xs text-muted">of {d.dailyGoal} min</span>
            </Ring>
            <div className="text-sm text-ink-2">
              {goalFrac >= 1 ? (
                <p>Goal reached today. Anything more is a bonus.</p>
              ) : (
                <p>
                  {Math.max(1, Math.ceil(d.dailyGoal - d.minutesToday))} minutes to go. Lessons count their reading time, questions count the time you spend on them.
                </p>
              )}
            </div>
          </div>
          <div className="mt-auto pt-6">
            <p className="mb-2 text-xs text-muted">Last seven days</p>
            <div className="flex items-end gap-1.5" role="img" aria-label={`Minutes studied over the last seven days: ${d.week.map((w) => Math.round(w.minutes)).join(", ")}`}>
              {d.week.map((w, i) => {
                const f = Math.min(1, w.minutes / Math.max(1, d.dailyGoal));
                const isToday = i === d.week.length - 1;
                return (
                  <div key={w.day} className="flex flex-1 flex-col items-center gap-1.5" aria-current={isToday ? "date" : undefined}>
                    <div className={clsx("flex h-14 w-full items-end overflow-hidden rounded-md bg-surface-2", isToday && "ring-2 ring-ink ring-offset-2 ring-offset-surface")}>
                      <div className="w-full rounded-md" style={{ height: `${Math.max(w.minutes > 0 ? 10 : 0, f * 100)}%`, background: f >= 1 ? "var(--good)" : "var(--accent)" }} />
                    </div>
                    <span className={clsx("text-[11px]", isToday ? "font-semibold text-ink" : "text-muted")}>{isToday ? "Today" : w.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Card className="p-5 sm:p-6">
          <CardHeader
            title="Readiness"
            sub={
              r.locked
                ? `Answer ${READINESS_UNLOCK} questions to unlock your readiness score.`
                : r.confidenceLabel === "baseline"
                  ? "Baseline set. Every answer narrows the range."
                  : `Estimated from your accuracy in each domain, weighted like the exam${r.fromMock ? ", plus your latest mock" : ""}. ${labelFor(r.passProbabilityLabel)}`
            }
          />
          <div className="mt-4 flex flex-col items-center gap-2 sm:flex-row sm:items-end sm:gap-6">
            <ReadinessGauge low={r.low} high={r.high} mid={r.predicted} pass={d.passingScore} locked={r.locked} caption={r.locked ? `pass line ${d.passingScore}` : `${CONFIDENCE_CAPTION[r.confidenceLabel]}, of 1000`} />
            <dl className="grid w-full grid-cols-3 gap-3 text-sm sm:grid-cols-1 sm:pb-3">
              <MiniStat label="Questions" value={d.answered.toLocaleString()} />
              <MiniStat label="Accuracy" value={d.answered ? `${Math.round(d.accuracy * 100)}%` : "–"} />
              <MiniStat label="Lessons" value={`${d.lessonsDone}/${d.lessonsTotal}`} />
            </dl>
          </div>
          {r.locked ? (
            <div className="mt-4">
              <p className="flex items-center gap-1.5 text-sm text-ink-2">
                <Lock size={14} aria-hidden />
                {Math.min(r.attempts, READINESS_UNLOCK)}/{READINESS_UNLOCK} questions answered
              </p>
              <ProgressBar value={Math.min(1, r.attempts / READINESS_UNLOCK)} className="mt-2" label="Questions answered toward unlocking readiness" />
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <ButtonLink href={r.locked ? "/practice" : "/practice?mode=weak"} variant="primary" size="sm">
              {r.locked ? "Answer questions" : "Practise weak areas"}
            </ButtonLink>
            <ButtonLink href="/mock" variant="outline" size="sm">
              Take a mock exam
            </ButtonLink>
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <CardHeader title="Domain mastery" sub="Recent answers count more. The dashed line marks roughly pass level." />
          <div className="mt-4">
            <MasteryRadar domains={d.domains.map((x) => ({ id: x.domainId, short: x.short, name: x.name, mastery: x.mastery, color: x.color, attempts: x.attempts }))} />
          </div>
        </Card>
      </div>

      <Card className="p-5 sm:p-6">
        <CardHeader title="Recent activity" />
        {d.recent.length === 0 ? (
          <p className="mt-4 text-sm text-muted">Nothing yet. Your first five minutes will show up here.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {d.recent.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                <span className="min-w-0 truncate">{r.text}</span>
                <span className="flex shrink-0 items-center gap-3 text-muted">
                  {r.xp > 0 ? <span className="font-medium text-accent-text tabular">+{r.xp} XP</span> : null}
                  <span className="hidden sm:inline">
                    <CalendarClock size={13} className="mr-1 inline align-[-2px]" aria-hidden />
                    {relTime(r.at, now)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

const CONFIDENCE_CAPTION = { baseline: "baseline", rough: "rough estimate", predicted: "predicted" } as const;

function weekday(day: string) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en", { weekday: "long", timeZone: "UTC" });
}

function dayList(days: number[]) {
  if (days.length === 1) return `Day ${days[0]}`;
  return `Days ${days.slice(0, -1).join(", ")} and ${days[days.length - 1]}`;
}

function BlockRow({ b, isNext }: { b: TodayBlock; isNext: boolean }) {
  const Icon = KIND_ICON[b.kind] ?? BookOpen;
  return (
    <li>
      <Link
        href={b.href}
        className={clsx(
          "group flex items-center gap-3.5 rounded-xl border px-3.5 py-3 transition-colors",
          b.done ? "border-transparent bg-surface-2/60" : isNext ? "border-ink bg-surface shadow-card" : "border-line hover:border-ink",
        )}
      >
        <span className={clsx("grid size-9 shrink-0 place-items-center rounded-lg", b.done ? "bg-good text-white" : isNext ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink-2")}>
          {b.done ? <Check size={18} strokeWidth={2.6} /> : <Icon size={18} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={clsx("block truncate font-medium", b.done && "text-muted line-through decoration-1")}>{b.title}</span>
          <span className="text-xs text-muted">
            {b.kind[0].toUpperCase() + b.kind.slice(1)} · {b.minutes} min
          </span>
        </span>
        {!b.done ? (
          isNext ? (
            <span className={buttonClass("accent", "sm", "pointer-events-none shrink-0")}>Start</span>
          ) : (
            <span className="text-sm font-medium text-ink-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">Open</span>
          )
        ) : null}
      </Link>
    </li>
  );
}

function labelFor(l: string) {
  switch (l) {
    case "very likely":
      return "You’re comfortably above the pass line.";
    case "likely":
      return "You’re above the pass line.";
    case "borderline":
      return "You’re close to the pass line.";
    case "unlikely":
      return "You’re below the pass line for now.";
    default:
      return "";
  }
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-surface/70 px-2.5 py-3 min-[400px]:px-3.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 font-display text-2xl font-semibold tracking-tight tabular">{children}</dd>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-display text-lg font-semibold tabular">{value}</dd>
    </div>
  );
}
