import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, num, one, rows, tx, type Executor } from "../db";
import { achievements, activityLog, dailyGoals, streakFreezes, users } from "@/db/schema";
import { computeStreak, daysBetween, dayKey, localHour, missedDaysToFreeze, type StreakResult } from "../dates";
import { achievementById, levelFor, newlyUnlocked, XP, type Reward, type UserStats } from "../gamification";
import { getCert, getCertLessons } from "../content";
import { getSettings, updateSettings } from "./settings";

export type ActivityKind =
  | "lesson"
  | "answer"
  | "quiz"
  | "flashcard"
  | "mock"
  | "focus"
  | "resource"
  | "daily-goal"
  | "onboarding"
  | "achievement";

export interface ActivityInput {
  kind: ActivityKind;
  refId?: string | null;
  xp: number;
  minutes?: number;
  meta?: Record<string, unknown>;
}

export interface ActivityRow {
  id: number;
  kind: ActivityKind;
  refId: string | null;
  xp: number;
  minutes: number;
  meta: Record<string, unknown>;
  day: string;
  createdAt: number;
}

const MAX_FREEZES = 2;

/**
 * Activity that isn't studying: the onboarding welcome bonus, badges and the daily-goal bonus
 * (which only ever follows real study). None of these may start or extend a streak.
 */
export const NON_STUDY_KINDS: readonly ActivityKind[] = ["achievement", "onboarding", "daily-goal"];
/** SQL predicate matching only real study activity in activity_log. */
export const STUDY_KIND = sql.raw(`kind NOT IN (${NON_STUDY_KINDS.map((k) => `'${k}'`).join(", ")})`);

export async function totalXp(userId: number, ex?: Executor): Promise<number> {
  return num(sql`SELECT COALESCE(SUM(xp), 0)::int n FROM activity_log WHERE user_id = ${userId}`, ex);
}

export async function activeDays(userId: number, ex?: Executor): Promise<string[]> {
  const rs = await rows<{ day: string }>(sql`SELECT DISTINCT day FROM activity_log WHERE user_id = ${userId} AND ${STUDY_KIND}`, ex);
  return rs.map((r) => r.day);
}

export async function frozenDays(userId: number, ex?: Executor): Promise<string[]> {
  const rs = await rows<{ day: string }>(sql`SELECT day FROM streak_freezes WHERE user_id = ${userId}`, ex);
  return rs.map((r) => r.day);
}

export async function streakFor(userId: number, tz: string, now = Date.now(), ex?: Executor): Promise<StreakResult> {
  const [a, f] = await Promise.all([activeDays(userId, ex), frozenDays(userId, ex)]);
  return computeStreak(a, f, dayKey(now, tz));
}

export async function minutesOnDay(userId: number, day: string, ex?: Executor): Promise<number> {
  const r = await one<{ n: number | null }>(sql`SELECT COALESCE(SUM(minutes), 0)::float8 n FROM activity_log WHERE user_id = ${userId} AND day = ${day}`, ex);
  return Number(r?.n ?? 0);
}

export async function xpOnDay(userId: number, day: string): Promise<number> {
  return num(sql`SELECT COALESCE(SUM(xp), 0)::int n FROM activity_log WHERE user_id = ${userId} AND day = ${day}`);
}

export async function recentActivity(userId: number, limit = 12): Promise<ActivityRow[]> {
  const db = await getDb();
  const rs = await db
    .select()
    .from(activityLog)
    .where(eq(activityLog.userId, userId))
    .orderBy(desc(activityLog.createdAt), desc(activityLog.id))
    .limit(limit);
  return rs.map((r) => ({
    id: r.id,
    kind: r.kind as ActivityKind,
    refId: r.refId,
    xp: r.xp,
    minutes: r.minutes,
    meta: r.meta ?? {},
    day: r.day,
    createdAt: r.createdAt,
  }));
}

