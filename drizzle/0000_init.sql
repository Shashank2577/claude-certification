CREATE TABLE "achievements" (
	"user_id" integer NOT NULL,
	"achievement_id" text NOT NULL,
	"unlocked_at" bigint NOT NULL,
	CONSTRAINT "achievements_user_id_achievement_id_pk" PRIMARY KEY("user_id","achievement_id")
);
--> statement-breakpoint
CREATE TABLE "activity_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"kind" text NOT NULL,
	"ref_id" text,
	"xp" integer DEFAULT 0 NOT NULL,
	"minutes" real DEFAULT 0 NOT NULL,
	"meta" jsonb,
	"day" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_goals" (
	"user_id" integer NOT NULL,
	"day" text NOT NULL,
	CONSTRAINT "daily_goals_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "flashcard_reviews" (
	"user_id" integer NOT NULL,
	"card_id" text NOT NULL,
	"cert_id" text NOT NULL,
	"domain_id" text NOT NULL,
	"ease" real NOT NULL,
	"interval" integer NOT NULL,
	"reps" integer NOT NULL,
	"lapses" integer NOT NULL,
	"due_day" text NOT NULL,
	"last_grade" integer NOT NULL,
	"reviewed_at" bigint NOT NULL,
	CONSTRAINT "flashcard_reviews_user_id_card_id_pk" PRIMARY KEY("user_id","card_id")
);
--> statement-breakpoint
CREATE TABLE "lesson_progress" (
	"user_id" integer NOT NULL,
	"lesson_id" text NOT NULL,
	"cert_id" text NOT NULL,
	"domain_id" text NOT NULL,
	"status" text DEFAULT 'started' NOT NULL,
	"started_at" bigint NOT NULL,
	"completed_at" bigint,
	CONSTRAINT "lesson_progress_user_id_lesson_id_pk" PRIMARY KEY("user_id","lesson_id")
);
--> statement-breakpoint
CREATE TABLE "mock_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"cert_id" text NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"state" jsonb NOT NULL,
	"started_at" bigint NOT NULL,
	"ends_at" bigint NOT NULL,
	"submitted_at" bigint,
	"score" integer,
	"correct" integer,
	"total" integer,
	"passed" boolean,
	"domain_breakdown" jsonb
);
--> statement-breakpoint
CREATE TABLE "question_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"question_id" text NOT NULL,
	"cert_id" text NOT NULL,
	"domain_id" text NOT NULL,
	"task_id" text NOT NULL,
	"selected" jsonb NOT NULL,
	"correct" boolean NOT NULL,
	"ms" integer DEFAULT 0 NOT NULL,
	"mode" text NOT NULL,
	"session_id" text,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_flags" (
	"user_id" integer NOT NULL,
	"question_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "question_flags_user_id_question_id_pk" PRIMARY KEY("user_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "quiz_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"mode" text NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"question_ids" jsonb NOT NULL,
	"answered" integer DEFAULT 0 NOT NULL,
	"correct" integer DEFAULT 0 NOT NULL,
	"created_at" bigint NOT NULL,
	"finished_at" bigint
);
--> statement-breakpoint
CREATE TABLE "resource_progress" (
	"user_id" integer NOT NULL,
	"resource_id" text NOT NULL,
	"done_at" bigint NOT NULL,
	CONSTRAINT "resource_progress_user_id_resource_id_pk" PRIMARY KEY("user_id","resource_id")
);
--> statement-breakpoint
CREATE TABLE "streak_freezes" (
	"user_id" integer NOT NULL,
	"day" text NOT NULL,
	CONSTRAINT "streak_freezes_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"onboarded" boolean DEFAULT false NOT NULL,
	"cert_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active_cert" text,
	"exam_date" text,
	"daily_minutes" integer DEFAULT 20 NOT NULL,
	"background" text DEFAULT 'technical' NOT NULL,
	"tz" text DEFAULT 'UTC' NOT NULL,
	"plan" jsonb,
	"plan_start" text,
	"leaderboard_opt_out" boolean DEFAULT false NOT NULL,
	"freezes" integer DEFAULT 1 NOT NULL,
	"pomodoro_work" integer DEFAULT 25 NOT NULL,
	"pomodoro_break" integer DEFAULT 5 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"token_version" integer DEFAULT 0 NOT NULL,
	"created_at" bigint NOT NULL,
	"last_active_at" bigint,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_goals" ADD CONSTRAINT "daily_goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcard_reviews" ADD CONSTRAINT "flashcard_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mock_attempts" ADD CONSTRAINT "mock_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_attempts" ADD CONSTRAINT "question_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_flags" ADD CONSTRAINT "question_flags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_sessions" ADD CONSTRAINT "quiz_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_progress" ADD CONSTRAINT "resource_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streak_freezes" ADD CONSTRAINT "streak_freezes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_activity_user_day" ON "activity_log" USING btree ("user_id","day");--> statement-breakpoint
CREATE INDEX "idx_activity_day" ON "activity_log" USING btree ("day");--> statement-breakpoint
CREATE INDEX "idx_mock_user" ON "mock_attempts" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "idx_attempts_user" ON "question_attempts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_attempts_question" ON "question_attempts" USING btree ("question_id");