// Personal study plan generation. Pure: callers pass content in.
import type { PlanBlock, PlanDay, StudyPlan } from "./content-types";

export interface PlanDomain {
  id: string;
  name: string;
  weight: number;
}

export interface PlanLesson {
  id: string;
  title: string;
  domainId: string;
  estMinutes: number;
  level: "core" | "deep";
}

export interface PlanInput {
  certId: string;
  certName: string;
  domains: PlanDomain[];
  lessons: PlanLesson[];
  /** Days from today until the exam, inclusive of today. Null = no date set. */
  daysUntilExam: number | null;
  dailyMinutes: number;
  background: "technical" | "non-technical";
  /** Lessons already finished; they are never scheduled again. */
  doneLessonIds?: Iterable<string>;
  /**
   * normal: fit everything, packing days tighter than the goal if needed.
   * crunch: the learner raised their goal to fit; scheduled like normal.
   * triage: keep the goal, core lessons only, highest-weight domains first; what doesn't fit is dropped.
   */
  mode?: PlanMode;
}

export type PlanMode = "normal" | "crunch" | "triage";

export interface GeneratedPlan extends StudyPlan {
  tight: boolean;
  mode: PlanMode;
  /** Lessons that didn't fit before the exam (triage, or capped non-technical plans). */
  dropped: number;
}

const DEFAULT_DAYS = 21;
const MAX_DAYS = 120;
/** Share of the daily goal given to reading lessons; the rest goes to a quiz and flashcards. */
const LESSON_SHARE = 0.7;

export function planLength(daysUntilExam: number | null, selfPaced?: { coreMinutes: number; dailyMinutes: number }): number {
  if (daysUntilExam == null || !Number.isFinite(daysUntilExam)) {
    if (!selfPaced) return DEFAULT_DAYS;
    // No exam date means no deadline: stretch the plan so the core lessons fit the daily goal.
    return selfPacedDays(Math.ceil(selfPaced.coreMinutes / lessonShareOf(selfPaced.dailyMinutes)));
  }
  return Math.max(1, Math.min(MAX_DAYS, Math.floor(daysUntilExam)));
}

/** Learn days plus ~15% spare days (weak-area practice, mid-plan mock) and the two rehearsal days; 7 to MAX_DAYS. */
function selfPacedDays(learnDays: number): number {
  return Math.max(7, Math.min(MAX_DAYS, learnDays + Math.ceil(learnDays * 0.15) + 2));
}

/** Days the greedy daily packing in generatePlan needs: each day takes lessons while they fit, and always at least one. */
function packedDays(lessonMinutes: readonly number[], perDay: number): number {
  let days = 0;
  for (let i = 0; i < lessonMinutes.length; days++) {
    let used = 0;
    while (i < lessonMinutes.length && (used === 0 || used + lessonMinutes[i] <= perDay)) used += lessonMinutes[i++];
  }
  return days;
}

/** Days of a plan left for learning once the final mock and review days are reserved. */
export function learnDaysFor(totalDays: number): number {
  return totalDays >= 4 ? totalDays - 2 : totalDays;
}

function lessonShareOf(dailyMinutes: number): number {
  return Math.max(5, Math.round(Math.max(5, dailyMinutes) * LESSON_SHARE));
}

/**
 * Daily goal (minutes) needed to read `coreMinutes` of lessons over `learnDays` days,
 * including the short quiz and flashcards each day gets. Pure, rounded up to whole minutes.
 */
export function requiredMinutesPerDay(coreMinutes: number, learnDays: number): number {
  if (coreMinutes <= 0) return 0;
  return Math.ceil(coreMinutes / Math.max(1, learnDays) / LESSON_SHARE);
}

export interface Feasibility {
  /** Daily goal the remaining core lessons need. */
  required: number;
  goal: number;
  feasible: boolean;
  /** Goal to suggest for crunch mode: `required` rounded up to 5, capped at 240. */
  crunchGoal: number;
  learnDays: number;
}