/** Minutes and XP per day for the last `days` days (oldest first). */
export async function dailySeries(userId: number, tz: string, days: number, now = Date.now()): Promise<{ day: string; minutes: number; xp: number }[]> {
  const today = dayKey(now, tz);
  const rs = await rows<{ day: string; minutes: number; xp: number }>(
    sql`SELECT day, SUM(minutes)::float8 minutes, SUM(xp)::int xp FROM activity_log WHERE user_id = ${userId} GROUP BY day`,
  );
  const map = new Map(rs.map((r) => [r.day, r]));
  const out: { day: string; minutes: number; xp: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.parse(`${today}T00:00:00Z`) - i * 86_400_000).toISOString().slice(0, 10);
    out.push({ day: d, minutes: Number(map.get(d)?.minutes ?? 0), xp: Number(map.get(d)?.xp ?? 0) });
  }
  return out;
}

export async function userStats(userId: number, hour: number, gapDays: number, streak: number, ex?: Executor): Promise<UserStats> {
  const settings = await getSettings(userId, ex);
  const doneRows = await rows<{ lesson_id: string }>(sql`SELECT lesson_id FROM lesson_progress WHERE user_id = ${userId} AND status = 'done'`, ex);
  const done = new Set(doneRows.map((r) => r.lesson_id));
  let domainsCompleted = 0;
  for (const certId of settings.certIds) {
    const cert = getCert(certId);
    if (!cert) continue;
    const lessons = getCertLessons(certId).filter((l) => l.level !== "deep");
    for (const d of cert.domains) {
      const dl = lessons.filter((l) => l.domainId === d.id);
      if (dl.length > 0 && dl.every((l) => done.has(l.id))) domainsCompleted++;
    }
  }
  const s = await one<{
    answered: number;
    correct: number;
    perfect: number;
    mocks: number;
    passed: number;
    best: number | null;
    cards: number;
    focus: number;
    resources: number;
    goals: number;
  }>(
    sql`SELECT
      (SELECT COUNT(*)::int FROM question_attempts WHERE user_id = ${userId}) answered,
      (SELECT COUNT(*)::int FROM question_attempts WHERE user_id = ${userId} AND correct) correct,
      (SELECT COUNT(*)::int FROM activity_log WHERE user_id = ${userId} AND kind = 'quiz' AND (meta->>'perfect')::int = 1) perfect,
      (SELECT COUNT(*)::int FROM mock_attempts WHERE user_id = ${userId} AND status = 'submitted') mocks,
      (SELECT COUNT(*)::int FROM mock_attempts WHERE user_id = ${userId} AND status = 'submitted' AND passed) passed,
      (SELECT MAX(score)::int FROM mock_attempts WHERE user_id = ${userId} AND status = 'submitted') best,
      (SELECT COUNT(*)::int FROM activity_log WHERE user_id = ${userId} AND kind = 'flashcard') cards,
      (SELECT COUNT(*)::int FROM activity_log WHERE user_id = ${userId} AND kind = 'focus') focus,
      (SELECT COUNT(*)::int FROM resource_progress WHERE user_id = ${userId}) resources,
      (SELECT COUNT(*)::int FROM daily_goals WHERE user_id = ${userId}) goals`,
    ex,
  );
  return {
    lessonsCompleted: done.size,
    questionsAnswered: s?.answered ?? 0,
    correctAnswers: s?.correct ?? 0,
    perfectQuizzes: s?.perfect ?? 0,
    mockAttempts: s?.mocks ?? 0,
    mocksPassed: s?.passed ?? 0,
    bestMockScore: s?.best ?? 0,
    currentStreak: streak,
    flashcardReviews: s?.cards ?? 0,
    focusSessions: s?.focus ?? 0,
    resourcesDone: s?.resources ?? 0,
    domainsCompleted,
    hour,
    gapDays,
    dailyGoalsHit: s?.goals ?? 0,
  };
}

export async function ownedAchievements(userId: number, ex?: Executor): Promise<{ id: string; unlockedAt: number }[]> {
  const q = ex ?? (await getDb());
  const rs = await q
    .select({ id: achievements.achievementId, unlockedAt: achievements.unlockedAt })
    .from(achievements)
    .where(eq(achievements.userId, userId))
    .orderBy(desc(achievements.unlockedAt));
  return rs;
}

/**
 * The single entry point for anything that earns XP. Handles streak freezes,
 * the daily goal, level-ups and achievements, and returns what to celebrate.
 */
