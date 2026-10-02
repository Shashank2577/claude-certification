import "server-only";
import { sql } from "drizzle-orm";
import { num, one, rows } from "./db";
import { getCertLessons } from "./content";
import type { Cert, LessonRef, PlanBlock } from "./content-types";
import { dayKey, daysBetween, localHour } from "./dates";
import { achievementById, levelFor } from "./gamification";
import { planDayIndex } from "./plan";
import { daysUntil } from "./plan-builder";
import { readiness, type Readiness } from "./scoring";
import { buildDeck } from "./flashcard-deck";
import { dailySeries, minutesOnDay, recentActivity, streakFor, totalXp } from "./repo/activity";
import { answerTotals, domainStats, type DomainStat } from "./repo/attempts";
import { getLessonProgress, lastStartedLesson } from "./repo/progress";
import type { Viewer } from "./viewer";

export interface TodayBlock extends PlanBlock {
  href: string;
  done: boolean;
}

export interface NextAction {
  title: string;
  kind: string;
  href: string;
}

export interface DomainSummary extends DomainStat {
  name: string;
  short: string;
  color: string;
  weight: number;
  lessonsDone: number;
  lessonsTotal: number;
}

export interface Dashboard {
  now: number;
  hour: number;
  firstName: string;
  xp: number;
  level: ReturnType<typeof levelFor>;
  streak: number;
  activeToday: boolean;
  freezes: number;
  minutesToday: number;
  dailyGoal: number;
  week: { day: string; minutes: number; label: string }[];
  planTitle: string | null;
  planDay: number;
  planLength: number;
  dayTitle: string | null;
  blocks: TodayBlock[];
  next: NextAction;
  domains: DomainSummary[];
  readiness: Readiness;
  passingScore: number;
  examDaysLeft: number | null;
  examDate: string | null;
  answered: number;
  accuracy: number;
  lessonsDone: number;
  lessonsTotal: number;
  messages: string[];
  recent: { id: number; text: string; xp: number; at: number }[];
}

function lessonHref(l: LessonRef) {
  return `/learn/${l.certId}/${l.domainId}/${l.id}`;
}

