"use server";

import { revalidatePath } from "next/cache";
import { createSession, requireUser } from "@/lib/auth";
import { hashPassword, validateName, validatePassword, verifyPassword } from "@/lib/auth-core";
import { getCert } from "@/lib/content";
import { getSettings, updateSettings } from "@/lib/repo/settings";
import { getUserById, getUserWithHashByEmail, setPassword, updateName } from "@/lib/repo/users";

export interface FormResult {
  ok?: string;
  error?: string;
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

  await updateName(user.id, name);
  await updateSettings(user.id, {
    dailyMinutes: minutes,
    examDate: examRaw || null,
    background,
    ...(certOk ? { activeCert } : {}),
  });
  revalidatePath("/", "layout");
  return { ok: "Saved." };
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
