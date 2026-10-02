import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { mockAttempts } from "@/db/schema";
import type { MockDomainResult, MockState } from "../quiz-types";

export interface MockAttempt {
  id: string;
  userId: number;
  certId: string;
  status: "in_progress" | "submitted";
  state: MockState;
  startedAt: number;
  endsAt: number;
  submittedAt: number | null;
  score: number | null;
  correct: number | null;
  total: number | null;
  passed: boolean | null;
  breakdown: MockDomainResult[];
}

type Row = typeof mockAttempts.$inferSelect;

const EMPTY_STATE: MockState = { questionIds: [], answers: {}, flags: [], timeMs: {}, currentIndex: 0 };

function toAttempt(r: Row): MockAttempt {
  return {
    id: r.id,
    userId: r.userId,
    certId: r.certId,
    status: r.status,
    state: { ...EMPTY_STATE, ...((r.state ?? {}) as Partial<MockState>) },
    startedAt: r.startedAt,
    endsAt: r.endsAt,
    submittedAt: r.submittedAt,
    score: r.score,
    correct: r.correct,
    total: r.total,
    passed: r.passed,
    breakdown: (r.domainBreakdown ?? []) as MockDomainResult[],
  };
}

const owned = (userId: number, id: string) => and(eq(mockAttempts.id, id), eq(mockAttempts.userId, userId));

export async function createMockAttempt(userId: number, certId: string, questionIds: string[], durationMs: number): Promise<MockAttempt> {
  const now = Date.now();
  const state: MockState = { ...EMPTY_STATE, questionIds };
  const db = await getDb();
  const [r] = await db
    .insert(mockAttempts)
    .values({ id: crypto.randomUUID(), userId, certId, status: "in_progress", state: state as unknown as Record<string, unknown>, startedAt: now, endsAt: now + durationMs })
    .returning();
  return toAttempt(r);
}

/** Only returns attempts owned by `userId`. */
export async function getMockAttempt(userId: number, id: string): Promise<MockAttempt | null> {
  const db = await getDb();
  const [r] = await db.select().from(mockAttempts).where(owned(userId, id)).limit(1);
  return r ? toAttempt(r) : null;
}

export async function listMockAttempts(userId: number, certId?: string): Promise<MockAttempt[]> {
  const db = await getDb();
  const rs = await db
    .select()
    .from(mockAttempts)
    .where(certId ? and(eq(mockAttempts.userId, userId), eq(mockAttempts.certId, certId)) : eq(mockAttempts.userId, userId))
    .orderBy(desc(mockAttempts.startedAt));
  return rs.map(toAttempt);
}

export async function inProgressAttempt(userId: number, certId: string): Promise<MockAttempt | null> {
  const db = await getDb();
  const [r] = await db
    .select()
    .from(mockAttempts)
    .where(and(eq(mockAttempts.userId, userId), eq(mockAttempts.certId, certId), eq(mockAttempts.status, "in_progress")))
    .orderBy(desc(mockAttempts.startedAt))
    .limit(1);
  return r ? toAttempt(r) : null;
}

export async function saveMockState(userId: number, id: string, state: MockState) {
  const db = await getDb();
  await db
    .update(mockAttempts)
    .set({ state: state as unknown as Record<string, unknown> })
    .where(and(owned(userId, id), eq(mockAttempts.status, "in_progress")));
}

/** Marks the attempt submitted. Returns false if it was already submitted (so scoring runs once). */
export async function markMockSubmitted(
  userId: number,
  id: string,
  result: { state: MockState; score: number; correct: number; total: number; passed: boolean; breakdown: MockDomainResult[] },
): Promise<boolean> {
  const db = await getDb();
  const done = await db
    .update(mockAttempts)
    .set({
      status: "submitted",
      state: result.state as unknown as Record<string, unknown>,
      submittedAt: Date.now(),
      score: result.score,
      correct: result.correct,
      total: result.total,
      passed: result.passed,
      domainBreakdown: result.breakdown,
    })
    .where(and(owned(userId, id), eq(mockAttempts.status, "in_progress")))
    .returning({ id: mockAttempts.id });
  return done.length > 0;
}

export async function abandonMockAttempt(userId: number, id: string) {
  const db = await getDb();
  await db.delete(mockAttempts).where(and(owned(userId, id), eq(mockAttempts.status, "in_progress")));
}
