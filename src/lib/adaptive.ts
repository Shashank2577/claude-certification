// Adaptive question selection: favour weak domains, unseen questions and past mistakes.

export interface CandidateQuestion {
  id: string;
  domainId: string;
  taskStatementId: string;
  difficulty: number;
}

export interface QuestionHistory {
  attempts: number;
  lastCorrect: boolean;
  /** Days since the last attempt. */
  lastAgeDays: number;
  everWrong: boolean;
  flagged?: boolean;
}

export interface SelectOptions {
  count: number;
  /** domainId → mastery 0..1 */
  mastery: Record<string, number>;
  history: Record<string, QuestionHistory>;
  /** Injectable for tests; defaults to Math.random. */
  random?: () => number;
}

export function priority(q: CandidateQuestion, opts: SelectOptions): number {
  const h = opts.history[q.id];
  const weakness = 1 - (opts.mastery[q.domainId] ?? 0.25);
  let score = weakness * 3;
  if (!h) {
    score += 3;
  } else {
    if (!h.lastCorrect) score += 4;
    else if (h.everWrong) score += 1.5;
    // Recently answered correctly → push back; it decays over ~a week.
    if (h.lastCorrect) score -= 2 * Math.max(0, 1 - h.lastAgeDays / 7);
    if (h.flagged) score += 1;
  }
  return score;
}

/**
 * Pick `count` questions by priority, with jitter so sessions vary and
 * a soft penalty for repeating the same task statement back to back.
 */
export function selectAdaptive<T extends CandidateQuestion>(pool: readonly T[], opts: SelectOptions): T[] {
  const rand = opts.random ?? Math.random;
  const scored = pool.map((q) => ({ q, s: priority(q, opts) + rand() * 1.5 }));
  scored.sort((a, b) => b.s - a.s);
  const picked: T[] = [];
  const perTask = new Map<string, number>();
  const rest = [...scored];
  while (picked.length < opts.count && rest.length > 0) {
    let bestIdx = 0;
    let best = -Infinity;
    for (let i = 0; i < rest.length; i++) {
      const used = perTask.get(rest[i].q.taskStatementId) ?? 0;
      const adj = rest[i].s - used * 1.25;
      if (adj > best) {
        best = adj;
        bestIdx = i;
      }
    }
    const [{ q }] = rest.splice(bestIdx, 1);
    picked.push(q);
    perTask.set(q.taskStatementId, (perTask.get(q.taskStatementId) ?? 0) + 1);
  }
  return picked;
}

export function shuffle<T>(arr: readonly T[], random: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
