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
}

export interface GeneratedPlan extends StudyPlan {
  tight: boolean;
}

const DEFAULT_DAYS = 21;
const MAX_DAYS = 120;

export function planLength(daysUntilExam: number | null): number {
  if (daysUntilExam == null || !Number.isFinite(daysUntilExam)) return DEFAULT_DAYS;
  return Math.max(1, Math.min(MAX_DAYS, Math.floor(daysUntilExam)));
}

export function generatePlan(input: PlanInput): GeneratedPlan {
  const totalDays = planLength(input.daysUntilExam);
  const budget = Math.max(5, input.dailyMinutes);
  const domainOrder = [...input.domains].sort((a, b) => b.weight - a.weight);
  const domainName = new Map(input.domains.map((d) => [d.id, d.name]));

  // Lessons in weight order; deep dives only for technical learners with room to spare.
  const core = domainOrder.flatMap((d) => input.lessons.filter((l) => l.domainId === d.id && l.level !== "deep"));
  const deep = domainOrder.flatMap((d) => input.lessons.filter((l) => l.domainId === d.id && l.level === "deep"));

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

  const lessonShare = Math.max(5, Math.round(budget * 0.7));
  const coreMinutes = core.reduce((s, l) => s + l.estMinutes, 0);
  const capacity = learnDays * lessonShare;
  const queue = [...core];
  if (input.background === "technical" && coreMinutes + deep.reduce((s, l) => s + l.estMinutes, 0) <= capacity * 0.85) {
    queue.push(...deep);
  }
  const queueMinutes = queue.reduce((s, l) => s + l.estMinutes, 0);
  const tight = queueMinutes > capacity;
  // When time is tight, spread evenly instead of by minutes so every lesson still gets a slot.
  const perDayMinutes = tight ? Math.ceil(queueMinutes / Math.max(1, learnDays)) : lessonShare;

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
    description: tight
      ? `Your exam is close, so lessons are packed tighter than your ${budget}-minute goal. Prioritise the core lessons.`
      : `Built around ${budget} minutes a day, weighted toward the domains that carry the most marks.`,
    days: all,
    tight,
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
