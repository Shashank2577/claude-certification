import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { getDb, num, rows } from "../db";
import { mockAttempts } from "@/db/schema";
import { addDays, computeStreak, daysBetween, dayKey } from "../dates";
import { getAllLessons, getCert, getCerts, getQuestionMap } from "../content";
import type { Cert } from "../content-types";
import { daysUntil } from "../plan-builder";
import { domainMastery, readiness, type AttemptSample } from "../scoring";
import { achievementById } from "../gamification";
import {
  certShortName,
  classifyUser,
  MIN_READINESS_ANSWERS,
  NON_STUDY_KINDS,
  retentionWithin3Days,
  type Retention,
  type UserStatus,
} from "../admin-status";
import { domainStats } from "./attempts";
import { recentActivity, type ActivityKind } from "./activity";
import { getSettings } from "./settings";
import { getUserById } from "./users";

/** SQL predicate on activity_log.kind: real study events only (not onboarding, badges or goal bonuses). */
const STUDY = sql.raw(`kind NOT IN (${NON_STUDY_KINDS.map((k) => `'${k}'`).join(", ")})`);

export interface AdminUserRow {
  id: number;
  name: string;
  email: string;
  role: "user" | "admin";
  createdAt: number;
  /** Last real study event (lesson, answer, mock…); null when the user never studied. */
  lastActiveAt: number | null;
  streak: number;
  xp: number;
  lessonsDone: number;
  /** Practice answers (excludes mock exams). */
  answered: number;
  /** Practice accuracy (excludes mock exams). */
  accuracy: number | null;
  /** Answers given inside mock exams. */
  mockAnswers: number;
  mockAttempts: number;
  bestMock: number | null;
  lastMock: number | null;
  /** Predicted score on the active cert; null until `readinessAnswers` reaches MIN_READINESS_ANSWERS. */
  readiness: number | null;
  /** Answers on the active cert that feed readiness (all modes). */
  readinessAnswers: number;
  passingScore: number;
  certId: string | null;
  certName: string | null;
  examDate: string | null;
  daysLeft: number | null;
  status: UserStatus;
  reasons: string[];
}

function activeCertFor(activeCert: string | null, certIds: string[]): Cert | undefined {
  return getCert(activeCert ?? certIds[0] ?? "") ?? getCerts()[0];
}

/** Predicted score plus the sample size behind it; score is null below the minimum sample. */
function predicted(cert: Cert, samples: Map<string, AttemptSample[]>): { score: number | null; answers: number } {
  const domains = cert.domains.map((d) => {
    const list = samples.get(d.id) ?? [];
    return { domainId: d.id, weight: d.weight, mastery: domainMastery(list), attempts: list.length };
  });
  const answers = domains.reduce((s, d) => s + d.attempts, 0);
  if (answers < MIN_READINESS_ANSWERS) return { score: null, answers };
  return { score: readiness(domains, cert.examInfo.passingScore).predicted, answers };
}

async function readinessFor(userId: number, cert: Cert | undefined): Promise<{ score: number | null; answers: number }> {
  if (!cert) return { score: null, answers: 0 };
  const stats = await domainStats(userId, cert.id, cert.domains.map((d) => d.id));
  const answers = stats.reduce((s, d) => s + d.attempts, 0);
  if (answers < MIN_READINESS_ANSWERS) return { score: null, answers };
  const w = new Map(cert.domains.map((d) => [d.id, d.weight]));
  const score = readiness(
    stats.map((d) => ({ domainId: d.domainId, weight: w.get(d.domainId) ?? 0, mastery: d.mastery, attempts: d.attempts })),
    cert.examInfo.passingScore,
  ).predicted;
  return { score, answers };
}

function groupDays(list: { user_id: number; day: string }[]): Map<number, string[]> {
  const m = new Map<number, string[]>();
  for (const r of list) (m.get(r.user_id) ?? m.set(r.user_id, []).get(r.user_id)!).push(r.day);
  return m;
}

