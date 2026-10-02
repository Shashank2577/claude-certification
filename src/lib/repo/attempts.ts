import "server-only";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb, num } from "../db";
import { questionAttempts, questionFlags, quizSessions } from "@/db/schema";
import { domainMastery, type AttemptSample } from "../scoring";
import type { QuestionHistory } from "../adaptive";

export type AttemptMode = "practice" | "lesson-check" | "mock";

export async function recordAttempt(input: {
  userId: number;
  questionId: string;
  certId: string;
  domainId: string;
  taskId: string;
  selected: string[];
  correct: boolean;
  ms: number;
  mode: AttemptMode;
  sessionId?: string | null;
}) {
  const db = await getDb();
  await db.insert(questionAttempts).values({
    userId: input.userId,
    questionId: input.questionId,
    certId: input.certId,
    domainId: input.domainId,
    taskId: input.taskId,
    selected: input.selected,
    correct: input.correct,
    ms: Math.max(0, Math.min(Math.round(input.ms), 60 * 60 * 1000)),
    mode: input.mode,
    sessionId: input.sessionId ?? null,
    createdAt: Date.now(),
  });
}

interface AttemptRow {
  questionId: string;
  domainId: string;
  taskId: string;
  correct: boolean;
  createdAt: number;
}

async function userAttempts(userId: number, certId?: string): Promise<AttemptRow[]> {
  const db = await getDb();
  return db
    .select({
      questionId: questionAttempts.questionId,
      domainId: questionAttempts.domainId,
      taskId: questionAttempts.taskId,
      correct: questionAttempts.correct,
      createdAt: questionAttempts.createdAt,
    })
    .from(questionAttempts)
    .where(certId ? and(eq(questionAttempts.userId, userId), eq(questionAttempts.certId, certId)) : eq(questionAttempts.userId, userId))
    .orderBy(asc(questionAttempts.createdAt), asc(questionAttempts.id));
}

export interface DomainStat {
  domainId: string;
  attempts: number;
  correct: number;
  mastery: number;
}

/** Per-domain mastery for a cert. Domains with no attempts get the prior (~25%). */
export async function domainStats(userId: number, certId: string, domainIds: string[], now = Date.now()): Promise<DomainStat[]> {
  const rs = await userAttempts(userId, certId);
  const by = new Map<string, AttemptSample[]>();
  const counts = new Map<string, { n: number; c: number }>();
  for (const r of rs) {
    const list = by.get(r.domainId) ?? [];
    list.push({ correct: r.correct, ageDays: (now - r.createdAt) / 86_400_000 });
    by.set(r.domainId, list);
    const c = counts.get(r.domainId) ?? { n: 0, c: 0 };
    c.n += 1;
    c.c += r.correct ? 1 : 0;
    counts.set(r.domainId, c);
  }
  return domainIds.map((id) => ({
    domainId: id,
    attempts: counts.get(id)?.n ?? 0,
    correct: counts.get(id)?.c ?? 0,
    mastery: domainMastery(by.get(id) ?? []),
  }));
}

export async function taskStats(userId: number, certId: string, now = Date.now()): Promise<Map<string, { attempts: number; mastery: number }>> {
  const rs = await userAttempts(userId, certId);
  const by = new Map<string, AttemptSample[]>();
  for (const r of rs) {
    const list = by.get(r.taskId) ?? [];
    list.push({ correct: r.correct, ageDays: (now - r.createdAt) / 86_400_000 });
    by.set(r.taskId, list);
  }
  return new Map([...by].map(([k, v]) => [k, { attempts: v.length, mastery: domainMastery(v) }]));
}

/** Per-question history for adaptive selection. */
export async function questionHistory(userId: number, now = Date.now()): Promise<Record<string, QuestionHistory>> {
  const [rs, flagList] = await Promise.all([userAttempts(userId), getFlags(userId)]);
  const flags = new Set(flagList);
  const out: Record<string, QuestionHistory> = {};
  for (const r of rs) {
    const h = out[r.questionId] ?? { attempts: 0, lastCorrect: false, lastAgeDays: 0, everWrong: false };
    h.attempts += 1;
    h.lastCorrect = r.correct;
    h.lastAgeDays = (now - r.createdAt) / 86_400_000;
    if (!r.correct) h.everWrong = true;
    h.flagged = flags.has(r.questionId);
    out[r.questionId] = h;
  }
  return out;
}

export async function getFlags(userId: number): Promise<string[]> {
  const db = await getDb();
  const rs = await db
    .select({ id: questionFlags.questionId })
    .from(questionFlags)
    .where(eq(questionFlags.userId, userId))
    .orderBy(desc(questionFlags.createdAt));
  return rs.map((r) => r.id);
}

export async function setFlag(userId: number, questionId: string, flagged: boolean) {
  const db = await getDb();
  if (flagged) await db.insert(questionFlags).values({ userId, questionId, createdAt: Date.now() }).onConflictDoNothing();
  else await db.delete(questionFlags).where(and(eq(questionFlags.userId, userId), eq(questionFlags.questionId, questionId)));
}

export async function answerTotals(userId: number): Promise<{ answered: number; correct: number }> {
  const [answered, correct] = await Promise.all([
    num(sql`SELECT COUNT(*)::int n FROM question_attempts WHERE user_id = ${userId} AND mode <> 'mock'`),
    num(sql`SELECT COUNT(*)::int n FROM question_attempts WHERE user_id = ${userId} AND mode <> 'mock' AND correct`),
  ]);
  return { answered, correct };
}

/** Questions whose most recent attempt was wrong. */
export async function currentMistakes(userId: number): Promise<string[]> {
  const h = await questionHistory(userId);
  return Object.entries(h)
    .filter(([, v]) => !v.lastCorrect)
    .map(([k]) => k);
}

export async function createQuizSession(userId: number, mode: string, filters: Record<string, unknown>, questionIds: string[]): Promise<string> {
  const id = crypto.randomUUID();
  const db = await getDb();
  await db.insert(quizSessions).values({ id, userId, mode, filters, questionIds, createdAt: Date.now() });
  return id;
}

export interface QuizSession {
  id: string;
  mode: string;
  questionIds: string[];
  answered: number;
  correct: number;
  finishedAt: number | null;
}

export async function getQuizSession(userId: number, id: string): Promise<QuizSession | undefined> {
  const db = await getDb();
  const [r] = await db
    .select({
      id: quizSessions.id,
      mode: quizSessions.mode,
      questionIds: quizSessions.questionIds,
      answered: quizSessions.answered,
      correct: quizSessions.correct,
      finishedAt: quizSessions.finishedAt,
    })
    .from(quizSessions)
    .where(and(eq(quizSessions.id, id), eq(quizSessions.userId, userId)))
    .limit(1);
  return r;
}

export async function bumpQuizSession(id: string, correct: boolean) {
  const db = await getDb();
  await db
    .update(quizSessions)
    .set({ answered: sql`${quizSessions.answered} + 1`, correct: sql`${quizSessions.correct} + ${correct ? 1 : 0}` })
    .where(eq(quizSessions.id, id));
}

/** Returns true only for the call that actually closed the session. */
export async function finishQuizSession(id: string): Promise<boolean> {
  const db = await getDb();
  const done = await db
    .update(quizSessions)
    .set({ finishedAt: Date.now() })
    .where(and(eq(quizSessions.id, id), isNull(quizSessions.finishedAt)))
    .returning({ id: quizSessions.id });
  return done.length > 0;
}
