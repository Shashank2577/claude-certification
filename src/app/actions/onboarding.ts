"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getCert } from "@/lib/content";
import { dayKey } from "@/lib/dates";
import { XP } from "@/lib/gamification";
import type { PlanMode } from "@/lib/plan";
import { buildPlan, feasibilityFor } from "@/lib/plan-builder";
import { getLessonProgress } from "@/lib/repo/progress";
import { recordActivity } from "@/lib/repo/activity";
import { getSettings, updateSettings } from "@/lib/repo/settings";

export interface OnboardingInput {
  certIds: string[];
  examDate: string | null;
  dailyMinutes: number;
  background: "technical" | "non-technical";
  tz: string;
  planChoice: string;
  /** How to handle a goal too small for the time left: crunch raises the goal, triage drops low-weight lessons. */
  planMode?: PlanMode;
}

function validTz(tz: string): string {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

export async function completeOnboarding(input: OnboardingInput): Promise<{ error?: string }> {
  const user = await requireUser();
  const certIds = (input.certIds ?? []).filter((id) => getCert(id));
  if (certIds.length === 0) return { error: "Pick at least one exam to prepare for." };
  const examDate = input.examDate && /^\d{4}-\d{2}-\d{2}$/.test(input.examDate) ? input.examDate : null;
  let dailyMinutes = Math.max(5, Math.min(240, Math.round(Number(input.dailyMinutes) || 20)));
  const background = input.background === "non-technical" ? "non-technical" : "technical";
  const tz = validTz(input.tz || "UTC");
  const mode: PlanMode = input.planMode === "crunch" || input.planMode === "triage" ? input.planMode : "normal";
  const progress = await getLessonProgress(user.id);
  const doneLessonIds = [...progress.values()].filter((p) => p.status === "done").map((p) => p.lessonId);
  if (mode === "crunch") {
    // Crunch means "raise my goal until the core lessons fit"; enforce it here too.
    const f = feasibilityFor({ certId: certIds[0], examDate, dailyMinutes, tz, doneLessonIds });
    if (f && !f.feasible) dailyMinutes = f.crunchGoal;
  }
  const plan = buildPlan({ certId: certIds[0], examDate, dailyMinutes, background, tz, choice: input.planChoice || "personal", doneLessonIds, mode });

  const wasOnboarded = (await getSettings(user.id)).onboarded;
  await updateSettings(user.id, {
    onboarded: true,
    certIds,
    activeCert: certIds[0],
    examDate,
    dailyMinutes,
    background,
    tz,
    plan,
    planStart: dayKey(Date.now(), tz),
  });
  if (!wasOnboarded) await recordActivity(user.id, { kind: "onboarding", xp: XP.onboarding });
  redirect("/today");
}
