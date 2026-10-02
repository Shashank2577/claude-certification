// Integration tests against an in-memory PGlite with the real migrations applied.
import { beforeAll, describe, expect, it } from "vitest";
import { getDb } from "./db";
import { createUser, getUserById, setPassword } from "./repo/users";
import { getSettings, updateSettings } from "./repo/settings";
import { hitRateLimit, resetRateLimit, type RateLimitRule } from "./repo/rate-limit";
import { recordActivity, streakFor, totalXp } from "./repo/activity";
import { markLessonDone } from "./repo/progress";
import { recordAttempt, domainStats } from "./repo/attempts";
import { createMockAttempt, getMockAttempt, markMockSubmitted } from "./repo/mock";

beforeAll(async () => {
  await getDb();
});

const user = (email: string) => createUser({ email, name: "Test", passwordHash: "x", role: "user", firstUserIsAdmin: true });

describe("users", () => {
  it("makes only the first account an admin and lower-cases emails", async () => {
    const a = await user("First@Example.com");
    const b = await user("second@example.com");
    expect(a.role).toBe("admin");
    expect(a.email).toBe("first@example.com");
    expect(b.role).toBe("user");
    await expect(user("second@example.com")).rejects.toThrow();
  });

  it("bumps the token version on password change", async () => {
    const u = await user("pw@example.com");
    await setPassword(u.id, "y");
    expect((await getUserById(u.id))?.tokenVersion).toBe(u.tokenVersion + 1);
  });
});

describe("settings", () => {
  it("round-trips JSON and booleans", async () => {
    const u = await user("settings@example.com");
    await updateSettings(u.id, { certIds: ["foundations"], onboarded: true, leaderboardOptOut: true, dailyMinutes: 30 });
    const s = await getSettings(u.id);
    expect(s.certIds).toEqual(["foundations"]);
    expect(s.onboarded).toBe(true);
    expect(s.leaderboardOptOut).toBe(true);
    expect(s.dailyMinutes).toBe(30);
  });
});

describe("rate limit (database-backed)", () => {
  const rule: RateLimitRule = { scope: "test", limit: 3, windowMs: 60_000 };
  it("blocks after the limit, resets after the window and on demand", async () => {
    const t = 1_000_000;
    expect(await hitRateLimit(rule, "ip-1", t)).toBe(0);
    expect(await hitRateLimit(rule, "ip-1", t + 1)).toBe(0);
    expect(await hitRateLimit(rule, "ip-1", t + 2)).toBe(0);
    expect(await hitRateLimit(rule, "ip-1", t + 3)).toBe(60);
    expect(await hitRateLimit(rule, "ip-2", t + 3)).toBe(0); // separate key
    expect(await hitRateLimit(rule, "ip-1", t + 60_001)).toBe(0); // new window
    await hitRateLimit(rule, "ip-3", t);
    await hitRateLimit(rule, "ip-3", t);
    await hitRateLimit(rule, "ip-3", t);
    await resetRateLimit(rule, "ip-3");
    expect(await hitRateLimit(rule, "ip-3", t)).toBe(0);
  });

  it("counts concurrent hits exactly", async () => {
    const r: RateLimitRule = { scope: "burst", limit: 5, windowMs: 60_000 };
    const results = await Promise.all(Array.from({ length: 12 }, () => hitRateLimit(r, "same", 2_000_000)));
    expect(results.filter((w) => w === 0)).toHaveLength(5);
  });
});

