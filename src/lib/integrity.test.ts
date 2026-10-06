import { describe, expect, it } from "vitest";
import { integritySignal } from "./integrity";

describe("mock integrity triage", () => {
  const base = { score: 950, total: 60, startedAt: 1_000, endsAt: 61 * 60_000, submittedAt: 2 * 60_000 };
  it("flags an implausibly quick high score for human review", () => {
    expect(integritySignal(base)).toContain("Score 950");
  });
  it("does not flag low scores, normal duration, or tiny exams", () => {
    expect(integritySignal({ ...base, score: 720 })).toBeNull();
    expect(integritySignal({ ...base, submittedAt: 12 * 60_000 })).toBeNull();
    expect(integritySignal({ ...base, total: 5 })).toBeNull();
  });
});
