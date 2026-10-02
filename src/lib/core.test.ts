import { describe, expect, it } from "vitest";
import { allocateByWeight, domainMastery, isCorrect, rawFractionFor, readiness, scaledScore } from "./scoring";
import { NEW_CARD, previewIntervals, review } from "./sm2";
import { priority, selectAdaptive, type CandidateQuestion } from "./adaptive";
import { generatePlan, pickCuratedPlan, planDayIndex, planLength } from "./plan";
import { computeStreak, missedDaysToFreeze } from "./dates";
import { levelFor, newlyUnlocked, xpForLevel, type UserStats } from "./gamification";
import { hashPassword, isAdminEmail, signSession, validateEmail, validatePassword, verifyPassword, verifySession } from "./auth-core";

describe("scaled score", () => {
  it("maps 0% to 100 and 100% to 1000", () => {
    expect(scaledScore(0, 60)).toBe(100);
    expect(scaledScore(60, 60)).toBe(1000);
  });
  it("is monotonic and clamps", () => {
    expect(scaledScore(30, 60)).toBe(550);
    expect(scaledScore(70, 60)).toBe(1000);
    expect(scaledScore(-1, 60)).toBe(100);
    expect(scaledScore(5, 0)).toBe(100);
  });
  it("puts the 720 pass line near 69% raw", () => {
    expect(rawFractionFor(720)).toBeCloseTo(0.6889, 3);
    expect(scaledScore(42, 60)).toBeGreaterThanOrEqual(720);
    expect(scaledScore(41, 60)).toBeLessThan(720);
  });
});

describe("answer checking", () => {
  it("requires an exact set match for multi-select", () => {
    expect(isCorrect(["A", "C"], ["C", "A"])).toBe(true);
    expect(isCorrect(["A"], ["A", "C"])).toBe(false);
    expect(isCorrect(["A", "B", "C"], ["A", "C"])).toBe(false);
    expect(isCorrect([], ["A"])).toBe(false);
  });
});

describe("domain mastery and readiness", () => {
  it("starts at the chance prior and rises with correct answers", () => {
    expect(domainMastery([])).toBeCloseTo(0.25);
    const strong = domainMastery(Array.from({ length: 20 }, () => ({ correct: true, ageDays: 0 })));
    expect(strong).toBeGreaterThan(0.8);
  });
  it("weights recent answers more than old ones", () => {
    const recentRight = domainMastery([
      { correct: false, ageDays: 60 },
      { correct: true, ageDays: 0 },
    ]);
    const recentWrong = domainMastery([
      { correct: true, ageDays: 60 },
      { correct: false, ageDays: 0 },
    ]);
    expect(recentRight).toBeGreaterThan(recentWrong);
  });
  it("weights domains by exam weight and labels low data", () => {
    const r = readiness([
      { domainId: "a", weight: 90, mastery: 1, attempts: 40 },
      { domainId: "b", weight: 10, mastery: 0, attempts: 40 },
    ]);
    expect(r.predicted).toBe(910);
    expect(r.passProbabilityLabel).toBe("very likely");
    expect(readiness([{ domainId: "a", weight: 1, mastery: 1, attempts: 2 }]).passProbabilityLabel).toBe("not enough data");
  });
  it("allocates seats proportionally and respects availability", () => {
    const out = allocateByWeight(
      [
        { id: "a", weight: 27, available: 100 },
        { id: "b", weight: 18, available: 100 },
        { id: "c", weight: 55, available: 3 },
      ],
      60,
    );
    expect(out.a + out.b + out.c).toBe(60);
    expect(out.c).toBe(3);
    expect(out.a).toBeGreaterThan(out.b);
    expect(allocateByWeight([{ id: "a", weight: 1, available: 2 }], 10).a).toBe(2);
  });
});

describe("SM-2", () => {
  it("follows the 1 → 6 → interval × ease progression for Good", () => {
    const a = review(NEW_CARD, 3);
    expect(a.interval).toBe(1);
    const b = review(a, 3);
    expect(b.interval).toBe(6);
    const c = review(b, 3);
    expect(c.interval).toBe(Math.round(6 * c.ease));
    expect(c.reps).toBe(3);
  });
  it("resets on Again and never drops ease below 1.3", () => {
    let s = review(review(NEW_CARD, 3), 3);
    for (let i = 0; i < 10; i++) s = review(s, 1);
    expect(s.reps).toBe(0);
    expect(s.interval).toBe(1);
    expect(s.ease).toBe(1.3);
    expect(s.lapses).toBe(10);
  });
  it("orders preview intervals Again ≤ Hard ≤ Good ≤ Easy", () => {
    const s = review(review(review(NEW_CARD, 3), 3), 3);
    const p = previewIntervals(s);
    expect(p[1]).toBeLessThanOrEqual(p[2]);
    expect(p[2]).toBeLessThanOrEqual(p[3]);
    expect(p[3]).toBeLessThanOrEqual(p[4]);
  });
});

