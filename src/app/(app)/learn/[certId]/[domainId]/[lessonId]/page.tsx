import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, BookMarked, Check, ChevronLeft, ChevronRight, Clock, ExternalLink, Lightbulb, Sparkles } from "lucide-react";
import { getCert, getCertLessons, getCertQuestions } from "@/lib/content";
import { toPublicQuestion } from "@/lib/content-types";
import { questionHistory } from "@/lib/repo/attempts";
import { minutesOnDay } from "@/lib/repo/activity";
import { getLessonProgress, markLessonStarted } from "@/lib/repo/progress";
import { dayKey } from "@/lib/dates";
import { getViewer } from "@/lib/viewer";
import { Markdown } from "@/components/ui/markdown";
import { Pill } from "@/components/ui/card";
import { Visual } from "@/components/visuals/visual";
import { ContentReport } from "@/components/content-report";
import { CheckYourself } from "@/components/quiz/check-yourself";
import { CompleteButton, type NextLesson } from "./complete-button";

type Props = PageProps<"/learn/[certId]/[domainId]/[lessonId]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { certId, lessonId } = await params;
  const l = getCertLessons(certId).find((x) => x.id === lessonId);
  return { title: l?.title ?? "Lesson" };
}

/** Minutes left in today's goal once `pending` more minutes are logged; null if it can't be worked out. */
async function goalMinutesLeft(userId: number, tz: string, dailyMinutes: number, pending: number): Promise<number | null> {
  if (!dailyMinutes) return null;
  const today = await minutesOnDay(userId, dayKey(Date.now(), tz)).catch(() => null);
  return today == null ? null : Math.max(0, Math.round(dailyMinutes - today - pending));
}

