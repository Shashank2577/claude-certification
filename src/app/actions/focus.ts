"use server";

import { requireUser } from "@/lib/auth";
import { XP, type Reward } from "@/lib/gamification";
import { lastActivityAt, recordActivity } from "@/lib/repo/activity";
import { updateSettings } from "@/lib/repo/settings";

/**
 * Award a finished focus block. Minutes are not added to the daily goal because
 * the lessons and questions done during the block already count their own time.
 */
export async function completeFocus(minutes: number, kind: "pomodoro" | "sprint"): Promise<Reward | null> {
  const user = await requireUser();
  const m = Math.round(Number(minutes));
  if (!Number.isFinite(m) || m < 1 || m > 120) return null;
  // Reject completions faster than the block could have run (e.g. replayed requests).
  const last = await lastActivityAt(user.id, "focus");
  if (last && Date.now() - last < (m - 0.5) * 60_000) return null;
  const xp = kind === "sprint" ? 10 : m >= 20 ? XP.focusSession : Math.max(5, Math.round((XP.focusSession * m) / 25));
  return await recordActivity(user.id, { kind: "focus", refId: kind, xp, minutes: 0, meta: { minutes: m } });
}

export async function saveFocusDurations(work: number, rest: number) {
  const user = await requireUser();
  const w = Math.max(5, Math.min(90, Math.round(work)));
  const r = Math.max(1, Math.min(30, Math.round(rest)));
  await updateSettings(user.id, { pomodoroWork: w, pomodoroBreak: r });
}