describe("rewards transaction", () => {
  it("awards XP, the first-lesson badge once, the daily goal and a streak", async () => {
    const u = await user("learner@example.com");
    await updateSettings(u.id, { dailyMinutes: 10, tz: "UTC" });
    const lesson = { id: "agentic-loop-basics", certId: "foundations", domainId: "d1-agentic" };
    expect(await markLessonDone(u.id, lesson)).toBe(true);
    expect(await markLessonDone(u.id, lesson)).toBe(false);

    const now = Date.UTC(2026, 0, 10, 12);
    const r = await recordActivity(u.id, { kind: "lesson", refId: lesson.id, xp: 50, minutes: 12 }, now);
    expect(r.achievements.map((a) => a.id)).toContain("first-lesson");
    expect(r.goalHit).toBe(true);
    expect(r.streak).toBe(1);
    expect(r.xp).toBe(50 + 30 + 20); // lesson + daily goal + bronze badge
    expect(await totalXp(u.id)).toBe(r.xp);

    const again = await recordActivity(u.id, { kind: "lesson", refId: "x", xp: 0, minutes: 5 }, now + 1000);
    expect(again.achievements).toHaveLength(0);
    expect(again.goalHit).toBe(false);
  });

  it("uses a streak freeze to bridge one missed day", async () => {
    const u = await user("streak@example.com");
    await updateSettings(u.id, { tz: "UTC", dailyMinutes: 999 });
    const day = (d: number) => Date.UTC(2026, 1, d, 12);
    await recordActivity(u.id, { kind: "answer", xp: 3 }, day(1));
    await recordActivity(u.id, { kind: "answer", xp: 3 }, day(3)); // missed the 2nd
    expect((await streakFor(u.id, "UTC", day(3))).current).toBe(3);
    expect((await getSettings(u.id)).freezes).toBe(0);
  });

  it("doesn't count onboarding (or its bonus XP) toward the streak", async () => {
    const u = await user("fresh@example.com");
    await updateSettings(u.id, { tz: "UTC", dailyMinutes: 10 });
    const now = Date.UTC(2026, 3, 1, 12);
    const r = await recordActivity(u.id, { kind: "onboarding", xp: 20 }, now);
    expect(r.streak).toBe(0);
    expect(await totalXp(u.id)).toBeGreaterThanOrEqual(20); // the welcome bonus stays
    const s = await streakFor(u.id, "UTC", now);
    expect(s.current).toBe(0);
    expect(s.activeToday).toBe(false);
    // The next day still shows no streak, and the onboarding day isn't bridged with a freeze.
    expect((await streakFor(u.id, "UTC", now + 86_400_000)).current).toBe(0);
    // The first real study action starts it at 1.
    const first = await recordActivity(u.id, { kind: "answer", xp: 3, minutes: 1 }, now + 86_400_000);
    expect(first.streak).toBe(1);
  });

  it("serialises concurrent rewards so totals stay exact and the goal fires once", async () => {
    const u = await user("race@example.com");
    const now = Date.UTC(2026, 2, 1, 12);
    await updateSettings(u.id, { tz: "UTC", dailyMinutes: 5 });
    const rs = await Promise.all(Array.from({ length: 4 }, () => recordActivity(u.id, { kind: "answer", xp: 3, minutes: 3 }, now)));
    expect(rs.filter((r) => r.goalHit)).toHaveLength(1);
    expect(await totalXp(u.id)).toBe(rs.reduce((s, r) => s + r.xp, 0));
  });
});

describe("attempts and mocks", () => {
  it("stores attempts and computes mastery", async () => {
    const u = await user("attempts@example.com");
    for (let i = 0; i < 6; i++) {
      await recordAttempt({ userId: u.id, questionId: `q${i}`, certId: "foundations", domainId: "d1-agentic", taskId: "1.1", selected: ["A"], correct: true, ms: 1000, mode: "practice" });
    }
    const [d1, d2] = await domainStats(u.id, "foundations", ["d1-agentic", "d2-tools"]);
    expect(d1.attempts).toBe(6);
    expect(d1.mastery).toBeGreaterThan(0.6);
    expect(d2.attempts).toBe(0);
  });

  it("submits a mock exactly once", async () => {
    const u = await user("mock@example.com");
    const a = await createMockAttempt(u.id, "foundations", ["q1", "q2"], 60_000);
    expect((await getMockAttempt(u.id, a.id))?.state.questionIds).toEqual(["q1", "q2"]);
    const result = { state: a.state, score: 550, correct: 1, total: 2, passed: false, breakdown: [] };
    expect(await markMockSubmitted(u.id, a.id, result)).toBe(true);
    expect(await markMockSubmitted(u.id, a.id, result)).toBe(false);
    expect(await getMockAttempt(u.id + 999, a.id)).toBeNull(); // owner-only
  });
});
