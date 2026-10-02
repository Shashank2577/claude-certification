import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS, achievementProgress, type UserStats } from "./gamification";

const zero: UserStats = {
  lessonsCompleted: 0,
  questionsAnswered: 0,
  correctAnswers: 0,
  perfectQuizzes: 0,
  mockAttempts: 0,
  mocksPassed: 0,
  bestMockScore: 0,
  currentStreak: 0,
  flashcardReviews: 0,
  focusSessions: 0,
  resourcesDone: 0,
  domainsCompleted: 0,
  hour: 12,
  gapDays: 0,
  dailyGoalsHit: 0,
};

describe("achievementProgress", () => {
  it("covers count-based badges and skips time-of-day and comeback ones", () => {
    const ids = achievementProgress(zero).map((p) => p.id);
    expect(ids).toContain("hundred-questions");
    expect(ids).not.toContain("night-owl");
    expect(ids).not.toContain("early-bird");
    expect(ids).not.toContain("comeback");
  });

  it("reports current progress, capped at the target", () => {
    const p = achievementProgress({ ...zero, questionsAnswered: 140 });
    expect(p.find((x) => x.id === "hundred-questions")).toEqual({ id: "hundred-questions", current: 100, target: 100 });
    expect(p.find((x) => x.id === "five-hundred-questions")).toEqual({ id: "five-hundred-questions", current: 140, target: 500 });
  });

  it("agrees with each achievement's own unlock test at the threshold", () => {
    for (const p of achievementProgress(zero)) {
      const def = ACHIEVEMENTS.find((a) => a.id === p.id)!;
      const key = Object.keys(zero).find((k) => {
        const probe = { ...zero, [k]: p.target };
        return def.test(probe);
      }) as keyof UserStats;
      expect(key, p.id).toBeDefined();
      expect(def.test({ ...zero, [key]: p.target }), p.id).toBe(true);
      expect(def.test({ ...zero, [key]: p.target - 1 }), p.id).toBe(false);
      expect(achievementProgress({ ...zero, [key]: p.target }).find((x) => x.id === p.id)?.current, p.id).toBe(p.target);
    }
  });
});
