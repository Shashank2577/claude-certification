import "server-only";
import { and, desc, eq, ne } from "drizzle-orm";
import { contentReports, integrityReviews, mockAttempts, users } from "@/db/schema";
import { getDb } from "@/lib/db";
import { getCert, getCertLessons, getQuestion } from "@/lib/content";
import { integritySignal } from "@/lib/integrity";
import { hitRateLimit } from "@/lib/repo/rate-limit";

export type ReportReason = "incorrect" | "unclear" | "outdated" | "layout" | "other";

export async function createContentReport(userId: number, input: { kind: "question" | "lesson"; contentId: string; certId: string; reason: ReportReason; detail: string }) {
  const cert = getCert(input.certId);
  const exists = input.kind === "question"
    ? getQuestion(input.contentId)?.certId === cert?.id
    : getCertLessons(input.certId).some((l) => l.id === input.contentId);
  if (!cert || !exists) return { error: "Content not found." };
  const detail = input.detail.trim().slice(0, 2000);
  if (detail.length < 10) return { error: "Please add at least 10 characters so we can investigate." };
  const retry = await hitRateLimit({ scope: "content-report", limit: 5, windowMs: 60 * 60_000 }, String(userId));
  if (retry) return { error: `Too many reports. Try again in ${Math.ceil(retry / 60)} minutes.` };
  const db = await getDb();
  await db.insert(contentReports).values({ userId, ...input, detail, createdAt: Date.now() });
  return { ok: true as const };
}

export async function listContentReports() {
  const db = await getDb();
  const [open, recentClosed] = await Promise.all([
    db.select({ report: contentReports, learner: users.name })
      .from(contentReports).innerJoin(users, eq(contentReports.userId, users.id))
      .where(eq(contentReports.status, "open")).orderBy(desc(contentReports.createdAt)),
    db.select({ report: contentReports, learner: users.name })
      .from(contentReports).innerJoin(users, eq(contentReports.userId, users.id))
      .where(ne(contentReports.status, "open")).orderBy(desc(contentReports.createdAt)).limit(50),
  ]);
  return [...open, ...recentClosed];
}

export async function decideContentReport(id: number, reviewerId: number, status: "resolved" | "dismissed", resolution: string) {
  const db = await getDb();
  await db.update(contentReports).set({ status, resolution: resolution.trim().slice(0, 2000), reviewedAt: Date.now(), reviewedBy: reviewerId })
    .where(and(eq(contentReports.id, id), eq(contentReports.status, "open")));
}

export async function listIntegrityCases() {
  const db = await getDb();
  const attempts = await db.select({ attempt: mockAttempts, learner: users.name, review: integrityReviews })
    .from(mockAttempts).innerJoin(users, eq(mockAttempts.userId, users.id))
    .leftJoin(integrityReviews, eq(integrityReviews.attemptId, mockAttempts.id))
    .where(eq(mockAttempts.status, "submitted"))
    .orderBy(desc(mockAttempts.submittedAt));
  return attempts.map((row) => ({ ...row, signal: integritySignal(row.attempt) })).filter((row) => row.signal);
}

export async function decideIntegrityCase(attemptId: string, reviewerId: number, status: "reviewed" | "dismissed", note: string) {
  const db = await getDb();
  const [attempt] = await db.select().from(mockAttempts).where(eq(mockAttempts.id, attemptId)).limit(1);
  if (!attempt || !integritySignal(attempt)) return;
  await db.insert(integrityReviews).values({ attemptId, status, note: note.trim().slice(0, 2000), reviewedAt: Date.now(), reviewedBy: reviewerId })
    .onConflictDoUpdate({ target: integrityReviews.attemptId, set: { status, note: note.trim().slice(0, 2000), reviewedAt: Date.now(), reviewedBy: reviewerId } });
}