/** Short domain label for charts: "Agentic Architecture & Orchestration" → "Agentic Architecture". */
function shortName(name: string) {
  const first = name.split(/\s*[&,:(]\s*/)[0];
  return first.length > 22 ? `${first.slice(0, 20)}…` : first;
}

export async function buildDashboard(v: Viewer, now = Date.now()): Promise<Dashboard | null> {
  const { user, settings, cert } = v;
  if (!cert) return null;
  const tz = settings.tz;
  const today = dayKey(now, tz);
  const lessons = getCertLessons(cert.id);
  const lessonById = new Map(lessons.map((l) => [l.id, l]));

  // Everything the page needs, fetched in one parallel batch.
  const [xp, streak, progress, recentRows, cardsToday, mockCount, resourceRows, deck, resume, stats, totals, minutesToday, series, recentLog, lastActiveRow] =
    await Promise.all([
      totalXp(user.id),
      streakFor(user.id, tz, now),
      getLessonProgress(user.id),
      rows<{ domain_id: string; mode: string; created_at: string | number }>(
        sql`SELECT domain_id, mode, created_at FROM question_attempts WHERE user_id = ${user.id} AND created_at > ${now - 36 * 3_600_000}`,
      ),
      num(sql`SELECT COUNT(*)::int n FROM activity_log WHERE user_id = ${user.id} AND day = ${today} AND kind = 'flashcard'`),
      num(sql`SELECT COUNT(*)::int n FROM activity_log WHERE user_id = ${user.id} AND day = ${today} AND kind = 'mock'`),
      rows<{ resource_id: string }>(sql`SELECT resource_id FROM resource_progress WHERE user_id = ${user.id}`),
      buildDeck(user.id, cert, tz, undefined, now),
      lastStartedLesson(user.id),
      domainStats(
        user.id,
        cert.id,
        cert.domains.map((d) => d.id),
        now,
      ),
      answerTotals(user.id),
      minutesOnDay(user.id, today),
      dailySeries(user.id, tz, 7, now),
      recentActivity(user.id, 8),
      one<{ d: string | null }>(sql`SELECT MAX(day) d FROM activity_log WHERE user_id = ${user.id} AND day < ${today}`),
    ]);
  const isDone = (id: string) => progress.get(id)?.status === "done";

  // What happened today, for ticking off plan blocks.
  const answeredToday = recentRows.filter((r) => dayKey(Number(r.created_at), tz) === today && r.mode !== "mock");
  const mockToday = mockCount > 0;
  const resourcesDone = new Set(resourceRows.map((r) => r.resource_id));

  const plan = settings.plan && settings.plan.days.length > 0 ? settings.plan : null;
  const planDay = plan && settings.planStart ? planDayIndex(settings.planStart, today, plan.days.length) : 1;
  const day = plan?.days[planDay - 1] ?? null;

  const blocks: TodayBlock[] = (day?.blocks ?? []).map((b) => {
    switch (b.kind) {
      case "lesson": {
        const l = b.refId ? lessonById.get(b.refId) : undefined;
        return { ...b, title: l?.title ?? b.title, href: l ? lessonHref(l) : "/learn", done: !!(l && isDone(l.id)) };
      }
      case "quiz": {
        const domain = b.refId && cert.domains.some((d) => d.id === b.refId) ? b.refId : null;
        const n = domain ? answeredToday.filter((r) => r.domain_id === domain).length : answeredToday.length;
        return { ...b, href: domain ? `/practice?mode=domain&domain=${domain}` : "/practice?mode=weak", done: n >= 5 };
      }
      case "flashcards": {
        const domain = b.refId && cert.domains.some((d) => d.id === b.refId) ? b.refId : null;
        return { ...b, href: domain ? `/flashcards/review?domain=${domain}` : "/flashcards/review", done: cardsToday >= 5 || (deck.totalDue === 0 && deck.newLeft === 0) };
      }
      case "mock":
        return { ...b, href: "/mock", done: mockToday };
      case "resource":
        return { ...b, href: "/insights#resources", done: !!(b.refId && resourcesDone.has(b.refId)) };
      default:
        return { ...b, href: "/practice?mode=mistakes", done: answeredToday.length >= 5 };
    }
  });

  // The single next thing to do: first open plan block, else the next unfinished core lesson, else practice.
  const resumeLesson = resume ? lessonById.get(resume) : undefined;
  const nextLesson = lessons.find((l) => l.level !== "deep" && !isDone(l.id)) ?? lessons.find((l) => !isDone(l.id));
  const openBlock = blocks.find((b) => !b.done);
  let next: NextAction;
  if (openBlock) next = { title: openBlock.title, kind: openBlock.kind, href: openBlock.href };
  else if (resumeLesson && !isDone(resumeLesson.id)) next = { title: resumeLesson.title, kind: "lesson", href: lessonHref(resumeLesson) };
  else if (nextLesson) next = { title: nextLesson.title, kind: "lesson", href: lessonHref(nextLesson) };
  else next = { title: "Adaptive practice on your weakest areas", kind: "quiz", href: "/practice?mode=weak" };

  const domains: DomainSummary[] = cert.domains.map((d, i) => {
    const dl = lessons.filter((l) => l.domainId === d.id);
    return {
      ...stats[i],
      name: d.name,
      short: shortName(d.name),
      color: d.color,
      weight: d.weight,
      lessonsDone: dl.filter((l) => isDone(l.id)).length,
      lessonsTotal: dl.length,
    };
  });
  const ready = readiness(
    domains.map((d) => ({ domainId: d.domainId, weight: d.weight, mastery: d.mastery, attempts: d.attempts })),
    cert.examInfo.passingScore,
  );

  const lessonsDone = lessons.filter((l) => isDone(l.id)).length;
  const examDaysLeft = daysUntil(settings.examDate, tz, now);

  const week = series.map((s) => ({
    day: s.day,
    minutes: s.minutes,
    label: new Date(`${s.day}T12:00:00Z`).toLocaleDateString("en", { weekday: "narrow", timeZone: "UTC" }),
  }));

  const recent = recentLog.map((a) => ({ id: a.id, text: describeActivity(a.kind, a.refId, a.meta, lessonById, cert), xp: a.xp, at: a.createdAt }));

  return {
    now,
    hour: localHour(now, tz),
    firstName: user.name.split(" ")[0],
    xp,
    level: levelFor(xp),
    streak: streak.current,
    activeToday: streak.activeToday,
    freezes: settings.freezes,
    minutesToday,
    dailyGoal: settings.dailyMinutes,
    week,
    planTitle: plan?.title ?? null,
    planDay,
    planLength: plan?.days.length ?? 0,
    dayTitle: day?.title ?? null,
    blocks,
    next,
    domains,
    readiness: ready,
    passingScore: cert.examInfo.passingScore,
    examDaysLeft,
    examDate: settings.examDate,
    answered: totals.answered,
    accuracy: totals.answered ? totals.correct / totals.answered : 0,
    lessonsDone,
    lessonsTotal: lessons.length,
    messages: motivation({ cert, domains, streak: streak.current, activeToday: streak.activeToday, ready, examDaysLeft, lessons, isDone, totals, lastActive: lastActiveRow?.d ?? null, today, minutesToday, goal: settings.dailyMinutes }),
    recent,
  };
}

function describeActivity(kind: string, refId: string | null, meta: Record<string, unknown>, lessons: Map<string, LessonRef>, cert: Cert): string {
  switch (kind) {
    case "lesson":
      return `Finished “${(refId && lessons.get(refId)?.title) || "a lesson"}”`;
    case "answer":
      return meta.correct === false || meta.correct === 0 ? "Answered a question (missed)" : "Answered a question";
    case "quiz":
      return `Finished a practice set${typeof meta.correct === "number" && typeof meta.answered === "number" ? `: ${meta.correct}/${meta.answered}` : ""}`;
    case "flashcard":
      return "Reviewed a flashcard";
    case "mock":
      return `Completed a mock exam${typeof meta.score === "number" ? ` (${meta.score})` : ""}`;
    case "focus":
      return refId === "sprint" ? "Finished a five-minute start" : "Finished a focus block";
    case "resource":
      return "Finished a resource";
    case "daily-goal":
      return "Hit the daily goal";
    case "onboarding":
      return `Started the ${cert.name.replace(/^Claude Certified Architect\s*[–-]\s*/, "")} plan`;
    case "achievement":
      return `Unlocked “${(refId && achievementById(refId)?.title) || "a badge"}”`;
    default:
      return "Studied";
  }
}

/** Messages derived from the learner's actual numbers. No generic encouragement. */
function motivation(o: {
  cert: Cert;
  domains: DomainSummary[];
  streak: number;
  activeToday: boolean;
  ready: Readiness;
  examDaysLeft: number | null;
  lessons: LessonRef[];
  isDone: (id: string) => boolean;
  totals: { answered: number; correct: number };
  lastActive: string | null;
  today: string;
  minutesToday: number;
  goal: number;
}): string[] {
  const out: string[] = [];
  const gap = o.lastActive ? daysBetween(o.lastActive, o.today) : 0;

  // Nearest domain to completion: the strongest comeback hook.
  const close = o.domains
    .map((d, i) => ({ d, i, left: d.lessonsTotal - d.lessonsDone }))
    .filter((x) => x.d.lessonsDone > 0 && x.left > 0 && x.left <= 3)
    .sort((a, b) => a.left - b.left)[0];
  if (close) {
    const lead = gap >= 2 ? `Welcome back. You were` : `You’re`;
    out.push(`${lead} ${close.left} lesson${close.left === 1 ? "" : "s"} from finishing domain ${close.i + 1}, ${close.d.short}.`);
  } else if (gap >= 2) {
    out.push(`Welcome back after ${gap} days. One five-minute session today restarts the habit.`);
  }

  if (o.streak > 0 && !o.activeToday) out.push(`Your ${o.streak}-day streak is still alive. One lesson or five questions today keeps it going.`);
  else if (o.streak >= 2) out.push(`Day ${o.streak} of your streak, and today already counts.`);

  if (!o.activeToday && o.minutesToday === 0 && o.goal > 0 && o.streak === 0) out.push(`Today’s goal is ${o.goal} minutes. The first five are the only hard ones.`);
  else if (o.minutesToday > 0 && o.minutesToday < o.goal) out.push(`${Math.round(o.minutesToday)} of ${o.goal} minutes done today. ${Math.max(1, Math.ceil(o.goal - o.minutesToday))} more closes the ring.`);

  const tried = o.domains.filter((d) => d.attempts >= 3);
  if (tried.length > 0) {
    const weakest = [...tried].sort((a, b) => a.mastery - b.mastery)[0];
    out.push(`${weakest.short} is your weakest area at ${Math.round(weakest.mastery * 100)}% mastery and ${weakest.weight}% of the exam. Ten questions there moves your score the most.`);
  }

  if (o.ready.passProbabilityLabel !== "not enough data") {
    const gapPts = o.cert.examInfo.passingScore - o.ready.predicted;
    out.push(
      gapPts > 0
        ? `Predicted score ${o.ready.predicted}. That’s ${gapPts} points below the ${o.cert.examInfo.passingScore} pass line.`
        : `Predicted score ${o.ready.predicted}, ${-gapPts} points above the pass line. A timed mock will tell you if it holds under pressure.`,
    );
  }

  const left = o.lessons.filter((l) => l.level !== "deep" && !o.isDone(l.id)).length;
  if (o.examDaysLeft != null && o.examDaysLeft > 0 && left > 0) {
    out.push(`${left} core lesson${left === 1 ? "" : "s"} left and ${o.examDaysLeft} day${o.examDaysLeft === 1 ? "" : "s"} to the exam: about ${Math.ceil(left / Math.max(1, o.examDaysLeft))} a day.`);
  }

  if (o.totals.answered >= 10) out.push(`${o.totals.answered} questions answered at ${Math.round((o.totals.correct / o.totals.answered) * 100)}% accuracy.`);

  if (out.length === 0) {
    const first = o.lessons.find((l) => !o.isDone(l.id));
    out.push(first ? `Start with “${first.title}”. It takes about ${first.estMinutes} minutes.` : "Every lesson is done. Mock exams are the best use of your time now.");
  }
  return out;
}
