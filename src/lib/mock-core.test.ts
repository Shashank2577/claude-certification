import { describe, expect, it } from "vitest";
import { matchScenario, sampleMockQuestions, sampleScenarioMock, sanitizeMockState, scoreMock } from "./mock-core";

const qs = [
  ...Array.from({ length: 10 }, (_, i) => ({ id: `a${i}`, domainId: "a" })),
  ...Array.from({ length: 10 }, (_, i) => ({ id: `b${i}`, domainId: "b" })),
];
const domains = [
  { id: "a", name: "A", weight: 70 },
  { id: "b", name: "B", weight: 30 },
];

describe("sampleMockQuestions", () => {
  it("samples proportionally to domain weight", () => {
    const ids = sampleMockQuestions(qs, domains, 10, () => 0.42);
    expect(ids).toHaveLength(10);
    expect(new Set(ids).size).toBe(10);
    expect(ids.filter((id) => id.startsWith("a"))).toHaveLength(7);
  });

  it("uses the whole bank when it is smaller than the exam", () => {
    expect(sampleMockQuestions(qs, domains, 60)).toHaveLength(20);
  });
});

describe("scoreMock", () => {
  const map = new Map([
    ["a0", { correct: ["A"], domainId: "a" }],
    ["a1", { correct: ["B", "C"], domainId: "a" }],
    ["b0", { correct: ["D"], domainId: "b" }],
  ]);
  const base = { questionIds: ["a0", "a1", "b0"], answers: {}, flags: [], timeMs: {}, currentIndex: 0 };

  it("requires exact matches for multi-select and scales the score", () => {
    const r = scoreMock({ ...base, answers: { a0: ["A"], a1: ["B"], b0: ["D"] } }, map, domains, 720);
    expect(r.correct).toBe(2);
    expect(r.score).toBe(700);
    expect(r.passed).toBe(false);
    expect(r.breakdown).toEqual([
      { domainId: "a", name: "A", weight: 70, total: 2, correct: 1 },
      { domainId: "b", name: "B", weight: 30, total: 1, correct: 1 },
    ]);
  });

  it("passes at or above the pass mark", () => {
    const r = scoreMock({ ...base, answers: { a0: ["A"], a1: ["C", "B"], b0: ["D"] } }, map, domains, 720);
    expect(r.score).toBe(1000);
    expect(r.passed).toBe(true);
  });
});

describe("sanitizeMockState", () => {
  it("drops unknown questions, options and flags", () => {
    const opts = new Map([["a0", new Set(["A", "B"])]]);
    const base = { questionIds: ["a0"], answers: {}, flags: [], timeMs: {}, currentIndex: 0 };
    const s = sanitizeMockState({ answers: { a0: ["A", "Z", "A"], x: ["A"] }, flags: ["a0", "x"], currentIndex: 9, timeMs: { a0: -5 } }, base, opts);
    expect(s.answers).toEqual({ a0: ["A"] });
    expect(s.flags).toEqual(["a0"]);
    expect(s.currentIndex).toBe(0);
    expect(s.timeMs.a0).toBe(0);
  });
});

describe("scenario mocks", () => {
  const scenarios = [
    { id: "s1", title: "Customer Support Resolution Agent", description: "Returns, billing disputes and account issues." },
    { id: "s2", title: "Code Generation with Claude Code", description: "Code generation, refactoring, debugging and documentation." },
    { id: "s5", title: "Claude Code for Continuous Integration", description: "CI/CD pipeline that reviews pull requests and generates tests." },
  ];

  it("matches free-text scenarios to scenario ids", () => {
    expect(matchScenario("Scenario: Customer Support Resolution Agent. You are...", scenarios)).toBe("s1");
    expect(matchScenario("Your team uses Claude Code for code generation and refactoring.", scenarios)).toBe("s2");
    expect(matchScenario("You are integrating Claude Code into a CI/CD pipeline that reviews pull requests.", scenarios)).toBe("s5");
    expect(matchScenario("Something about the weather.", scenarios)).toBeNull();
    expect(matchScenario(undefined, scenarios)).toBeNull();
  });

  const bank = [
    ...["a", "b", "c", "d", "e"].flatMap((s) => Array.from({ length: 6 }, (_, i) => ({ id: `${s}${i}`, domainId: "x", scenarioId: s }))),
    ...Array.from({ length: 10 }, (_, i) => ({ id: `n${i}`, domainId: "y", scenarioId: null })),
  ];

  it("draws from exactly four scenarios, grouped together", () => {
    const ids = sampleScenarioMock(bank, [{ id: "x", weight: 1 }, { id: "y", weight: 1 }], 20, () => 0.3)!;
    expect(ids).toHaveLength(20);
    expect(new Set(ids).size).toBe(20);
    const groups = ids.map((id) => id[0]);
    expect(new Set(groups).size).toBe(4);
    // Grouped: each scenario's questions are contiguous.
    const runs = groups.filter((g, i) => i === 0 || groups[i - 1] !== g);
    expect(runs).toHaveLength(4);
  });

  it("tops up from other questions when the chosen scenarios run short", () => {
    const ids = sampleScenarioMock(bank, [{ id: "x", weight: 1 }, { id: "y", weight: 1 }], 30, () => 0.3)!;
    expect(ids).toHaveLength(30);
    expect(new Set(ids).size).toBe(30);
  });

  it("returns null when fewer than four scenarios have questions", () => {
    expect(sampleScenarioMock(bank.filter((q) => q.scenarioId !== "a" && q.scenarioId !== "b"), [{ id: "x", weight: 1 }], 10)).toBeNull();
  });
});
