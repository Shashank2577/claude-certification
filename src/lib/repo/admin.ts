import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { getDb, num, rows } from "../db";
import { mockAttempts } from "@/db/schema";
import { addDays, computeStreak, dayKey } from "../dates";
import { getCert, getCerts, getQuestionMap } from "../content";
import type { Cert } from "../content-types";
import { domainMastery, readiness, type AttemptSample } from "../scoring";
import { domainStats } from "./attempts";
import { recentActivity, streakFor } from "./activity";
import { getSettings } from "./settings";
import { getUserById } from "./users";

export interface AdminUserRow {
  id: number;
  name: string;
  email: string;
  role: "user" | "admin";
  createdAt: number;
  lastActiveAt: number | null;
  streak: number;
  xp: number;
  lessonsDone: number;
  answered: number;
  accuracy: number | null;
  mockAttempts: number;
  bestMock: number | null;
  readiness: number | null;
}

function activeCertFor(activeCert: string | null, certIds: string[]): Cert | undefined {
  return getCert(activeCert ?? certIds[0] ?? "") ?? getCerts()[0];
}

function predicted(cert: Cert, samples: Map<string, AttemptSample[]>): number | null {
  const domains = cert.domains.map((d) => {
    const list = samples.get(d.id) ?? [];
    return { domainId: d.id, weight: d.weight, mastery: domainMastery(list), attempts: list.length };
  });
  if (domains.every((d) => d.attempts === 0)) return null;
  return readiness(domains, cert.examInfo.passingScore).predicted;
}

async function readinessFor(userId: number): Promise<number | null> {
  const s = await getSettings(userId);
  const cert = activeCertFor(s.activeCert, s.certIds);
  if (!cert) return null;
  const stats = await domainStats(userId, cert.id, cert.domains.map((d) => d.id));
  if (stats.every((d) => d.attempts === 0)) return null;
  const w = new Map(cert.domains.map((d) => [d.id, d.weight]));
  return readiness(
    stats.map((d) => ({ domainId: d.domainId, weight: w.get(d.domainId) ?? 0, mastery: d.mastery, attempts: d.attempts })),
    cert.examInfo.passingScore,
  ).predicted;
}

/** Every user with their stats. Bulk-loads days and attempts so the query count doesn't grow with users. */
export async function listUsers(now = Date.now()): Promise<AdminUserRow[]> {
  const [base, days, freezes, attempts] = await Promise.all([
    rows<
      Omit<AdminUserRow, "streak" | "accuracy" | "readiness"> & {
        correct: number;
        tz: string | null;
        activeCert: string | null;
        certIds: string[] | null;
      }
    >(sql`
      SELECT u.id, u.name, u.email, u.role, u.created_at::float8 AS "createdAt", u.last_active_at::float8 AS "lastActiveAt",
        (SELECT COALESCE(SUM(xp), 0)::int FROM activity_log a WHERE a.user_id = u.id) AS xp,
        (SELECT COUNT(*)::int FROM lesson_progress l WHERE l.user_id = u.id AND l.status = 'done') AS "lessonsDone",
        (SELECT COUNT(*)::int FROM question_attempts q WHERE q.user_id = u.id AND q.mode <> 'mock') AS answered,
        (SELECT COUNT(*)::int FROM question_attempts q WHERE q.user_id = u.id AND q.mode <> 'mock' AND q.correct) AS correct,
        (SELECT COUNT(*)::int FROM mock_attempts m WHERE m.user_id = u.id AND m.status = 'submitted') AS "mockAttempts",
        (SELECT MAX(score)::int FROM mock_attempts m WHERE m.user_id = u.id AND m.status = 'submitted') AS "bestMock",
        s.tz, s.active_cert AS "activeCert", s.cert_ids AS "certIds"
      FROM users u LEFT JOIN user_settings s ON s.user_id = u.id
      ORDER BY u.created_at DESC`),
    rows<{ user_id: number; day: string }>(sql`SELECT DISTINCT user_id, day FROM activity_log WHERE kind <> 'achievement'`),
    rows<{ user_id: number; day: string }>(sql`SELECT user_id, day FROM streak_freezes`),
    rows<{ user_id: number; cert_id: string; domain_id: string; correct: boolean; created_at: string | number }>(
      sql`SELECT user_id, cert_id, domain_id, correct, created_at FROM question_attempts`,
    ),
  ]);

  const group = (list: { user_id: number; day: string }[]) => {
    const m = new Map<number, string[]>();
    for (const r of list) (m.get(r.user_id) ?? m.set(r.user_id, []).get(r.user_id)!).push(r.day);
    return m;
  };
  const activeBy = group(days);
  const frozenBy = group(freezes);
  // user → cert → domain → samples
  const samples = new Map<number, Map<string, Map<string, AttemptSample[]>>>();
  for (const a of attempts) {
    const byCert = samples.get(a.user_id) ?? samples.set(a.user_id, new Map()).get(a.user_id)!;
    const byDomain = byCert.get(a.cert_id) ?? byCert.set(a.cert_id, new Map()).get(a.cert_id)!;
    const list = byDomain.get(a.domain_id) ?? byDomain.set(a.domain_id, []).get(a.domain_id)!;
    list.push({ correct: a.correct, ageDays: (now - Number(a.created_at)) / 86_400_000 });
  }

  return base.map(({ correct, tz, activeCert, certIds, ...r }) => {
    const cert = activeCertFor(activeCert, Array.isArray(certIds) ? certIds : []);
    return {
      ...r,
      createdAt: Number(r.createdAt),
      lastActiveAt: r.lastActiveAt == null ? null : Number(r.lastActiveAt),
      accuracy: r.answered > 0 ? correct / r.answered : null,
      streak: computeStreak(activeBy.get(r.id) ?? [], frozenBy.get(r.id) ?? [], dayKey(now, tz ?? "UTC")).current,
      readiness: cert ? predicted(cert, samples.get(r.id)?.get(cert.id) ?? new Map()) : null,
    };
  });
}

