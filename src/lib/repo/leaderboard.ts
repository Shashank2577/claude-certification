import "server-only";
import { sql } from "drizzle-orm";
import { rows } from "../db";

export interface LeaderRow {
  userId: number;
  name: string;
  xp: number;
}

/** XP leaderboard. `sinceDays` limits to recent activity; opted-out users are excluded. */
export async function leaderboard(sinceDays: number | null, limit = 25, now = Date.now()): Promise<LeaderRow[]> {
  const sinceMs = sinceDays == null ? 0 : now - sinceDays * 86_400_000;
  return rows<LeaderRow>(
    sql`SELECT u.id AS "userId", u.name AS name, COALESCE(SUM(a.xp), 0)::int AS xp
        FROM users u
        JOIN user_settings s ON s.user_id = u.id
        LEFT JOIN activity_log a ON a.user_id = u.id AND a.created_at >= ${sinceMs}
        WHERE NOT s.leaderboard_opt_out
        GROUP BY u.id, u.name
        HAVING COALESCE(SUM(a.xp), 0) > 0
        ORDER BY xp DESC, u.id ASC
        LIMIT ${limit}`,
  );
}