describe("adaptive selection", () => {
  const pool: CandidateQuestion[] = [
    { id: "seen-right", domainId: "strong", taskStatementId: "1.1", difficulty: 1 },
    { id: "seen-wrong", domainId: "strong", taskStatementId: "1.1", difficulty: 1 },
    { id: "unseen-weak", domainId: "weak", taskStatementId: "2.1", difficulty: 1 },
    { id: "unseen-strong", domainId: "strong", taskStatementId: "1.2", difficulty: 1 },
  ];
  const opts = {
    count: 2,
    mastery: { strong: 0.9, weak: 0.2 },
    history: {
      "seen-right": { attempts: 1, lastCorrect: true, lastAgeDays: 0, everWrong: false },
      "seen-wrong": { attempts: 1, lastCorrect: false, lastAgeDays: 0, everWrong: true },
    },
    random: () => 0,
  };
  it("ranks mistakes and weak unseen questions above recently-correct ones", () => {
    expect(priority(pool[1], opts)).toBeGreaterThan(priority(pool[0], opts));
    expect(priority(pool[2], opts)).toBeGreaterThan(priority(pool[3], opts));
    const picked = selectAdaptive(pool, opts).map((q) => q.id);
    expect(picked).toEqual(expect.arrayContaining(["seen-wrong", "unseen-weak"]));
    expect(picked).not.toContain("seen-right");
  });
  it("never returns more than the pool or duplicates", () => {
    const picked = selectAdaptive(pool, { ...opts, count: 10 });
    expect(picked).toHaveLength(4);
    expect(new Set(picked.map((q) => q.id)).size).toBe(4);
  });
});

describe("plan generation", () => {
  const base = {
    certId: "c",
    certName: "Cert",
    domains: [
      { id: "small", name: "Small", weight: 20 },
      { id: "big", name: "Big", weight: 80 },
    ],
    lessons: [
      { id: "s1", title: "S1", domainId: "small", estMinutes: 10, level: "core" as const },
      { id: "b1", title: "B1", domainId: "big", estMinutes: 10, level: "core" as const },
      { id: "b2", title: "B2", domainId: "big", estMinutes: 10, level: "core" as const },
      { id: "b3", title: "B3", domainId: "big", estMinutes: 10, level: "deep" as const },
    ],
    dailyMinutes: 30,
    background: "technical" as const,
  };
  const lessonIds = (p: ReturnType<typeof generatePlan>) => p.days.flatMap((d) => d.blocks.filter((b) => b.kind === "lesson").map((b) => b.refId));

  it("defaults to 21 days with no exam date and ends with a mock then review", () => {
    const p = generatePlan({ ...base, daysUntilExam: null });
    expect(p.days).toHaveLength(21);
    expect(p.days[19].blocks[0].kind).toBe("mock");
    expect(p.days[20].blocks.some((b) => b.kind === "review")).toBe(true);
  });
  it("teaches heavier domains first and includes every core lesson once", () => {
    const p = generatePlan({ ...base, daysUntilExam: 10 });
    const ids = lessonIds(p);
    expect(ids.indexOf("b1")).toBeLessThan(ids.indexOf("s1"));
    expect(ids.filter((x) => x === "s1")).toHaveLength(1);
    expect(ids).toEqual(expect.arrayContaining(["s1", "b1", "b2"]));
  });
  it("drops deep dives for non-technical learners", () => {
    expect(lessonIds(generatePlan({ ...base, daysUntilExam: 10, background: "non-technical" }))).not.toContain("b3");
    expect(lessonIds(generatePlan({ ...base, daysUntilExam: 10 }))).toContain("b3");
  });
  it("marks tight plans and still fits all lessons when time is short", () => {
    const p = generatePlan({ ...base, daysUntilExam: 1, dailyMinutes: 5 });
    expect(p.days).toHaveLength(1);
    expect(p.tight).toBe(true);
    expect(lessonIds(p)).toEqual(expect.arrayContaining(["s1", "b1", "b2"]));
  });
  it("picks a curated plan only when it fits", () => {
    const curated = [{ id: "7", title: "7", certId: "c", description: "", days: Array.from({ length: 7 }, (_, i) => ({ day: i + 1, title: "", blocks: [] })) }];
    expect(pickCuratedPlan(curated, "c", 8)?.id).toBe("7");
    expect(pickCuratedPlan(curated, "c", 5)).toBeUndefined();
    expect(pickCuratedPlan(curated, "c", 60)).toBeUndefined();
    expect(planLength(500)).toBe(120);
  });
  it("tracks the current plan day", () => {
    expect(planDayIndex("2026-01-01", "2026-01-01", 10)).toBe(1);
    expect(planDayIndex("2026-01-01", "2026-01-05", 10)).toBe(5);
    expect(planDayIndex("2026-01-01", "2026-03-01", 10)).toBe(10);
  });
});

