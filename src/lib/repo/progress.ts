import "server-only";
import { and, count, desc, eq, ne } from "drizzle-orm";
import { getDb } from "../db";
import { lessonProgress } from "@/db/schema";

export interface LessonProgressRow {
  lessonId: string;
  certId: string;
  domainId: string;
  status: "started" | "done";
  completedAt: number | null;
}

export async function getLessonProgress(userId: number): Promise<Map<string, LessonProgressRow>> {
  const db = await getDb();
  const rs = await db
    .select({
      lessonId: lessonProgress.lessonId,
      certId: lessonProgress.certId,
      domainId: lessonProgress.domainId,
      status: lessonProgress.status,
      completedAt: lessonProgress.completedAt,
    })
    .from(lessonProgress)
    .where(eq(lessonProgress.userId, userId));
  return new Map(rs.map((r) => [r.lessonId, r]));
}

export async function markLessonStarted(userId: number, lesson: { id: string; certId: string; domainId: string }) {
  const db = await getDb();
  await db
    .insert(lessonProgress)
    .values({ userId, lessonId: lesson.id, certId: lesson.certId, domainId: lesson.domainId, status: "started", startedAt: Date.now() })
    .onConflictDoNothing();
}

/** Returns true if this call transitioned the lesson to done (so XP is only awarded once). */
export async function markLessonDone(userId: number, lesson: { id: string; certId: string; domainId: string }): Promise<boolean> {
  await markLessonStarted(userId, lesson);
  const db = await getDb();
  const updated = await db
    .update(lessonProgress)
    .set({ status: "done", completedAt: Date.now() })
    .where(and(eq(lessonProgress.userId, userId), eq(lessonProgress.lessonId, lesson.id), ne(lessonProgress.status, "done")))
    .returning({ id: lessonProgress.lessonId });
  return updated.length > 0;
}

export async function countLessonsDone(userId: number): Promise<number> {
  const db = await getDb();
  const [r] = await db
    .select({ n: count() })
    .from(lessonProgress)
    .where(and(eq(lessonProgress.userId, userId), eq(lessonProgress.status, "done")));
  return Number(r?.n ?? 0);
}

/** Most recently touched lesson that isn't finished, for "pick up where you left off". */
export async function lastStartedLesson(userId: number): Promise<string | null> {
  const db = await getDb();
  const [r] = await db
    .select({ id: lessonProgress.lessonId })
    .from(lessonProgress)
    .where(and(eq(lessonProgress.userId, userId), eq(lessonProgress.status, "started")))
    .orderBy(desc(lessonProgress.startedAt))
    .limit(1);
  return r?.id ?? null;
}
