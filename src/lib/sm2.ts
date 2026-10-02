// SM-2 spaced repetition, adapted to four buttons (Again / Hard / Good / Easy).

export type Grade = 1 | 2 | 3 | 4;

export interface CardState {
  ease: number; // easiness factor, >= 1.3
  interval: number; // days
  reps: number; // consecutive successful reviews
  lapses: number;
}

export const NEW_CARD: CardState = { ease: 2.5, interval: 0, reps: 0, lapses: 0 };

export const GRADE_LABELS: Record<Grade, string> = { 1: "Again", 2: "Hard", 3: "Good", 4: "Easy" };

/** Button → SM-2 quality (0–5). */
export function gradeToQuality(grade: Grade): number {
  return { 1: 1, 2: 3, 3: 4, 4: 5 }[grade];
}

export function review(state: CardState, grade: Grade): CardState {
  const q = gradeToQuality(grade);
  const ease = Math.max(1.3, state.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  if (q < 3) {
    // Failed recall: relearn from the start, see it again tomorrow.
    return { ease, interval: 1, reps: 0, lapses: state.lapses + 1 };
  }
  const reps = state.reps + 1;
  let interval: number;
  if (reps === 1) interval = grade === 4 ? 3 : 1;
  else if (reps === 2) interval = grade === 4 ? 8 : 6;
  else interval = Math.round(state.interval * ease * (grade === 2 ? 0.8 : grade === 4 ? 1.3 : 1));
  return { ease, interval: Math.max(1, interval), reps, lapses: state.lapses };
}

/** Preview of the next interval for each button, for the grade buttons' hints. */
export function previewIntervals(state: CardState): Record<Grade, number> {
  return {
    1: review(state, 1).interval,
    2: review(state, 2).interval,
    3: review(state, 3).interval,
    4: review(state, 4).interval,
  };
}