export async function summary() {
  const weekAgo = Date.now() - 7 * 86_400_000;
  const [users, active7, answered, correct, mocks, passed] = await Promise.all([
    num(sql`SELECT COUNT(*)::int n FROM users`),
    num(sql`SELECT COUNT(DISTINCT user_id)::int n FROM activity_log WHERE created_at >= ${weekAgo}`),
    num(sql`SELECT COUNT(*)::int n FROM question_attempts WHERE mode <> 'mock'`),
    num(sql`SELECT COUNT(*)::int n FROM question_attempts WHERE mode <> 'mock' AND correct`),
    num(sql`SELECT COUNT(*)::int n FROM mock_attempts WHERE status = 'submitted'`),
    num(sql`SELECT COUNT(*)::int n FROM mock_attempts WHERE status = 'submitted' AND passed`),
  ]);
  return {
    users,
    active7,
    answered,
    accuracy: answered ? correct / answered : null,
    mocks,
    passRate: mocks ? passed / mocks : null,
  };
}

export interface HardQuestion {
  questionId: string;
  stem: string;
  domainId: string;
  domainName: string;
  attempts: number;
  wrongRate: number;
}

export async function hardestQuestions(limit = 10, minAttempts = 3): Promise<HardQuestion[]> {
  const rs = await rows<{ question_id: string; domain_id: string; cert_id: string; attempts: number; wrong_rate: number }>(
    sql`SELECT question_id, MIN(domain_id) domain_id, MIN(cert_id) cert_id, COUNT(*)::int attempts,
          (1.0 - AVG(CASE WHEN correct THEN 1.0 ELSE 0.0 END))::float8 wrong_rate
        FROM question_attempts GROUP BY question_id HAVING COUNT(*) >= ${minAttempts}
        ORDER BY wrong_rate DESC, attempts DESC LIMIT ${limit}`,
  );
  const qmap = getQuestionMap();
  return rs.map((r) => {
    const q = qmap.get(r.question_id);
    const dom = getCert(r.cert_id)?.domains.find((d) => d.id === r.domain_id);
    return {
      questionId: r.question_id,
      stem: q?.stem ?? "(question no longer in the bank)",
      domainId: r.domain_id,
      domainName: dom?.name ?? r.domain_id,
      attempts: r.attempts,
      wrongRate: Number(r.wrong_rate),
    };
  });
}

export interface Heatmap {
  certId: string;
  domains: { id: string; name: string; color: string }[];
  rows: { userId: number; name: string; cells: { mastery: number; attempts: number }[] }[];
}

