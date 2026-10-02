import "server-only";
import { sql } from "drizzle-orm";
import { num, one } from "../db";
import { dayKey } from "../dates";

export async function focusStats(userId: number, tz: string, now = Date.now()) {
  const today = dayKey(now, tz);
  const [row, allTime] = await Promise.all([
    one<{ n: number; m: number }>(
      sql`SELECT COUNT(*)::int n, COALESCE(SUM((meta->>'minutes')::float8), 0)::float8 m
          FROM activity_log WHERE user_id = ${userId} AND kind = 'focus' AND day = ${today}`,
    ),
    num(sql`SELECT COUNT(*)::int n FROM activity_log WHERE user_id = ${userId} AND kind = 'focus'`),
  ]);
  return { todaySessions: row?.n ?? 0, todayMinutes: Number(row?.m ?? 0), allTime };
}