/** Every user with their stats. Bulk-loads days and attempts so the query count doesn't grow with users. */
export async function listUsers(now = Date.now()): Promise<AdminUserRow[]> {
  const [base, days, freezes, attempts] = await Promise.all([
    rows<{
      id: number;
      name: string;
      email: string;
      role: "user" | "admin";
      createdAt: number;
      lastStudiedAt: number | null;
      xp: number;
      lessonsDone: number;
      answered: number;
      correct: number;
      mockAnswers: number;
      mockAttempts: number;
      bestMock: number | null;
      lastMock: number | null;
      tz: string | null;
      activeCert: string | null;
      certIds: string[] | null;
      examDate: string | null;
    }>(sql`
      SELECT u.id, u.name, u.email, u.role, u.created_at::float8 AS "createdAt",
        (SELECT MAX(a.created_at)::float8 FROM activity_log a WHERE a.user_id = u.id AND a.${STUDY}) AS "lastStudiedAt",
        (SELECT COALESCE(SUM(xp), 0)::int FROM activity_log a WHERE a.user_id = u.id) AS xp,
        (SELECT COUNT(*)::int FROM lesson_progress l WHERE l.user_id = u.id AND l.status = 'done') AS "lessonsDone",
        (SELECT COUNT(*)::int FROM question_attempts q WHERE q.user_id = u.id AND q.mode <> 'mock') AS answered,
        (SELECT COUNT(*)::int FROM question_attempts q WHERE q.user_id = u.id AND q.mode <> 'mock' AND q.correct) AS correct,
        (SELECT COUNT(*)::int FROM question_attempts q WHERE q.user_id = u.id AND q.mode = 'mock') AS "mockAnswers",
        (SELECT COUNT(*)::int FROM mock_attempts m WHERE m.user_id = u.id AND m.status = 'submitted') AS "mockAttempts",
        (SELECT MAX(score)::int FROM mock_attempts m WHERE m.user_id = u.id AND m.status = 'submitted') AS "bestMock",
        (SELECT m.score::int FROM mock_attempts m WHERE m.user_id = u.id AND m.status = 'submitted'
           ORDER BY m.submitted_at DESC NULLS LAST, m.started_at DESC LIMIT 1) AS "lastMock",
        s.tz, s.active_cert AS "activeCert", s.cert_ids AS "certIds", s.exam_date AS "examDate"
      FROM users u LEFT JOIN user_settings s ON s.user_id = u.id
      ORDER BY u.created_at DESC`),
    rows<{ user_id: number; day: string }>(sql`SELECT DISTINCT user_id, day FROM activity_log WHERE ${STUDY}`),
    rows<{ user_id: number; day: string }>(sql`SELECT user_id, day FROM streak_freezes`),
    rows<{ user_id: number; cert_id: string; domain_id: string; correct: boolean; created_at: string | number }>(
      sql`SELECT user_id, cert_id, domain_id, correct, created_at FROM question_attempts`,
    ),
  ]);

  const activeBy = groupDays(days);
  const frozenBy = groupDays(freezes);
  // user → cert → domain → samples
  const samples = new Map<number, Map<string, Map<string, AttemptSample[]>>>();
  for (const a of attempts) {
    const byCert = samples.get(a.user_id) ?? samples.set(a.user_id, new Map()).get(a.user_id)!;
    const byDomain = byCert.get(a.cert_id) ?? byCert.set(a.cert_id, new Map()).get(a.cert_id)!;
    const list = byDomain.get(a.domain_id) ?? byDomain.set(a.domain_id, []).get(a.domain_id)!;
    list.push({ correct: a.correct, ageDays: (now - Number(a.created_at)) / 86_400_000 });
  }

  return base.map(({ correct, tz: rawTz, activeCert, certIds, lastStudiedAt, examDate, ...r }): AdminUserRow => {
    const tz = rawTz ?? "UTC";
    const cert = activeCertFor(activeCert, Array.isArray(certIds) ? certIds : []);
    const today = dayKey(now, tz);
    const lastActiveAt = lastStudiedAt == null ? null : Number(lastStudiedAt);
    const accuracy = r.answered > 0 ? correct / r.answered : null;
    const ready = cert ? predicted(cert, samples.get(r.id)?.get(cert.id) ?? new Map()) : { score: null, answers: 0 };
    const passingScore = cert?.examInfo.passingScore ?? 720;
    const daysLeft = daysUntil(examDate, tz, now);
    const { status, reasons } = classifyUser({
      daysSinceStudy: lastActiveAt == null ? null : daysBetween(dayKey(lastActiveAt, tz), today),
      daysLeft,
      readiness: ready.score,
      readinessAnswers: ready.answers,
      passingScore,
      practiceAnswers: r.answered,
      practiceAccuracy: accuracy,
    });
    return {
      ...r,
      createdAt: Number(r.createdAt),
      lastActiveAt,
      accuracy,
      streak: computeStreak(activeBy.get(r.id) ?? [], frozenBy.get(r.id) ?? [], today).current,
      readiness: ready.score,
      readinessAnswers: ready.answers,
      passingScore,
      certId: cert?.id ?? null,
      certName: cert ? certShortName(cert.name) : null,
      examDate: examDate ?? null,
      daysLeft,
      status,
      reasons,
    };
  });
}

