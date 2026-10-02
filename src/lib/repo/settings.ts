import "server-only";
import { eq } from "drizzle-orm";
import { getDb, type Executor } from "../db";
import { userSettings } from "@/db/schema";
import type { StudyPlan } from "../content-types";

export interface UserSettings {
  userId: number;
  onboarded: boolean;
  certIds: string[];
  activeCert: string | null;
  examDate: string | null;
  dailyMinutes: number;
  background: "technical" | "non-technical";
  tz: string;
  plan: StudyPlan | null;
  planStart: string | null;
  leaderboardOptOut: boolean;
  freezes: number;
  pomodoroWork: number;
  pomodoroBreak: number;
}

type SettingsPatch = Partial<Omit<UserSettings, "userId">>;

export async function getSettings(userId: number, ex?: Executor): Promise<UserSettings> {
  const q = ex ?? (await getDb());
  let [r] = await q.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  if (!r) {
    await q.insert(userSettings).values({ userId }).onConflictDoNothing();
    [r] = await q.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  }
  return {
    userId: r.userId,
    onboarded: r.onboarded,
    certIds: Array.isArray(r.certIds) ? r.certIds : [],
    activeCert: r.activeCert,
    examDate: r.examDate,
    dailyMinutes: r.dailyMinutes,
    background: r.background,
    tz: r.tz,
    plan: r.plan ?? null,
    planStart: r.planStart,
    leaderboardOptOut: r.leaderboardOptOut,
    freezes: r.freezes,
    pomodoroWork: r.pomodoroWork,
    pomodoroBreak: r.pomodoroBreak,
  };
}

export async function updateSettings(userId: number, patch: SettingsPatch, ex?: Executor) {
  const values = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as SettingsPatch;
  if (Object.keys(values).length === 0) return;
  const q = ex ?? (await getDb());
  await q
    .insert(userSettings)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: userSettings.userId, set: values });
}