export async function recordActivity(userId: number, input: ActivityInput, now = Date.now()): Promise<Reward> {
  return tx(async (q) => {
    // Serialise concurrent rewards for the same user (e.g. two tabs) so goals and badges fire once.
    await q.execute(sql`SELECT pg_advisory_xact_lock(${userId})`);
    const settings = await getSettings(userId, q);
    const tz = settings.tz;
    const today = dayKey(now, tz);
    const hour = localHour(now, tz);
    const xpBefore = await totalXp(userId, q);

    const activeToday = (await num(sql`SELECT COUNT(*)::int n FROM activity_log WHERE user_id = ${userId} AND day = ${today} AND ${STUDY_KIND}`, q)) > 0;
    const last = await one<{ d: string | null }>(sql`SELECT MAX(day) d FROM activity_log WHERE user_id = ${userId} AND day < ${today} AND ${STUDY_KIND}`, q);
    const lastActive = last?.d ?? null;
    const gapDays = !activeToday && lastActive ? daysBetween(lastActive, today) : 0;

    // Bridge short gaps with freezes on the first action of the day.
    let freezes = settings.freezes;
    if (!activeToday && lastActive) {
      const frozen = new Set(await frozenDays(userId, q));
      const toFreeze = missedDaysToFreeze(lastActive, today, freezes, frozen);
      if (toFreeze.length) await q.insert(streakFreezes).values(toFreeze.map((day) => ({ userId, day }))).onConflictDoNothing();
      freezes -= toFreeze.length;
    }

    await q.insert(activityLog).values({
      userId,
      kind: input.kind,
      refId: input.refId ?? null,
      xp: Math.round(input.xp),
      minutes: input.minutes ?? 0,
      meta: input.meta ?? null,
      day: today,
      createdAt: now,
    });
    let xpGained = Math.round(input.xp);

    let goalHit = false;
    const hasGoal = (await num(sql`SELECT COUNT(*)::int n FROM daily_goals WHERE user_id = ${userId} AND day = ${today}`, q)) > 0;
    if (!hasGoal && (await minutesOnDay(userId, today, q)) >= settings.dailyMinutes) {
      await q.insert(dailyGoals).values({ userId, day: today }).onConflictDoNothing();
      await q.insert(activityLog).values({ userId, kind: "daily-goal", xp: XP.dailyGoal, minutes: 0, day: today, createdAt: now });
      xpGained += XP.dailyGoal;
      goalHit = true;
    }

    const streak = (await streakFor(userId, tz, now, q)).current;
    // Earn a freeze every 7 days of streak (max 2), once per day.
    if (!activeToday && streak > 0 && streak % 7 === 0) freezes = Math.min(MAX_FREEZES, freezes + 1);
    if (freezes !== settings.freezes) await updateSettings(userId, { freezes }, q);

    const owned = new Set((await ownedAchievements(userId, q)).map((a) => a.id));
    const unlocked = newlyUnlocked(await userStats(userId, hour, gapDays, streak, q), owned);
    for (const a of unlocked) {
      await q.insert(achievements).values({ userId, achievementId: a.id, unlockedAt: now }).onConflictDoNothing();
      const bonus = a.tier === "gold" ? 100 : a.tier === "silver" ? 50 : 20;
      await q.insert(activityLog).values({ userId, kind: "achievement", refId: a.id, xp: bonus, minutes: 0, day: today, createdAt: now });
      xpGained += bonus;
    }

    await q.update(users).set({ lastActiveAt: now }).where(eq(users.id, userId));

    const xpAfter = xpBefore + xpGained;
    const before = levelFor(xpBefore);
    const after = levelFor(xpAfter);
    return {
      xp: xpGained,
      totalXp: xpAfter,
      levelUp: after.level > before.level ? { level: after.level, name: after.name } : null,
      achievements: unlocked.map((a) => ({ id: a.id, title: a.title, description: a.description, icon: a.icon, tier: a.tier })),
      goalHit,
      streak,
    };
  });
}

export function describeAchievement(id: string) {
  return achievementById(id);
}

/** Most recent activity timestamp of a kind, for rate limiting client-reported events. */
export async function lastActivityAt(userId: number, kind: ActivityKind): Promise<number | null> {
  const db = await getDb();
  const [r] = await db
    .select({ t: activityLog.createdAt })
    .from(activityLog)
    .where(and(eq(activityLog.userId, userId), eq(activityLog.kind, kind)))
    .orderBy(desc(activityLog.createdAt))
    .limit(1);
  return r?.t ?? null;
}