export async function summary(now = Date.now()) {
  const weekAgo = now - 7 * 86_400_000;
  const [users, active7, answered, correct, mockAnswers, mocks, passed] = await Promise.all([
    num(sql`SELECT COUNT(*)::int n FROM users`),
    num(sql`SELECT COUNT(DISTINCT user_id)::int n FROM activity_log WHERE created_at >= ${weekAgo} AND ${STUDY}`),
    num(sql`SELECT COUNT(*)::int n FROM question_attempts WHERE mode <> 'mock'`),
    num(sql`SELECT COUNT(*)::int n FROM question_attempts WHERE mode <> 'mock' AND correct`),
    num(sql`SELECT COUNT(*)::int n FROM question_attempts WHERE mode = 'mock'`),
    num(sql`SELECT COUNT(*)::int n FROM mock_attempts WHERE status = 'submitted'`),
    num(sql`SELECT COUNT(*)::int n FROM mock_attempts WHERE status = 'submitted' AND passed`),
  ]);
  return {
    users,
    active7,
    answered,
    accuracy: answered ? correct / answered : null,
    mockAnswers,
    mocks,
    passRate: mocks ? passed / mocks : null,
  };
}

/** Learning outcomes from recorded actions, rather than page views or time spent. */
export async function learningMetrics() {
  const [firstAnswer, missed, returnedToReview, delayedCorrection, repeatMock, improvedMock] = await Promise.all([
    num(sql`SELECT COUNT(DISTINCT user_id)::int n FROM question_attempts`),
    num(sql`SELECT COUNT(DISTINCT user_id)::int n FROM question_attempts WHERE NOT correct`),
    num(sql`SELECT COUNT(DISTINCT later.user_id)::int n FROM question_attempts later
      WHERE EXISTS (
        SELECT 1 FROM question_attempts earlier
        WHERE earlier.user_id = later.user_id AND earlier.question_id = later.question_id
          AND NOT earlier.correct AND earlier.created_at <= later.created_at - 86400000
      )`),
    num(sql`SELECT COUNT(DISTINCT later.user_id)::int n FROM question_attempts later
      WHERE later.correct AND EXISTS (
        SELECT 1 FROM question_attempts earlier
        WHERE earlier.user_id = later.user_id AND earlier.question_id = later.question_id
          AND NOT earlier.correct AND earlier.created_at <= later.created_at - 86400000
      )`),
    num(sql`WITH ranked AS (
      SELECT user_id, cert_id, ROW_NUMBER() OVER (PARTITION BY user_id, cert_id ORDER BY submitted_at, started_at) rank
      FROM mock_attempts WHERE status = 'submitted'
    ) SELECT COUNT(DISTINCT user_id)::int n FROM ranked WHERE rank = 2`),
    num(sql`WITH ranked AS (
      SELECT user_id, cert_id, score, ROW_NUMBER() OVER (PARTITION BY user_id, cert_id ORDER BY submitted_at, started_at) rank
      FROM mock_attempts WHERE status = 'submitted'
    ) SELECT COUNT(DISTINCT second.user_id)::int n FROM ranked first
      JOIN ranked second ON first.user_id = second.user_id AND first.cert_id = second.cert_id
      WHERE first.rank = 1 AND second.rank = 2 AND second.score > first.score`),
  ]);
  return { firstAnswer, missed, returnedToReview, delayedCorrection, repeatMock, improvedMock };
}

export interface HardQuestion {
  questionId: string;
  stem: string;
  domainId: string;
  domainName: string;
  attempts: number;
  wrongRate: number;
}