/** Users × domains mastery grid for one cert; only users with attempts in that cert. */
export async function domainHeatmap(certId: string, now = Date.now()): Promise<Heatmap | null> {
  const cert = getCert(certId);
  if (!cert) return null;
  const rs = await rows<{ user_id: number; name: string; domain_id: string; correct: boolean; created_at: string | number }>(
    sql`SELECT q.user_id, u.name, q.domain_id, q.correct, q.created_at
        FROM question_attempts q JOIN users u ON u.id = q.user_id
        WHERE q.cert_id = ${certId} ORDER BY u.name, q.user_id`,
  );
  const byUser = new Map<number, { name: string; domains: Map<string, AttemptSample[]> }>();
  for (const r of rs) {
    const u = byUser.get(r.user_id) ?? byUser.set(r.user_id, { name: r.name, domains: new Map() }).get(r.user_id)!;
    const list = u.domains.get(r.domain_id) ?? u.domains.set(r.domain_id, []).get(r.domain_id)!;
    list.push({ correct: r.correct, ageDays: (now - Number(r.created_at)) / 86_400_000 });
  }
  return {
    certId,
    domains: cert.domains.map((d) => ({ id: d.id, name: d.name, color: d.color })),
    rows: [...byUser].map(([userId, u]) => ({
      userId,
      name: u.name,
      cells: cert.domains.map((d) => {
        const list = u.domains.get(d.id) ?? [];
        return { mastery: domainMastery(list), attempts: list.length };
      }),
    })),
  };
}

/** Distinct active users per day for the last `days` days, oldest first. */
export async function activeUsersPerDay(days = 30, tz = "UTC"): Promise<{ day: string; users: number }[]> {
  const today = dayKey(Date.now(), tz);
  const start = addDays(today, -(days - 1));
  const rs = await rows<{ day: string; users: number }>(
    sql`SELECT day, COUNT(DISTINCT user_id)::int users FROM activity_log WHERE day >= ${start} GROUP BY day`,
  );
  const m = new Map(rs.map((r) => [r.day, r.users]));
  return Array.from({ length: days }, (_, i) => {
    const d = addDays(start, i);
    return { day: d, users: m.get(d) ?? 0 };
  });
}

export interface MockSummary {
  id: string;
  certId: string;
  status: string;
  startedAt: number;
  submittedAt: number | null;
  score: number | null;
  correct: number | null;
  total: number | null;
  passed: boolean | null;
  breakdown: { domainId: string; name: string; correct: number; total: number }[];
}

function parseBreakdown(data: unknown, certId: string): MockSummary["breakdown"] {
  const names = new Map(getCert(certId)?.domains.map((d) => [d.id, d.name]) ?? []);
  const out: MockSummary["breakdown"] = [];
  const push = (id: string, v: unknown) => {
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    const correct = Number(o.correct ?? 0);
    const total = Number(o.total ?? o.count ?? 0);
    if (Number.isFinite(correct) && Number.isFinite(total)) out.push({ domainId: id, name: names.get(id) ?? id, correct, total });
  };
  if (Array.isArray(data)) for (const item of data) push(String((item as Record<string, unknown>)?.domainId ?? ""), item);
  else if (data && typeof data === "object") for (const [k, v] of Object.entries(data)) push(k, v);
  return out;
}

export async function userDetail(userId: number) {
  const user = await getUserById(userId);
  if (!user) return null;
  const settings = await getSettings(userId);
  const cert = activeCertFor(settings.activeCert, settings.certIds);
  const db = await getDb();
  const [stats, readinessScore, streak, activity, mockRows] = await Promise.all([
    cert ? domainStats(userId, cert.id, cert.domains.map((d) => d.id)) : Promise.resolve([]),
    readinessFor(userId),
    streakFor(userId, settings.tz),
    recentActivity(userId, 60),
    db.select().from(mockAttempts).where(eq(mockAttempts.userId, userId)).orderBy(desc(mockAttempts.startedAt)),
  ]);
  const mastery = cert
    ? stats.map((s) => {
        const d = cert.domains.find((x) => x.id === s.domainId)!;
        return { ...s, name: d.name, color: d.color, weight: d.weight };
      })
    : [];
  const mocks = mockRows.map(
    (m): MockSummary => ({
      id: m.id,
      certId: m.certId,
      status: m.status,
      startedAt: m.startedAt,
      submittedAt: m.submittedAt,
      score: m.score,
      correct: m.correct,
      total: m.total,
      passed: m.passed,
      breakdown: parseBreakdown(m.domainBreakdown, m.certId),
    }),
  );
  return { user, settings, cert, mastery, readiness: readinessScore, streak, activity, mocks };
}