export default async function LessonPage({ params }: Props) {
  const { certId, domainId, lessonId } = await params;
  const { user, settings } = await getViewer();
  const cert = getCert(certId);
  const lessons = getCertLessons(certId);
  const idx = lessons.findIndex((l) => l.id === lessonId && l.domainId === domainId);
  const lesson = lessons[idx];
  const domain = cert?.domains.find((d) => d.id === domainId);
  if (!cert || !domain || !lesson) notFound();

  await markLessonStarted(user.id, lesson);
  const progress = await getLessonProgress(user.id);
  const done = progress.get(lesson.id)?.status === "done";
  const prev = lessons[idx - 1];
  const next = lessons[idx + 1];

  // Momentum after "Mark complete": the next unfinished core lesson in cert order (wrapping to earlier gaps).
  const unfinished = (l: (typeof lessons)[number]) => l.id !== lesson.id && l.level !== "deep" && progress.get(l.id)?.status !== "done";
  const upNext = lessons.slice(idx + 1).find(unfinished) ?? lessons.slice(0, idx).find(unfinished);
  const nextLesson: NextLesson | null = upNext ? { href: `/learn/${cert.id}/${upNext.domainId}/${upNext.id}`, title: upNext.title, minutes: upNext.estMinutes || 0 } : null;
  const goalLeftAfter = await goalMinutesLeft(user.id, settings.tz, settings.dailyMinutes, done ? 0 : lesson.estMinutes || 0);

  // Up to three questions for this lesson's task statements, unseen first, then ones last missed.
  const history = await questionHistory(user.id);
  const check = getCertQuestions(certId)
    .filter((q) => lesson.taskStatementIds.includes(q.taskStatementId))
    .map((q) => {
      const h = history[q.id];
      return { q, rank: !h ? 0 : !h.lastCorrect ? 1 : 2 + h.attempts };
    })
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 3)
    .map(({ q }) => toPublicQuestion(q));

  const tasks = domain.taskStatements.filter((t) => lesson.taskStatementIds.includes(t.id));
  const eli5Open = settings.background === "non-technical";
  const color = domain.color || "var(--accent)";

  return (
    <article className="mx-auto w-full max-w-3xl min-w-0">
      <Link href={`/learn/${cert.id}/${domain.id}`} className="-my-3 mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft size={15} /> {domain.name}
      </Link>

      <header>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <span className="inline-block size-2.5 rounded-full" style={{ background: color }} aria-hidden />
          <span className="tabular">
            Lesson {lessons.filter((l) => l.domainId === domainId).findIndex((l) => l.id === lesson.id) + 1} of {lessons.filter((l) => l.domainId === domainId).length}
          </span>
          <span className="inline-flex items-center gap-1 tabular">
            <Clock size={13} /> {lesson.estMinutes} min
          </span>
          {lesson.level === "deep" ? <Pill tone="info">Deep dive</Pill> : null}
          {done ? <Pill tone="good">Done</Pill> : null}
        </div>
        <h1 className="mt-3 font-display text-3xl leading-[1.08] font-semibold tracking-[-0.025em] sm:text-[2.6rem]">{lesson.title}</h1>
        {tasks.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-1.5" aria-label="Task statements covered">
            {tasks.map((t) => (
              <li key={t.id} className="flex gap-2 text-sm text-ink-2">
                <span className="shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 font-display text-xs font-semibold text-ink tabular">{t.id}</span>
                <span>{t.text}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </header>

      {lesson.eli5 ? (
        <details open={eli5Open} className="group mt-8 rounded-2xl border border-accent/50 bg-accent-soft/60 px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-display font-semibold select-none">
            <Lightbulb size={18} className="text-accent-text" aria-hidden />
            In plain English
            <ChevronRight size={16} className="ml-auto text-muted transition-transform group-open:rotate-90" aria-hidden />
          </summary>
          <p className="mt-2 font-serif text-[1.1rem] leading-relaxed text-ink">{lesson.eli5}</p>
        </details>
      ) : null}

      {lesson.visualId ? (
        // min-w-0 + overflow-x-auto: a wide figure scrolls inside itself instead of widening the page.
        <div className="mt-8 max-w-full min-w-0 overflow-x-auto">
          <Visual id={lesson.visualId} />
        </div>
      ) : null}

      <div className="mt-8 min-w-0">
        <Markdown variant="lesson" collapseCode={settings.background === "non-technical"}>
          {lesson.body}
        </Markdown>
      </div>
      <div className="mt-4"><ContentReport kind="lesson" contentId={lesson.id} certId={cert.id} /></div>

      {lesson.keyTakeaways.length > 0 ? (
        <section className="mt-12 rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6" aria-labelledby="takeaways-h">
          <h2 id="takeaways-h" className="flex items-center gap-2 font-display text-lg font-semibold">
            <BookMarked size={18} className="text-accent-text" aria-hidden /> Key takeaways
          </h2>
          <ul className="mt-4 space-y-2.5">
            {lesson.keyTakeaways.map((t, i) => (
              <li key={i} className="flex gap-3">
                <Check size={18} className="mt-0.5 shrink-0 text-good" aria-hidden />
                <span className="min-w-0 [overflow-wrap:anywhere]">{t}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {lesson.examTips.length > 0 || lesson.commonTraps.length > 0 ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-[repeat(2,minmax(0,1fr))]">
          {lesson.examTips.length > 0 ? (
            <section className="rounded-2xl bg-info-soft/70 p-5" aria-labelledby="tips-h">
              <h2 id="tips-h" className="flex items-center gap-2 font-display font-semibold text-info">
                <Sparkles size={17} aria-hidden /> How the exam tests this
              </h2>
              <ul className="mt-3 space-y-2 text-[0.95rem]">
                {lesson.examTips.map((t, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-info" aria-hidden />
                    <span className="min-w-0 [overflow-wrap:anywhere]">{t}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {lesson.commonTraps.length > 0 ? (
            <section className="rounded-2xl bg-bad-soft/70 p-5" aria-labelledby="traps-h">
              <h2 id="traps-h" className="flex items-center gap-2 font-display font-semibold text-bad">
                <AlertTriangle size={17} aria-hidden /> Common traps
              </h2>
              <ul className="mt-3 space-y-2 text-[0.95rem]">
                {lesson.commonTraps.map((t, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-bad" aria-hidden />
                    <span className="min-w-0 [overflow-wrap:anywhere]">{t}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}

      {lesson.resources.length > 0 ? (
        <section className="mt-10" aria-labelledby="res-h">
          <h2 id="res-h" className="font-display text-lg font-semibold">
            Go deeper
          </h2>
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line">
            {lesson.resources.map((r) => (
              <li key={r.url}>
                <a href={r.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/60">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{r.title}</span>
                    <span className="text-xs text-muted capitalize">{r.type}</span>
                  </span>
                  <ExternalLink size={16} className="shrink-0 text-muted" aria-hidden />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-12 min-w-0" aria-labelledby="check-h">
        <h2 id="check-h" className="font-display text-xl font-semibold tracking-tight">
          Check yourself
        </h2>
        <p className="mt-1 mb-4 text-sm text-ink-2">A few questions on this lesson&apos;s task statements. Answers count toward your mastery.</p>
        <CheckYourself questions={check} lessonId={lesson.id} />
      </section>

      <footer className="mt-12 border-t border-line pt-8">
        <CompleteButton lessonId={lesson.id} done={done} next={nextLesson} goalLeftAfter={goalLeftAfter} />
        <nav className="mt-8 grid gap-3 sm:grid-cols-[repeat(2,minmax(0,1fr))]" aria-label="Lesson navigation">
          {prev ? (
            <Link href={`/learn/${cert.id}/${prev.domainId}/${prev.id}`} className="group rounded-2xl border border-line p-4 transition-colors hover:border-line-strong">
              <span className="flex items-center gap-1 text-xs text-muted">
                <ChevronLeft size={14} /> Previous
              </span>
              <span className="mt-1 block font-medium group-hover:underline group-hover:underline-offset-4">{prev.title}</span>
            </Link>
          ) : (
            <span className="hidden sm:block" />
          )}
          {next ? (
            <Link href={`/learn/${cert.id}/${next.domainId}/${next.id}`} className="group rounded-2xl border border-line p-4 text-right transition-colors hover:border-line-strong">
              <span className="flex items-center justify-end gap-1 text-xs text-muted">
                {next.domainId !== domainId ? "Next domain" : "Next"} <ChevronRight size={14} />
              </span>
              <span className="mt-1 block font-medium group-hover:underline group-hover:underline-offset-4">{next.title}</span>
            </Link>
          ) : (
            <Link href="/mock" className="group rounded-2xl border border-line p-4 text-right transition-colors hover:border-line-strong">
              <span className="text-xs text-muted">That was the last lesson</span>
              <span className="mt-1 block font-medium group-hover:underline group-hover:underline-offset-4">Try a mock exam</span>
            </Link>
          )}
        </nav>
      </footer>
    </article>
  );
}
