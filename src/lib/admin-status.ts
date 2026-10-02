// Pure helpers for the admin cohort dashboard. Safe to import from client components.

/** Activity kinds that are bookkeeping, not study. They never count towards "active", streaks or last-studied. */
export const NON_STUDY_KINDS = ["onboarding", "achievement", "daily-goal"] as const;

/** Readiness is only shown once a user has this many answers on the exam. */
export const MIN_READINESS_ANSWERS = 20;
export const INACTIVE_DAYS = 5;
export const BEHIND_EXAM_DAYS = 14;
export const STUCK_MIN_ANSWERS = 30;
export const STUCK_ACCURACY = 0.5;

export type UserStatus = "never-studied" | "inactive" | "behind" | "stuck" | "on-track";

export const STATUS_LABEL: Record<UserStatus, string> = {
  "never-studied": "Never studied",
  inactive: "Inactive",
  behind: "Behind",
  stuck: "Stuck",
  "on-track": "On track",
};

export const STATUS_TONE: Record<UserStatus, "neutral" | "good" | "bad" | "info" | "accent"> = {
  "never-studied": "neutral",
  inactive: "accent",
  behind: "bad",
  stuck: "bad",
  "on-track": "good",
};

/** Most urgent first; used to order the at-risk list. */
export const STATUS_ORDER: UserStatus[] = ["behind", "stuck", "inactive", "never-studied", "on-track"];

export interface StatusInput {
  /** Whole days since the last real study event, or null if the user never studied. */
  daysSinceStudy: number | null;
  /** Days until the exam date (negative once it has passed), or null if unset. */
  daysLeft: number | null;
  readiness: number | null;
  readinessAnswers: number;
  passingScore: number;
  practiceAnswers: number;
  practiceAccuracy: number | null;
}

export interface StatusResult {
  status: UserStatus;
  /** Every rule that fired, most urgent first, in plain words. */
  reasons: string[];
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function classifyUser(i: StatusInput): StatusResult {
  if (i.daysSinceStudy == null) return { status: "never-studied", reasons: ["Signed up but has not studied yet"] };
  const hits: { status: UserStatus; reason: string }[] = [];
  if (
    i.daysLeft != null &&
    i.daysLeft >= 0 &&
    i.daysLeft < BEHIND_EXAM_DAYS &&
    i.readiness != null &&
    i.readinessAnswers >= MIN_READINESS_ANSWERS &&
    i.readiness < i.passingScore
  ) {
    hits.push({ status: "behind", reason: `Exam in ${plural(i.daysLeft, "day")}, readiness ${i.readiness} (pass ${i.passingScore})` });
  }
  if (i.practiceAnswers >= STUCK_MIN_ANSWERS && i.practiceAccuracy != null && i.practiceAccuracy < STUCK_ACCURACY) {
    hits.push({ status: "stuck", reason: `${Math.round(i.practiceAccuracy * 100)}% accuracy over ${plural(i.practiceAnswers, "practice answer")}` });
  }
  if (i.daysSinceStudy >= INACTIVE_DAYS) hits.push({ status: "inactive", reason: `No study for ${plural(i.daysSinceStudy, "day")}` });
  if (hits.length === 0) return { status: "on-track", reasons: [] };
  hits.sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
  return { status: hits[0].status, reasons: hits.map((h) => h.reason) };
}

/** "Foundations" from "Claude Certified Architect – Foundations". */
export function certShortName(name: string): string {
  const parts = name.split(/\s[–—-]\s/);
  return (parts[parts.length - 1] ?? name).trim() || name;
}

export interface Retention {
  /** Users whose first study day is at least 3 days old. */
  eligible: number;
  /** Of those, how many studied again within 3 days of their first day. */
  returned: number;
}

/** Share of users who came back within 3 days of their first study day. Days are YYYY-MM-DD. */
export function retentionWithin3Days(daysByUser: Map<number, string[]>, today: string): Retention {
  const toT = (d: string) => Date.parse(`${d}T00:00:00Z`);
  const todayT = toT(today);
  let eligible = 0;
  let returned = 0;
  for (const days of daysByUser.values()) {
    if (days.length === 0) continue;
    const sorted = [...new Set(days)].sort();
    const first = toT(sorted[0]);
    if ((todayT - first) / 86_400_000 < 3) continue;
    eligible += 1;
    if (sorted.slice(1).some((d) => (toT(d) - first) / 86_400_000 <= 3)) returned += 1;
  }
  return { eligible, returned };
}
