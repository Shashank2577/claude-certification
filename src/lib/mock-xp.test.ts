import { describe, expect, it } from "vitest";
import { XP } from "./gamification";
import { mockXp } from "./mock-core";

const xp = (answered: number, total: number, passed = false) => mockXp(answered, total, passed, XP.mockComplete, XP.mockPass);

describe("mockXp", () => {
  it("gives full completion XP when every question is answered", () => {
    expect(xp(60, 60)).toBe(150);
  });

  it("scales completion XP by the share answered", () => {
    expect(xp(30, 60)).toBe(75);
    expect(xp(45, 60)).toBe(113);
  });

  it("gives nothing below 25% answered", () => {
    expect(xp(10, 60)).toBe(0);
    expect(xp(14, 60)).toBe(0);
    expect(xp(0, 60)).toBe(0);
  });

  it("starts paying at exactly 25%", () => {
    expect(xp(15, 60)).toBe(38);
  });

  it("adds the pass bonus on top", () => {
    expect(xp(60, 60, true)).toBe(250);
  });

  it("handles empty or inconsistent totals", () => {
    expect(xp(0, 0)).toBe(0);
    expect(xp(70, 60)).toBe(150);
    expect(xp(-1, 60)).toBe(0);
  });
});