export async function hardestQuestions(limit = 10, minAttempts = 3, certId?: string): Promise<HardQuestion[]> {
  const scope = certId ? sql`WHERE cert_id = ${certId}` : sql``;
  const rs = await rows<{ question_id: string; domain_id: string; cert_id: string; attempts: number; wrong_rate: number }>(
    sql`SELECT question_id, MIN(domain_id) domain_id, MIN(cert_id) cert_id, COUNT(*)::int attempts,
          (1.0 - AVG(CASE WHEN correct THEN 1.0 ELSE 0.0 END))::float8 wrong_rate
        FROM question_attempts ${scope} GROUP BY question_id HAVING COUNT(*) >= ${minAttempts}
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

export interface HardDomain {
  certId: string;
  domainId: string;
  domainName: string;
  attempts: number;
  wrongRate: number;
}

/** Fallback for thin data: domains ranked by share of wrong answers (any attempt count). */
export async function hardestDomains(limit = 6, certId?: string): Promise<HardDomain[]> {
  const scope = certId ? sql`WHERE cert_id = ${certId}` : sql``;
  const rs = await rows<{ cert_id: string; domain_id: string; attempts: number; wrong_rate: number }>(
    sql`SELECT cert_id, domain_id, COUNT(*)::int attempts,
          (1.0 - AVG(CASE WHEN correct THEN 1.0 ELSE 0.0 END))::float8 wrong_rate
        FROM question_attempts ${scope} GROUP BY cert_id, domain_id
        ORDER BY wrong_rate DESC, attempts DESC LIMIT ${limit}`,
  );
  return rs.map((r) => ({
    certId: r.cert_id,
    domainId: r.domain_id,
    domainName: getCert(r.cert_id)?.domains.find((d) => d.id === r.domain_id)?.name ?? r.domain_id,
    attempts: r.attempts,
    wrongRate: Number(r.wrong_rate),
  }));
}

export interface HeatCell {
  mastery: number;
  attempts: number;
}

export interface Heatmap {
  certId: string;
  domains: { id: string; name: string; color: string }[];
  rows: { userId: number; name: string; cells: HeatCell[] }[];
  /** Mean mastery per domain over users with at least one attempt there; attempts are summed. */
  average: HeatCell[];
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
  const userRows = [...byUser].map(([userId, u]) => ({
    userId,
    name: u.name,
    cells: cert.domains.map((d): HeatCell => {
      const list = u.domains.get(d.id) ?? [];
      return { mastery: domainMastery(list), attempts: list.length };
    }),
  }));
  const average = cert.domains.map((_, i): HeatCell => {
    const withData = userRows.map((r) => r.cells[i]).filter((c) => c.attempts > 0);
    return {
      mastery: withData.length ? withData.reduce((s, c) => s + c.mastery, 0) / withData.length : 0,
      attempts: withData.reduce((s, c) => s + c.attempts, 0),
    };
  });
  return { certId, domains: cert.domains.map((d) => ({ id: d.id, name: d.name, color: d.color })), rows: userRows, average };
}

/** Distinct users with a real study event per day for the last `days` days, oldest first. */
export async function activeUsersPerDay(days = 30, tz = "UTC", now = Date.now()): Promise<{ day: string; users: number }[]> {
  const today = dayKey(now, tz);
  const start = addDays(today, -(days - 1));
  const rs = await rows<{ day: string; users: number }>(
    sql`SELECT day, COUNT(DISTINCT user_id)::int users FROM activity_log WHERE day >= ${start} AND ${STUDY} GROUP BY day`,
  );
  const m = new Map(rs.map((r) => [r.day, r.users]));
  return Array.from({ length: days }, (_, i) => {
    const d = addDays(start, i);
    return { day: d, users: m.get(d) ?? 0 };
  });
}

/** Of users whose first study day is 3+ days old, how many studied again within 3 days. */
export async function retention3Days(tz = "UTC", now = Date.now()): Promise<Retention> {
  const rs = await rows<{ user_id: number; day: string }>(sql`SELECT DISTINCT user_id, day FROM activity_log WHERE ${STUDY}`);
  return retentionWithin3Days(groupDays(rs), dayKey(now, tz));
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

export type TimelineGroup = "lessons" | "practice" | "mocks" | "other";

export interface TimelineItem {
  id: number;
  kind: ActivityKind;
  group: TimelineGroup;
  /** e.g. "Completed a lesson" */
  action: string;
  /** Resolved lesson title, shortened question stem, badge name… */
  detail: string | null;
  /** For answers: whether it was right. */
  correct: boolean | null;
  xp: number;
  day: string;
  createdAt: number;
}

const KIND_LABEL: Record<string, string> = {
  lesson: "Completed a lesson",
  answer: "Answered a question",
  quiz: "Finished a practice set",
  flashcard: "Reviewed a flashcard",
  mock: "Finished a mock exam",
  focus: "Finished a focus block",
  resource: "Marked a resource done",
  "daily-goal": "Hit the daily goal",
  onboarding: "Set up a study plan",
  achievement: "Unlocked a badge",
};

const GROUP: Partial<Record<ActivityKind, TimelineGroup>> = { lesson: "lessons", answer: "practice", quiz: "practice", flashcard: "practice", mock: "mocks" };

export function shorten(text: string, max = 90): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

function resolveDetail(kind: ActivityKind, refId: string | null, meta: Record<string, unknown>, lessons: Map<string, string>, questions: Map<string, { stem: string }>): string | null {
  switch (kind) {
    case "lesson":
      return (refId && lessons.get(refId)) || (typeof meta.title === "string" ? meta.title : refId);
    case "answer": {
      const q = refId ? questions.get(refId) : undefined;
      return q ? shorten(q.stem) : refId;
    }
    case "quiz":
      return typeof meta.answered === "number" ? `${meta.correct ?? 0} of ${meta.answered} correct` : null;
    case "mock":
      return typeof meta.score === "number" ? `Score ${meta.score}${meta.passed ? ", pass" : ", fail"}` : null;
    case "achievement":
      return refId ? (achievementById(refId)?.title ?? refId) : null;
    case "resource":
      return typeof meta.title === "string" ? meta.title : refId;
    case "focus":
      return typeof meta.minutes === "number" ? `${meta.minutes} min` : null;
    default:
      return null;
  }
}

export async function userDetail(userId: number) {
  const user = await getUserById(userId);
  if (!user) return null;
  const settings = await getSettings(userId);
  const cert = activeCertFor(settings.activeCert, settings.certIds);
  const db = await getDb();
  const [stats, ready, studyDays, frozen, activity, mockRows, lastStudied] = await Promise.all([
    cert ? domainStats(userId, cert.id, cert.domains.map((d) => d.id)) : Promise.resolve([]),
    readinessFor(userId, cert),
    rows<{ day: string }>(sql`SELECT DISTINCT day FROM activity_log WHERE user_id = ${userId} AND ${STUDY}`),
    rows<{ day: string }>(sql`SELECT day FROM streak_freezes WHERE user_id = ${userId}`),
    recentActivity(userId, 200),
    db.select().from(mockAttempts).where(eq(mockAttempts.userId, userId)).orderBy(desc(mockAttempts.startedAt)),
    num(sql`SELECT COALESCE(MAX(created_at), 0)::float8 n FROM activity_log WHERE user_id = ${userId} AND ${STUDY}`),
  ]);
  const streak = computeStreak(
    studyDays.map((r) => r.day),
    frozen.map((r) => r.day),
    dayKey(Date.now(), settings.tz),
  );
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
  const lastMock = mocks.filter((m) => m.status === "submitted" && m.score != null).sort((a, b) => (b.submittedAt ?? b.startedAt) - (a.submittedAt ?? a.startedAt))[0] ?? null;
  const lessons = new Map(getAllLessons().map((l) => [l.id, l.title]));
  const questions = getQuestionMap();
  const timeline = activity.map(
    (a): TimelineItem => ({
      id: a.id,
      kind: a.kind,
      group: GROUP[a.kind] ?? "other",
      action: KIND_LABEL[a.kind] ?? a.kind,
      detail: resolveDetail(a.kind, a.refId, a.meta, lessons, questions),
      correct: a.kind === "answer" && typeof a.meta.correct !== "undefined" ? !!a.meta.correct : null,
      xp: a.xp,
      day: a.day,
      createdAt: a.createdAt,
    }),
  );
  return {
    user,
    settings,
    cert,
    mastery,
    readiness: ready.score,
    readinessAnswers: ready.answers,
    passingScore: cert?.examInfo.passingScore ?? 720,
    lastMock,
    lastStudiedAt: lastStudied > 0 ? lastStudied : null,
    streak,
    timeline,
    mocks,
  };
}