describe("streaks", () => {
  it("counts consecutive days ending today or yesterday", () => {
    expect(computeStreak(["2026-01-03", "2026-01-04", "2026-01-05"], [], "2026-01-05").current).toBe(3);
    const y = computeStreak(["2026-01-03", "2026-01-04"], [], "2026-01-05");
    expect(y.current).toBe(2);
    expect(y.activeToday).toBe(false);
    expect(computeStreak(["2026-01-01"], [], "2026-01-05").current).toBe(0);
  });
  it("bridges gaps with freezes", () => {
    expect(computeStreak(["2026-01-01", "2026-01-03"], ["2026-01-02"], "2026-01-03").current).toBe(3);
    expect(missedDaysToFreeze("2026-01-01", "2026-01-03", 1, new Set())).toEqual(["2026-01-02"]);
    expect(missedDaysToFreeze("2026-01-01", "2026-01-05", 1, new Set())).toEqual([]);
    expect(missedDaysToFreeze("2026-01-04", "2026-01-05", 1, new Set())).toEqual([]);
  });
});

describe("levels and achievements", () => {
  it("levels up at the thresholds", () => {
    expect(levelFor(0).level).toBe(1);
    expect(levelFor(xpForLevel(2)).level).toBe(2);
    expect(levelFor(xpForLevel(2) - 1).level).toBe(1);
    const l = levelFor(xpForLevel(3) + 10);
    expect(l.progress).toBeGreaterThan(0);
    expect(l.progress).toBeLessThan(1);
  });
  it("unlocks only new achievements", () => {
    const stats: UserStats = {
      lessonsCompleted: 1,
      questionsAnswered: 100,
      correctAnswers: 70,
      perfectQuizzes: 0,
      mockAttempts: 0,
      mocksPassed: 0,
      bestMockScore: 0,
      currentStreak: 3,
      flashcardReviews: 0,
      focusSessions: 0,
      resourcesDone: 0,
      domainsCompleted: 0,
      hour: 2,
      gapDays: 0,
      dailyGoalsHit: 0,
    };
    const ids = newlyUnlocked(stats, new Set(["first-lesson"])).map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(["hundred-questions", "streak-3", "night-owl", "first-answer"]));
    expect(ids).not.toContain("first-lesson");
    expect(ids).not.toContain("streak-7");
  });
});

describe("auth helpers", () => {
  it("hashes and verifies passwords", async () => {
    const h = await hashPassword("correct horse 1");
    expect(h).not.toContain("correct horse");
    expect(await verifyPassword("correct horse 1", h)).toBe(true);
    expect(await verifyPassword("wrong horse 1", h)).toBe(false);
  });
  it("signs and verifies sessions, rejecting tampering and wrong secrets", async () => {
    const secret = "x".repeat(40);
    const t = await signSession({ uid: 7, tv: 2 }, secret);
    expect(await verifySession(t, secret)).toEqual({ uid: 7, tv: 2 });
    expect(await verifySession(t, "y".repeat(40))).toBeNull();
    expect(await verifySession(`${t}x`, secret)).toBeNull();
    const expired = await signSession({ uid: 7, tv: 0 }, secret, -10);
    expect(await verifySession(expired, secret)).toBeNull();
  });
  it("validates input and admin emails", () => {
    expect(validateEmail("a@b.co")).toBeNull();
    expect(validateEmail("nope")).not.toBeNull();
    expect(validatePassword("short1")).not.toBeNull();
    expect(validatePassword("longenough")).not.toBeNull();
    expect(validatePassword("longenough1")).toBeNull();
    expect(isAdminEmail("Boss@Example.com", "ops@x.io, boss@example.com")).toBe(true);
    expect(isAdminEmail("a@b.co", undefined)).toBe(false);
  });
});
