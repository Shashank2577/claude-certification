import "server-only";
import { getCert, getCertLessons, getStudyPlans } from "./content";
import type { StudyPlan } from "./content-types";
import { dayKey, daysBetween } from "./dates";
import { generatePlan, pickCuratedPlan, planFeasibility, type Feasibility, type PlanMode } from "./plan";

export function daysUntil(examDate: string | null, tz: string, now = Date.now()): number | null {
  if (!examDate || !/^\d{4}-\d{2}-\d{2}$/.test(examDate)) return null;
  return daysBetween(dayKey(now, tz), examDate);
}

/** Curated plan if one was chosen (or fits), otherwise a generated one. */
export function buildPlan(opts: {
  certId: string;
  examDate: string | null;
  dailyMinutes: number;
  background: "technical" | "non-technical";
  tz: string;
  choice?: string;
  /** Finished lessons; skipped so a rebuild doesn't re-schedule them. */
  doneLessonIds?: Iterable<string>;
  mode?: PlanMode;
}): StudyPlan | null {
  const cert = getCert(opts.certId);
  if (!cert) return null;
  const left = daysUntil(opts.examDate, opts.tz);
  const studyDays = left == null ? null : Math.max(1, left);
  const curated = getStudyPlans().filter((p) => p.certId === cert.id);
  if (opts.choice && opts.choice !== "personal") {
    const chosen = curated.find((p) => p.id === opts.choice);
    if (chosen) return chosen;
  }
  if (!opts.choice) {
    const fit = pickCuratedPlan(curated, cert.id, studyDays);
    if (fit) return fit;
  }
  return generatePlan({
    certId: cert.id,
    certName: cert.name,
    domains: cert.domains.map((d) => ({ id: d.id, name: d.name, weight: d.weight })),
    lessons: getCertLessons(cert.id).map((l) => ({ id: l.id, title: l.title, domainId: l.domainId, estMinutes: l.estMinutes || 8, level: l.level })),
    daysUntilExam: studyDays,
    dailyMinutes: opts.dailyMinutes,
    background: opts.background,
    doneLessonIds: opts.doneLessonIds,
    mode: opts.mode,
  });
}

/** Whether the unfinished core lessons of a cert fit before the exam at the given goal. */
export function feasibilityFor(opts: { certId: string; examDate: string | null; dailyMinutes: number; tz: string; doneLessonIds?: Iterable<string> }): Feasibility | null {
  if (!getCert(opts.certId)) return null;
  const done = new Set(opts.doneLessonIds ?? []);
  const coreMinutes = getCertLessons(opts.certId)
    .filter((l) => l.level !== "deep" && !done.has(l.id))
    .reduce((s, l) => s + (l.estMinutes || 8), 0);
  const left = daysUntil(opts.examDate, opts.tz);
  return planFeasibility(coreMinutes, left == null ? null : Math.max(1, left), opts.dailyMinutes);
}
