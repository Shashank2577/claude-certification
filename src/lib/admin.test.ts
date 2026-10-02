// Admin cohort dashboard: idle users must not look active. In-memory PGlite, like db.test.ts.
import { beforeAll, describe, expect, it } from "vitest";
import { getDb } from "./db";
import { createUser } from "./repo/users";
import { updateSettings } from "./repo/settings";
import { recordActivity } from "./repo/activity";
import { recordAttempt } from "./repo/attempts";
import { activeUsersPerDay, listUsers, summary, userDetail } from "./repo/admin";
import { classifyUser, certShortName, retentionWithin3Days, type StatusInput } from "./admin-status";

beforeAll(async () => {
  await getDb();
});

const user = (email: string) => createUser({ email, name: email.split("@")[0], passwordHash: "x", role: "user", firstUserIsAdmin: false });

describe("admin repo: study activity only", () => {
  it("does not count an onboarding-only user as active and gives them no streak", async () => {
    const now = Date.now();
    const idle = await user("idle-ian@example.com");
    await updateSettings(idle.id, { tz: "UTC", dailyMinutes: 999 });
    const r = await recordActivity(idle.id, { kind: "onboarding", xp: 10 }, now);
    expect(r.xp).toBeGreaterThan(0); // onboarding wrote a row (and possibly a badge)

    const row = (await listUsers(now)).find((u) => u.id === idle.id)!;
    expect(row.streak).toBe(0);
    expect(row.lastActiveAt).toBeNull();
    expect(row.status).toBe("never-studied");

    const s = await summary(now);
    expect(s.active7).toBe(0);
    const daily = await activeUsersPerDay(7, "UTC", now);
    expect(daily.reduce((n, d) => n + d.users, 0)).toBe(0);

    const detail = await userDetail(idle.id);
    expect(detail?.streak.current).toBe(0);
    expect(detail?.lastStudiedAt).toBeNull();
  });

  it("counts a real study event and guards readiness below 20 answers", async () => {
    const now = Date.now();
    const learner = await user("learner-lea@example.com");
    await updateSettings(learner.id, { tz: "UTC", dailyMinutes: 999, certIds: ["foundations"], activeCert: "foundations" });
    await recordAttempt({ userId: learner.id, questionId: "q1", certId: "foundations", domainId: "d1-agentic", taskId: "1.1", selected: ["A"], correct: true, ms: 1000, mode: "practice" });
    await recordActivity(learner.id, { kind: "answer", refId: "q1", xp: 3, meta: { correct: 1 } }, now);

    const row = (await listUsers(now)).find((u) => u.id === learner.id)!;
    expect(row.streak).toBe(1);
    expect(row.lastActiveAt).not.toBeNull();
    expect(row.readiness).toBeNull();
    expect(row.readinessAnswers).toBe(1);
    expect(row.status).toBe("on-track");
    expect(row.certName).toBe(certShortName(row.certName ?? ""));
    expect((await summary(now)).active7).toBe(1);
  });
});

describe("classifyUser", () => {
  const base: StatusInput = { daysSinceStudy: 0, daysLeft: null, readiness: null, readinessAnswers: 0, passingScore: 720, practiceAnswers: 0, practiceAccuracy: null };

  it("flags never-studied, inactive, behind and stuck", () => {
    expect(classifyUser({ ...base, daysSinceStudy: null }).status).toBe("never-studied");
    expect(classifyUser({ ...base, daysSinceStudy: 4 }).status).toBe("on-track");
    expect(classifyUser({ ...base, daysSinceStudy: 5 }).status).toBe("inactive");
    expect(classifyUser({ ...base, daysLeft: 10, readiness: 650, readinessAnswers: 40 }).status).toBe("behind");
    expect(classifyUser({ ...base, daysLeft: 10, readiness: 650, readinessAnswers: 5 }).status).toBe("on-track"); // too little data
    expect(classifyUser({ ...base, daysLeft: 20, readiness: 650, readinessAnswers: 40 }).status).toBe("on-track");
    expect(classifyUser({ ...base, practiceAnswers: 30, practiceAccuracy: 0.4 }).status).toBe("stuck");
    expect(classifyUser({ ...base, practiceAnswers: 29, practiceAccuracy: 0.1 }).status).toBe("on-track");
  });

  it("lists every reason, most urgent first", () => {
    const r = classifyUser({ ...base, daysSinceStudy: 8, daysLeft: 3, readiness: 600, readinessAnswers: 50, practiceAnswers: 50, practiceAccuracy: 0.3 });
    expect(r.status).toBe("behind");
    expect(r.reasons).toHaveLength(3);
  });
});

describe("retentionWithin3Days", () => {
  it("counts users who came back within three days of their first day", () => {
    const m = new Map<number, string[]>([
      [1, ["2026-01-01", "2026-01-03"]], // returned
      [2, ["2026-01-01", "2026-01-10"]], // came back too late
      [3, ["2026-01-09"]], // too recent to judge
    ]);
    expect(retentionWithin3Days(m, "2026-01-10")).toEqual({ eligible: 2, returned: 1 });
  });
});
