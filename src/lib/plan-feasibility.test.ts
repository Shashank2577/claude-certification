import { describe, expect, it } from "vitest";
import { generatePlan, learnDaysFor, planFeasibility, requiredMinutesPerDay, type PlanInput } from "./plan";

// Mirrors the reported case: 15 ten-minute core lessons, three domains, plus deep dives.
const domains = [
  { id: "heavy", name: "Heavy", weight: 50 },
  { id: "mid", name: "Mid", weight: 30 },
  { id: "light", name: "Light", weight: 20 },
];
const lessons: PlanInput["lessons"] = [
  ...domains.flatMap((d) =>
    Array.from({ length: 5 }, (_, i) => ({ id: `${d.id}-${i}`, title: `${d.name} ${i}`, domainId: d.id, estMinutes: 10, level: "core" as const })),
  ),
  { id: "heavy-deep", title: "Deep", domainId: "heavy", estMinutes: 15, level: "deep" },
];
const base: PlanInput = { certId: "c", certName: "Cert", domains, lessons, daysUntilExam: 3, dailyMinutes: 20, background: "technical" };

const dayMinutes = (p: ReturnType<typeof generatePlan>, i: number) => p.days[i].blocks.reduce((s, b) => s + b.minutes, 0);
const lessonIds = (p: ReturnType<typeof generatePlan>) => p.days.flatMap((d) => d.blocks.filter((b) => b.kind === "lesson").map((b) => b.refId));

describe("feasibility helper", () => {
  it("computes the daily goal the core lessons need", () => {
    // 140 lesson minutes over 2 days = 70 a day; lessons get 70% of the goal, so 100.
    expect(requiredMinutesPerDay(140, 2)).toBe(100);
    expect(requiredMinutesPerDay(0, 5)).toBe(0);
    expect(requiredMinutesPerDay(10, 0)).toBe(15); // days clamp to 1: ceil(10 / 0.7)
  });
  it("reserves the mock and review days on plans of four days or more", () => {
    expect(learnDaysFor(3)).toBe(3);
    expect(learnDaysFor(7)).toBe(5);
  });
  it("flags a 3-day exam with a 20-minute goal as infeasible and suggests a crunch goal", () => {
    const f = planFeasibility(150, 3, 20);
    expect(f.required).toBe(72); // 50 min a day / 0.7
    expect(f.feasible).toBe(false);
    expect(f.crunchGoal).toBe(75);
  });
  it("is feasible when the goal covers the lessons, or there are none left", () => {
    expect(planFeasibility(150, null, 20).feasible).toBe(true); // 21-day default
    expect(planFeasibility(0, 1, 5)).toMatchObject({ required: 0, feasible: true });
    expect(planFeasibility(10_000, 1, 20).crunchGoal).toBe(240);
  });
});

describe("plan modes", () => {
  it("triage: a 3-day plan with a 20-minute goal keeps Day 1 at 40 minutes or less", () => {
    const p = generatePlan({ ...base, mode: "triage" });
    expect(p.days).toHaveLength(3);
    for (let i = 0; i < p.days.length; i++) expect(dayMinutes(p, i)).toBeLessThanOrEqual(40);
    expect(p.dropped).toBeGreaterThan(0);
    expect(p.description).toContain(`${p.dropped} lessons won’t fit`);
    const ids = lessonIds(p);
    expect(ids).not.toContain("heavy-deep");
    // Highest-weight domain first; the lightest domain is what gets dropped.
    expect(ids[0]).toBe("heavy-0");
    expect(ids.some((id) => id?.startsWith("light"))).toBe(false);
  });

  it("normal technical plans still fit every core lesson by packing days (the old behaviour)", () => {
    const p = generatePlan(base);
    expect(p.tight).toBe(true);
    expect(p.dropped).toBe(0);
    expect(lessonIds(p).filter((id) => id !== "heavy-deep")).toHaveLength(15);
  });

  it("non-technical learners always get the per-day cap", () => {
    const p = generatePlan({ ...base, background: "non-technical" });
    for (let i = 0; i < p.days.length; i++) expect(dayMinutes(p, i)).toBeLessThanOrEqual(40);
    expect(p.dropped).toBeGreaterThan(0);
  });

  it("crunch: raising the goal to the suggested crunch goal fits everything without dropping", () => {
    const f = planFeasibility(150, 3, 20);
    const p = generatePlan({ ...base, dailyMinutes: f.crunchGoal, mode: "crunch" });
    expect(p.tight).toBe(false);
    expect(p.dropped).toBe(0);
    expect(lessonIds(p).filter((id) => id !== "heavy-deep")).toHaveLength(15);
  });

  it("skips lessons already done", () => {
    const p = generatePlan({ ...base, daysUntilExam: 10, doneLessonIds: ["heavy-0", "mid-1"] });
    const ids = lessonIds(p);
    expect(ids).not.toContain("heavy-0");
    expect(ids).not.toContain("mid-1");
    expect(ids).toContain("heavy-1");
  });
});
