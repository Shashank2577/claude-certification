import "server-only";
import crypto from "node:crypto";
import { eq, lt, sql } from "drizzle-orm";
import { getDb, one } from "../db";
import { rateLimits } from "@/db/schema";

export interface RateLimitRule {
  /** Namespace, e.g. "login". */
  scope: string;
  limit: number;
  windowMs: number;
}

export const LOGIN_RULE: RateLimitRule = { scope: "login", limit: 8, windowMs: 15 * 60 * 1000 };
/** Keyed on the normalized email alone, so rotating the client IP can't bypass it. */
export const LOGIN_EMAIL_RULE: RateLimitRule = { scope: "login-email", limit: 20, windowMs: 60 * 60 * 1000 };
export const LOGIN_IP_RULE: RateLimitRule = { scope: "login-ip", limit: 40, windowMs: 15 * 60 * 1000 };
export const SIGNUP_RULE: RateLimitRule = { scope: "signup", limit: 5, windowMs: 60 * 60 * 1000 };

// Keys contain IPs and emails; store only a hash.
function hashKey(rule: RateLimitRule, id: string): string {
  return crypto.createHash("sha256").update(`${rule.scope}:${id}`).digest("base64url");
}

/**
 * Records a hit atomically and returns seconds until retry when over the limit, otherwise 0.
 * A single upsert, so concurrent requests on different instances can't slip past the counter.
 */
export async function hitRateLimit(rule: RateLimitRule, id: string, now = Date.now()): Promise<number> {
  const key = hashKey(rule, id);
  const resetAt = now + rule.windowMs;
  const r = await one<{ count: number; reset_at: string | number }>(sql`
    INSERT INTO rate_limits (key, count, reset_at) VALUES (${key}, 1, ${resetAt})
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.reset_at <= ${now} THEN 1 ELSE rate_limits.count + 1 END,
      reset_at = CASE WHEN rate_limits.reset_at <= ${now} THEN ${resetAt} ELSE rate_limits.reset_at END
    RETURNING count, reset_at`);
  // Opportunistic cleanup so the table doesn't grow without bound.
  if (Math.random() < 0.02) {
    const db = await getDb();
    await db.delete(rateLimits).where(lt(rateLimits.resetAt, now));
  }
  if (!r || r.count <= rule.limit) return 0;
  return Math.max(1, Math.ceil((Number(r.reset_at) - now) / 1000));
}

export async function resetRateLimit(rule: RateLimitRule, id: string) {
  const db = await getDb();
  await db.delete(rateLimits).where(eq(rateLimits.key, hashKey(rule, id)));
}
