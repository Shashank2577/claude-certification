// Single source of truth for the database schema. `pnpm db:generate` turns changes into SQL in ./drizzle.
import { bigint, boolean, index, integer, jsonb, pgTable, primaryKey, real, serial, text } from "drizzle-orm/pg-core";
import type { StudyPlan } from "../lib/content-types";

// Epoch milliseconds everywhere, read back as JS numbers.
const ms = (name: string) => bigint(name, { mode: "number" });

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(), // stored lower-cased
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["user", "admin"] }).notNull().default("user"),
  tokenVersion: integer("token_version").notNull().default(0),
  createdAt: ms("created_at").notNull(),
  lastActiveAt: ms("last_active_at"),
});

export const userSettings = pgTable("user_settings", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  onboarded: boolean("onboarded").notNull().default(false),
  certIds: jsonb("cert_ids").$type<string[]>().notNull().default([]),
  activeCert: text("active_cert"),
  examDate: text("exam_date"),
  dailyMinutes: integer("daily_minutes").notNull().default(20),
  background: text("background", { enum: ["technical", "non-technical"] }).notNull().default("technical"),
  tz: text("tz").notNull().default("UTC"),
  plan: jsonb("plan").$type<StudyPlan | null>(),
  planStart: text("plan_start"),
  leaderboardOptOut: boolean("leaderboard_opt_out").notNull().default(false),
  freezes: integer("freezes").notNull().default(1),
  pomodoroWork: integer("pomodoro_work").notNull().default(25),
  pomodoroBreak: integer("pomodoro_break").notNull().default(5),
});

export const lessonProgress = pgTable(
  "lesson_progress",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lessonId: text("lesson_id").notNull(),
    certId: text("cert_id").notNull(),
    domainId: text("domain_id").notNull(),
    status: text("status", { enum: ["started", "done"] }).notNull().default("started"),
    startedAt: ms("started_at").notNull(),
    completedAt: ms("completed_at"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.lessonId] })],
);

export const questionAttempts = pgTable(
  "question_attempts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    questionId: text("question_id").notNull(),
    certId: text("cert_id").notNull(),
    domainId: text("domain_id").notNull(),
    taskId: text("task_id").notNull(),
    selected: jsonb("selected").$type<string[]>().notNull(),
    correct: boolean("correct").notNull(),
    ms: integer("ms").notNull().default(0),
    mode: text("mode").notNull(),
    sessionId: text("session_id"),
    createdAt: ms("created_at").notNull(),
  },
  (t) => [index("idx_attempts_user").on(t.userId, t.createdAt), index("idx_attempts_question").on(t.questionId)],
);

export const questionFlags = pgTable(
  "question_flags",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    questionId: text("question_id").notNull(),
    createdAt: ms("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.questionId] })],
);

export const quizSessions = pgTable("quiz_sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  mode: text("mode").notNull(),
  filters: jsonb("filters").$type<Record<string, unknown>>().notNull().default({}),
  questionIds: jsonb("question_ids").$type<string[]>().notNull(),
  answered: integer("answered").notNull().default(0),
  correct: integer("correct").notNull().default(0),
  createdAt: ms("created_at").notNull(),
  finishedAt: ms("finished_at"),
});

export const mockAttempts = pgTable(
  "mock_attempts",
  {
    id: text("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    certId: text("cert_id").notNull(),
    status: text("status", { enum: ["in_progress", "submitted"] }).notNull().default("in_progress"),
    state: jsonb("state").$type<Record<string, unknown>>().notNull(),
    startedAt: ms("started_at").notNull(),
    endsAt: ms("ends_at").notNull(),
    submittedAt: ms("submitted_at"),
    score: integer("score"),
    correct: integer("correct"),
    total: integer("total"),
    passed: boolean("passed"),
    domainBreakdown: jsonb("domain_breakdown").$type<unknown[]>(),
  },
  (t) => [index("idx_mock_user").on(t.userId, t.startedAt)],
);

export const flashcardReviews = pgTable(
  "flashcard_reviews",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    cardId: text("card_id").notNull(),
    certId: text("cert_id").notNull(),
    domainId: text("domain_id").notNull(),
    ease: real("ease").notNull(),
    interval: integer("interval").notNull(),
    reps: integer("reps").notNull(),
    lapses: integer("lapses").notNull(),
    dueDay: text("due_day").notNull(),
    lastGrade: integer("last_grade").notNull(),
    reviewedAt: ms("reviewed_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.cardId] })],
);

export const activityLog = pgTable(
  "activity_log",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    refId: text("ref_id"),
    xp: integer("xp").notNull().default(0),
    minutes: real("minutes").notNull().default(0),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    day: text("day").notNull(),
    createdAt: ms("created_at").notNull(),
  },
  (t) => [index("idx_activity_user_day").on(t.userId, t.day), index("idx_activity_day").on(t.day)],
);

export const achievements = pgTable(
  "achievements",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    achievementId: text("achievement_id").notNull(),
    unlockedAt: ms("unlocked_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.achievementId] })],
);

export const streakFreezes = pgTable(
  "streak_freezes",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    day: text("day").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);

export const dailyGoals = pgTable(
  "daily_goals",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    day: text("day").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);

export const resourceProgress = pgTable(
  "resource_progress",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    resourceId: text("resource_id").notNull(),
    doneAt: ms("done_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.resourceId] })],
);

/** Fixed-window counters for login/sign-up throttling, shared across serverless instances. Keys are hashed. */
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull(),
    resetAt: ms("reset_at").notNull(),
  },
  (t) => [index("idx_rate_limits_reset").on(t.resetAt)],
);

/** Learner reports are reviewed against the source content before editing the bank. */
export const contentReports = pgTable("content_reports", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["question", "lesson"] }).notNull(),
  contentId: text("content_id").notNull(),
  certId: text("cert_id").notNull(),
  reason: text("reason", { enum: ["incorrect", "unclear", "outdated", "layout", "other"] }).notNull(),
  detail: text("detail").notNull(),
  status: text("status", { enum: ["open", "resolved", "dismissed"] }).notNull().default("open"),
  createdAt: ms("created_at").notNull(),
  reviewedAt: ms("reviewed_at"),
  reviewedBy: integer("reviewed_by").references(() => users.id, { onDelete: "set null" }),
  resolution: text("resolution"),
}, (t) => [index("idx_content_reports_status").on(t.status, t.createdAt)]);

/** A human decision on a rule-based mock signal. The signal itself is derived from server timestamps. */
export const integrityReviews = pgTable("integrity_reviews", {
  attemptId: text("attempt_id").primaryKey().references(() => mockAttempts.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["open", "reviewed", "dismissed"] }).notNull().default("open"),
  note: text("note"),
  reviewedAt: ms("reviewed_at"),
  reviewedBy: integer("reviewed_by").references(() => users.id, { onDelete: "set null" }),
});
