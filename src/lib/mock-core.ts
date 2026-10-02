// Pure mock-exam helpers: question sampling and scoring.
import { shuffle } from "./adaptive";
import { allocateByWeight, isCorrect, scaledScore } from "./scoring";
import type { MockDomainResult, MockState } from "./quiz-types";

interface SampleQuestion {
  id: string;
  domainId: string;
}

/** Sample `count` question ids proportionally to domain weights, shuffled. */
export function sampleMockQuestions(
  questions: readonly SampleQuestion[],
  domains: readonly { id: string; weight: number }[],
  count: number,
  random: () => number = Math.random,
): string[] {
  const byDomain = new Map<string, SampleQuestion[]>();
  for (const q of questions) {
    const list = byDomain.get(q.domainId) ?? [];
    list.push(q);
    byDomain.set(q.domainId, list);
  }
  const alloc = allocateByWeight(
    domains.map((d) => ({ id: d.id, weight: d.weight, available: byDomain.get(d.id)?.length ?? 0 })),
    count,
  );
  const picked: string[] = [];
  for (const d of domains) {
    const pool = shuffle(byDomain.get(d.id) ?? [], random);
    picked.push(...pool.slice(0, alloc[d.id] ?? 0).map((q) => q.id));
  }
  return shuffle(picked, random);
}

const STOP = new Set(
  "a an and are as at be by for from has have in into is it its of on or that the this to using uses use with you your we our their they on its it's claude agent sdk system team build building built".split(" "),
);

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9/+-]+/g, " ")
      .split(/[\s/]+/)
      .filter((t) => t.length > 1 && !STOP.has(t)),
  );
}

export interface ScenarioRef {
  id: string;
  title: string;
  description: string;
}

/**
 * Map a question's free-text scenario onto one of the cert's scenarios.
 * Exact title mentions win; otherwise distinctive title words count triple, description words once.
 * Returns null when nothing clearly matches.
 */
export function matchScenario(text: string | undefined, scenarios: readonly ScenarioRef[]): string | null {
  if (!text || scenarios.length === 0) return null;
  const lower = text.toLowerCase();
  const byTitle = scenarios.find((sc) => lower.includes(sc.title.toLowerCase()));
  if (byTitle) return byTitle.id;
  const words = tokens(text);
  const scored = scenarios
    .map((sc) => {
      let score = 0;
      for (const t of tokens(sc.title)) if (words.has(t)) score += 3;
      for (const t of tokens(sc.description)) if (words.has(t)) score += 1;
      return { id: sc.id, score };
    })
    .sort((a, b) => b.score - a.score);
  const [best, second] = scored;
  if (!best || best.score < 4) return null;
  if (second && best.score - second.score < 2) return null;
  return best.id;
}

export const MOCK_SCENARIOS = 4;

/**
 * Real-exam style: pick `MOCK_SCENARIOS` scenarios at random and draw questions grouped by scenario,
 * spread evenly across them. Tops up with domain-weighted sampling if those scenarios run short.
 * Returns null when too few scenarios have questions, so callers fall back to domain sampling.
 */
export function sampleScenarioMock(
  questions: readonly (SampleQuestion & { scenarioId: string | null })[],
  domains: readonly { id: string; weight: number }[],
  count: number,
  random: () => number = Math.random,
): string[] | null {
  const byScenario = new Map<string, SampleQuestion[]>();
  for (const q of questions) {
    if (!q.scenarioId) continue;
    const list = byScenario.get(q.scenarioId) ?? [];
    list.push(q);
    byScenario.set(q.scenarioId, list);
  }
  if (byScenario.size < MOCK_SCENARIOS) return null;
  const chosen = shuffle([...byScenario.keys()], random).slice(0, MOCK_SCENARIOS);
  const alloc = allocateByWeight(
    chosen.map((id) => ({ id, weight: 1, available: byScenario.get(id)!.length })),
    count,
  );
  const picked: string[] = [];
  for (const id of chosen) {
    picked.push(...shuffle(byScenario.get(id)!, random).slice(0, alloc[id] ?? 0).map((q) => q.id));
  }
  if (picked.length < count) {
    const used = new Set(picked);
    const rest = questions.filter((q) => !used.has(q.id));
    picked.push(...sampleMockQuestions(rest, domains, count - picked.length, random));
  }
  return picked;
}

export interface MockScore {
  correct: number;
  total: number;
  score: number;
  passed: boolean;
  breakdown: MockDomainResult[];
  perQuestion: { id: string; correct: boolean }[];
}

export function scoreMock(
  state: MockState,
  questions: ReadonlyMap<string, { correct: string[]; domainId: string }>,
  domains: readonly { id: string; name: string; weight: number }[],
  passingScore: number,
): MockScore {
  const perQuestion = state.questionIds.map((id) => {
    const q = questions.get(id);
    return { id, correct: !!q && isCorrect(state.answers[id] ?? [], q.correct) };
  });
  const correct = perQuestion.filter((p) => p.correct).length;
  const total = state.questionIds.length;
  const score = scaledScore(correct, total);
  const breakdown = domains
    .map((d) => {
      const ids = state.questionIds.filter((id) => questions.get(id)?.domainId === d.id);
      return { domainId: d.id, name: d.name, weight: d.weight, total: ids.length, correct: perQuestion.filter((p) => p.correct && ids.includes(p.id)).length };
    })
    .filter((d) => d.total > 0);
  return { correct, total, score, passed: score >= passingScore, breakdown, perQuestion };
}

/** Clamp untrusted client state to the attempt's question set. */
export function sanitizeMockState(input: Partial<MockState>, base: MockState, validOptions: ReadonlyMap<string, Set<string>>): MockState {
  const ids = base.questionIds;
  const answers: Record<string, string[]> = {};
  for (const id of ids) {
    const sel = input.answers?.[id];
    const opts = validOptions.get(id);
    if (Array.isArray(sel) && opts) {
      const clean = [...new Set(sel.filter((s) => typeof s === "string" && opts.has(s)))];
      if (clean.length) answers[id] = clean;
    }
  }
  const timeMs: Record<string, number> = {};
  for (const id of ids) {
    const t = Number(input.timeMs?.[id] ?? base.timeMs[id] ?? 0);
    timeMs[id] = Number.isFinite(t) ? Math.max(0, Math.min(t, 4 * 3_600_000)) : 0;
  }
  const flags = Array.isArray(input.flags) ? input.flags.filter((f) => ids.includes(f)) : base.flags;
  const ci = Number(input.currentIndex);
  return {
    questionIds: ids,
    answers,
    flags: [...new Set(flags)],
    timeMs,
    currentIndex: Number.isInteger(ci) ? Math.max(0, Math.min(ids.length - 1, ci)) : base.currentIndex,
  };
}

/** Below this share of questions answered, finishing a mock earns no completion XP. */
export const MOCK_MIN_ANSWERED_SHARE = 0.25;

/**
 * XP for finishing a mock, scaled by how much of it was actually attempted so that
 * submitting a near-empty exam can't be farmed. The pass bonus is added on top.
 */
export function mockXp(answered: number, total: number, passed: boolean, completeXp: number, passXp: number): number {
  if (total <= 0) return 0;
  const share = Math.min(1, Math.max(0, answered) / total);
  const completion = share < MOCK_MIN_ANSWERED_SHARE ? 0 : Math.round(completeXp * share);
  return completion + (passed ? passXp : 0);
}