/** Can `coreMinutes` of lessons fit before the exam at `dailyMinutes` a day? */
export function planFeasibility(coreMinutes: number, daysUntilExam: number | null, dailyMinutes: number): Feasibility {
  const selfPaced = daysUntilExam == null;
  const learnDays = learnDaysFor(planLength(daysUntilExam, { coreMinutes, dailyMinutes }));
  const required = requiredMinutesPerDay(coreMinutes, learnDays);
  const goal = Math.max(5, dailyMinutes);
  return {
    required,
    goal,
    // Without an exam date the plan simply gets longer, so any goal works.
    feasible: selfPaced || required <= goal,
    crunchGoal: Math.min(240, Math.max(goal, Math.ceil(required / 5) * 5)),
    learnDays,
  };
}

export function generatePlan(input: PlanInput): GeneratedPlan {
  const mode: PlanMode = input.mode ?? "normal";
  const budget = Math.max(5, input.dailyMinutes);
  const domainOrder = [...input.domains].sort((a, b) => b.weight - a.weight);
  const domainName = new Map(input.domains.map((d) => [d.id, d.name]));
  const done = new Set(input.doneLessonIds ?? []);
  const todo = input.lessons.filter((l) => !done.has(l.id));
  const totalDays =
    input.daysUntilExam == null
      ? selfPacedDays(packedDays(todo.filter((l) => l.level !== "deep").map((l) => l.estMinutes), lessonShareOf(budget)))
      : planLength(input.daysUntilExam);
  // Triage and non-technical plans never pack a day past the goal plus one lesson.
  const capped = mode === "triage" || input.background === "non-technical";

  // Lessons in weight order; deep dives only for technical learners with room to spare.
  const core = domainOrder.flatMap((d) => todo.filter((l) => l.domainId === d.id && l.level !== "deep"));
  const deep = domainOrder.flatMap((d) => todo.filter((l) => l.domainId === d.id && l.level === "deep"));

  // Reserve the end of the plan for exam rehearsal.
  const tail: PlanDay[] = [];
  if (totalDays >= 4) {
    tail.push({ day: 0, title: "Full mock exam", blocks: [{ kind: "mock", refId: input.certId, title: "Timed mock exam", minutes: Math.max(budget, 30) }] });
    tail.push({
      day: 0,
      title: "Light review and rest",
      blocks: [
        { kind: "review", refId: null, title: "Review your mock mistakes", minutes: Math.round(budget * 0.5) },
        { kind: "flashcards", refId: null, title: "Flashcards: due cards", minutes: Math.max(5, Math.round(budget * 0.3)) },
      ],
    });
  }
  const learnDays = totalDays - tail.length;

  const lessonShare = lessonShareOf(budget);
  const coreMinutes = core.reduce((s, l) => s + l.estMinutes, 0);
  const capacity = learnDays * lessonShare;
  const queue = [...core];
  if (input.background === "technical" && mode !== "triage" && coreMinutes + deep.reduce((s, l) => s + l.estMinutes, 0) <= capacity * 0.85) {
    queue.push(...deep);
  }
  const queueMinutes = queue.reduce((s, l) => s + l.estMinutes, 0);
  const tight = queueMinutes > capacity;
  // When time is tight, spread evenly instead of by minutes so every lesson still gets a slot,
  // unless the plan is capped: then each day keeps to the goal and the overflow is dropped.
  const perDayMinutes = tight && !capped ? Math.ceil(queueMinutes / Math.max(1, learnDays)) : lessonShare;

  const days: PlanDay[] = [];
  let midMockPlaced = totalDays < 10;
  for (let d = 0; d < learnDays; d++) {
    const blocks: PlanBlock[] = [];
    const touched: string[] = [];
    let used = 0;
    while (queue.length > 0 && (used === 0 || used + queue[0].estMinutes <= perDayMinutes)) {
      const l = queue.shift()!;
      blocks.push({ kind: "lesson", refId: l.id, title: l.title, minutes: l.estMinutes });
      used += l.estMinutes;
      if (!touched.includes(l.domainId)) touched.push(l.domainId);
    }
    const left = Math.max(0, budget - used);
    if (touched.length > 0) {
      const dom = touched[touched.length - 1];
      blocks.push({ kind: "quiz", refId: dom, title: `Quick quiz: ${domainName.get(dom) ?? dom}`, minutes: Math.max(5, Math.min(15, left || 5)) });
      if (budget >= 20) blocks.push({ kind: "flashcards", refId: dom, title: "Flashcards", minutes: 5 });
      days.push({ day: d + 1, title: `Learn: ${touched.map((t) => domainName.get(t) ?? t).join(" + ")}`, blocks });
    } else if (!midMockPlaced && d >= Math.floor(learnDays * 0.6)) {
      midMockPlaced = true;
      days.push({ day: d + 1, title: "Practice mock exam", blocks: [{ kind: "mock", refId: input.certId, title: "Timed mock exam", minutes: Math.max(budget, 30) }] });
    } else {
      days.push({
        day: d + 1,
        title: "Sharpen weak areas",
        blocks: [
          { kind: "quiz", refId: "weak", title: "Adaptive quiz: weakest areas", minutes: Math.max(5, Math.round(budget * 0.6)) },
          { kind: "flashcards", refId: null, title: "Flashcards: due cards", minutes: Math.max(5, Math.round(budget * 0.4)) },
        ],
      });
    }
  }
  // Capped plans drop what doesn't fit rather than overloading a day.
  const dropped = capped ? queue.length : 0;
  if (capped) queue.length = 0;
  // Anything left over (only possible with a one-day plan) lands on the final learn day.
  if (queue.length > 0 && days.length > 0) {
    const last = days[days.length - 1];
    last.blocks.unshift(...queue.map((l) => ({ kind: "lesson" as const, refId: l.id, title: l.title, minutes: l.estMinutes })));
  } else if (queue.length > 0) {
    days.push({ day: 1, title: "Cram day", blocks: queue.map((l) => ({ kind: "lesson" as const, refId: l.id, title: l.title, minutes: l.estMinutes })) });
  }

  const all = [...days, ...tail].map((day, i) => ({ ...day, day: i + 1 }));
  return {
    id: "personal",
    title: `Your ${all.length}-day plan`,
    certId: input.certId,
    description:
      dropped > 0
        ? `Kept to about ${budget} minutes a day, highest-weight domains first. ${dropped} lesson${dropped === 1 ? "" : "s"} won’t fit before your exam.`
        : tight
          ? `Your exam is close, so lessons are packed tighter than your ${budget}-minute goal. Prioritise the core lessons.`
          : `Built around ${budget} minutes a day, weighted toward the domains that carry the most marks.`,
    days: all,
    tight,
    mode,
    dropped,
  };
}

/** Pick a curated plan whose length fits the time available, if any. */
export function pickCuratedPlan(plans: readonly StudyPlan[], certId: string, daysUntilExam: number | null): StudyPlan | undefined {
  const total = planLength(daysUntilExam);
  const fitting = plans.filter((p) => p.certId === certId && p.days.length > 0 && p.days.length <= total);
  fitting.sort((a, b) => b.days.length - a.days.length);
  const best = fitting[0];
  if (!best) return undefined;
  return total - best.days.length <= Math.max(2, Math.round(total * 0.25)) ? best : undefined;
}

/** Which day of the plan is today (1-based, clamped). */
export function planDayIndex(planStartDay: string, todayDay: string, planLengthDays: number): number {
  const diff = Math.round((Date.parse(todayDay) - Date.parse(planStartDay)) / 86_400_000);
  return Math.max(1, Math.min(planLengthDays, diff + 1));
}
