"use server";

import { revalidatePath } from "next/cache";
import { createSession, requireUser } from "@/lib/auth";
import { hashPassword, validateName, validatePassword, verifyPassword } from "@/lib/auth-core";
import { getCert } from "@/lib/content";
import { dayKey } from "@/lib/dates";
import type { GeneratedPlan } from "@/lib/plan";
import { buildPlan } from "@/lib/plan-builder";
import { getLessonProgress } from "@/lib/repo/progress";
import { getSettings, updateSettings, type UserSettings } from "@/lib/repo/settings";
import { getUserById, getUserWithHashByEmail, setPassword, updateName } from "@/lib/repo/users";

export interface FormResult {
  ok?: string;
  error?: string;
}

/** A personal plan for `certId` from the given settings, skipping lessons already done. Keeps triage mode if it was chosen. */
async function freshPlan(userId: number, s: Pick<UserSettings, "examDate" | "dailyMinutes" | "background" | "tz" | "plan">, certId: string) {
  const progress = await getLessonProgress(userId);
  const done = [...progress.values()].filter((p) => p.status === "done").map((p) => p.lessonId);
  const prevMode = (s.plan as Partial<GeneratedPlan> | null)?.mode;
  return buildPlan({
    certId,
    examDate: s.examDate,
    dailyMinutes: s.dailyMinutes,
    background: s.background,
    tz: s.tz,
    choice: "personal",
    doneLessonIds: done,
    mode: prevMode === "triage" ? "triage" : "normal",
  });
}

async function rebuildForActiveCert(userId: number): Promise<boolean> {
  const settings = await getSettings(userId);
  const certId = settings.activeCert ?? settings.certIds[0];
  if (!certId || !getCert(certId)) return false;
  const plan = await freshPlan(userId, settings, certId);
  await updateSettings(userId, { plan, planStart: dayKey(Date.now(), settings.tz) });
  revalidatePath("/", "layout");
  return true;
}

/** Rebuild the plan from the current settings (Settings page, with a status message). */
export async function rebuildPlan(): Promise<FormResult> {
  const user = await requireUser();
  return (await rebuildForActiveCert(user.id)) ? { ok: "Plan rebuilt from your current exam, date and daily goal." } : { error: "Pick an exam first." };
}

/** One-click rebuild for the active cert (Today's plan-mismatch card). */
export async function rebuildPlanForActiveCert(): Promise<void> {
  const user = await requireUser();
  await rebuildForActiveCert(user.id);
}

export async function updateProfile(_: FormResult, form: FormData): Promise<FormResult> {
  const user = await requireUser();
  const settings = await getSettings(user.id);
  const name = String(form.get("name") ?? "").trim();
  const nameErr = validateName(name);
  if (nameErr) return { error: nameErr };

  const minutes = Math.round(Number(form.get("dailyMinutes")));
  if (!Number.isFinite(minutes) || minutes < 5 || minutes > 240) return { error: "Daily goal must be between 5 and 240 minutes." };

  const examRaw = String(form.get("examDate") ?? "").trim();
  if (examRaw && !/^\d{4}-\d{2}-\d{2}$/.test(examRaw)) return { error: "Enter the exam date as a full date." };

  const background = form.get("background") === "non-technical" ? "non-technical" : "technical";
  const activeCert = String(form.get("activeCert") ?? "");
  const certOk = settings.certIds.includes(activeCert) && !!getCert(activeCert);

  const next = {
    dailyMinutes: minutes,
    examDate: examRaw || null,
    background,
    activeCert: certOk ? activeCert : settings.activeCert,
  } as const;
  const newCert = next.activeCert ?? settings.certIds[0];
  // The plan is built from these four; when any changes, the old plan no longer matches.
  const planStale =
    next.activeCert !== settings.activeCert ||
    next.examDate !== settings.examDate ||
    next.dailyMinutes !== settings.dailyMinutes ||
    next.background !== settings.background ||
    (!!settings.plan && settings.plan.certId !== newCert);

  await updateName(user.id, name);
  let rebuilt = false;
  if (planStale && newCert && getCert(newCert)) {
    const plan = await freshPlan(user.id, { ...settings, ...next }, newCert);
    await updateSettings(user.id, { ...next, plan, planStart: dayKey(Date.now(), settings.tz) });
    rebuilt = true;
  } else {
    await updateSettings(user.id, next);
  }
  revalidatePath("/", "layout");
  return { ok: rebuilt ? "Saved. Your plan was rebuilt to match." : "Saved." };
}

export async function changePassword(_: FormResult, form: FormData): Promise<FormResult> {
  const user = await requireUser();
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  const full = await getUserWithHashByEmail(user.email);
  if (!full || !(await verifyPassword(current, full.passwordHash))) return { error: "Your current password isn’t right." };
  const err = validatePassword(next);
  if (err) return { error: err };
  if (next !== confirm) return { error: "The new passwords don’t match." };
  await setPassword(user.id, await hashPassword(next));
  // token_version was bumped, which signs out other devices; re-issue this device's session.
  const fresh = await getUserById(user.id);
  if (fresh) await createSession(fresh);
  return { ok: "Password changed. Other devices have been signed out." };
}
