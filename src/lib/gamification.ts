// XP, levels and achievement definitions. Pure; the server evaluates these against stats.

export const XP = {
  lessonComplete: 50,
  answerCorrect: 10,
  answerWrong: 3,
  perfectQuiz: 25,
  flashcardReview: 2,
  mockComplete: 150,
  mockPass: 100,
  focusSession: 25,
  dailyGoal: 30,
  resourceDone: 10,
  onboarding: 20,
} as const;

export const LEVEL_NAMES = [
  "Prompt Curious",
  "Token Counter",
  "Context Keeper",
  "Tool Wielder",
  "Loop Runner",
  "Schema Smith",
  "Orchestrator",
  "Subagent Whisperer",
  "Eval Engineer",
  "Systems Thinker",
  "Principal Architect",
  "Certified Legend",
] as const;

/** Total XP required to reach a level (level 1 = 0 XP). Gentle curve: early levels come fast. */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  const n = level - 1;
  return Math.round(120 * n + 40 * n * n);
}

export interface LevelInfo {
  level: number;
  name: string;
  xp: number;
  floor: number;
  ceiling: number;
  progress: number; // 0..1 toward next level
}

export function levelFor(xp: number): LevelInfo {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  const floor = xpForLevel(level);
  const ceiling = xpForLevel(level + 1);
  return {
    level,
    name: LEVEL_NAMES[Math.min(level - 1, LEVEL_NAMES.length - 1)],
    xp,
    floor,
    ceiling,
    progress: (xp - floor) / (ceiling - floor),
  };
}

export interface UserStats {
  lessonsCompleted: number;
  questionsAnswered: number;
  correctAnswers: number;
  perfectQuizzes: number;
  mockAttempts: number;
  mocksPassed: number;
  bestMockScore: number;
  currentStreak: number;
  flashcardReviews: number;
  focusSessions: number;
  resourcesDone: number;
  domainsCompleted: number;
  /** Local hour of the action that triggered evaluation. */
  hour: number;
  /** Days since the previous active day, measured at the triggering action. */
  gapDays: number;
  dailyGoalsHit: number;
}

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  icon: string; // lucide icon name, resolved by the client
  tier: "bronze" | "silver" | "gold";
  test: (s: UserStats) => boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "first-lesson", title: "First page turned", description: "Complete your first lesson.", icon: "BookOpen", tier: "bronze", test: (s) => s.lessonsCompleted >= 1 },
  { id: "ten-lessons", title: "Ten lessons deep", description: "Complete 10 lessons.", icon: "Library", tier: "silver", test: (s) => s.lessonsCompleted >= 10 },
  { id: "domain-done", title: "Domain cleared", description: "Finish every core lesson in a domain.", icon: "Flag", tier: "silver", test: (s) => s.domainsCompleted >= 1 },
  { id: "first-answer", title: "Off the blocks", description: "Answer your first practice question.", icon: "Zap", tier: "bronze", test: (s) => s.questionsAnswered >= 1 },
  { id: "hundred-questions", title: "Century", description: "Answer 100 practice questions.", icon: "Target", tier: "silver", test: (s) => s.questionsAnswered >= 100 },
  { id: "five-hundred-questions", title: "Question machine", description: "Answer 500 practice questions.", icon: "Cpu", tier: "gold", test: (s) => s.questionsAnswered >= 500 },
  { id: "perfect-quiz", title: "Clean sheet", description: "Score 100% on a quiz of five or more questions.", icon: "Sparkles", tier: "silver", test: (s) => s.perfectQuizzes >= 1 },
  { id: "streak-3", title: "Three in a row", description: "Study three days in a row.", icon: "Flame", tier: "bronze", test: (s) => s.currentStreak >= 3 },
  { id: "streak-7", title: "Full week", description: "Keep a seven-day streak.", icon: "Flame", tier: "silver", test: (s) => s.currentStreak >= 7 },
  { id: "streak-30", title: "Habit formed", description: "Keep a thirty-day streak.", icon: "Flame", tier: "gold", test: (s) => s.currentStreak >= 30 },
  { id: "first-mock", title: "Dress rehearsal", description: "Finish your first mock exam.", icon: "Timer", tier: "bronze", test: (s) => s.mockAttempts >= 1 },
  { id: "pass-mock", title: "Pass mark", description: "Score at or above the pass line on a mock exam.", icon: "Award", tier: "gold", test: (s) => s.mocksPassed >= 1 },
  { id: "mock-900", title: "Overprepared", description: "Score 900 or more on a mock exam.", icon: "Crown", tier: "gold", test: (s) => s.bestMockScore >= 900 },
  { id: "cards-50", title: "Card shark", description: "Review 50 flashcards.", icon: "Layers", tier: "bronze", test: (s) => s.flashcardReviews >= 50 },
  { id: "focus-1", title: "In the zone", description: "Finish a focus session.", icon: "Hourglass", tier: "bronze", test: (s) => s.focusSessions >= 1 },
  { id: "focus-10", title: "Deep worker", description: "Finish 10 focus sessions.", icon: "Hourglass", tier: "silver", test: (s) => s.focusSessions >= 10 },
  { id: "night-owl", title: "Night owl", description: "Study between midnight and 4 a.m.", icon: "Moon", tier: "bronze", test: (s) => s.hour >= 0 && s.hour < 4 },
  { id: "early-bird", title: "Early bird", description: "Study before 7 a.m.", icon: "Sunrise", tier: "bronze", test: (s) => s.hour >= 4 && s.hour < 7 },
  { id: "comeback", title: "Comeback", description: "Return after three or more days away.", icon: "RotateCcw", tier: "bronze", test: (s) => s.gapDays >= 3 },
  { id: "goal-5", title: "Goal getter", description: "Hit your daily goal on five days.", icon: "CircleCheck", tier: "silver", test: (s) => s.dailyGoalsHit >= 5 },
  { id: "reader", title: "Well read", description: "Mark five resources as done.", icon: "Bookmark", tier: "bronze", test: (s) => s.resourcesDone >= 5 },
];

export function achievementById(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

export function newlyUnlocked(stats: UserStats, owned: ReadonlySet<string>): AchievementDef[] {
  return ACHIEVEMENTS.filter((a) => !owned.has(a.id) && a.test(stats));
}

/** What the client needs to celebrate an action. */
export interface Reward {
  xp: number;
  totalXp: number;
  levelUp: { level: number; name: string } | null;
  achievements: { id: string; title: string; description: string; icon: string; tier: string }[];
  goalHit: boolean;
  streak: number;
}

export const EMPTY_REWARD: Reward = { xp: 0, totalXp: 0, levelUp: null, achievements: [], goalHit: false, streak: 0 };
