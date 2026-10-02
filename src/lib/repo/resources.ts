import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { activityLog, resourceProgress } from "@/db/schema";

export async function doneResourceIds(userId: number): Promise<string[]> {
  const db = await getDb();
  const rs = await db.select({ id: resourceProgress.resourceId }).from(resourceProgress).where(eq(resourceProgress.userId, userId));
  return rs.map((r) => r.id);
}

export async function setResourceDone(userId: number, resourceId: string, done: boolean) {
  const db = await getDb();
  if (done) await db.insert(resourceProgress).values({ userId, resourceId, doneAt: Date.now() }).onConflictDoNothing();
  else await db.delete(resourceProgress).where(and(eq(resourceProgress.userId, userId), eq(resourceProgress.resourceId, resourceId)));
}

/** XP is paid once per resource, even if it's unmarked and marked again. */
export async function resourceEverRewarded(userId: number, resourceId: string): Promise<boolean> {
  const db = await getDb();
  const rs = await db
    .select({ id: activityLog.id })
    .from(activityLog)
    .where(and(eq(activityLog.userId, userId), eq(activityLog.kind, "resource"), eq(activityLog.refId, resourceId)))
    .limit(1);
  return rs.length > 0;
}
