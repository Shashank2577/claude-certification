// Pure scoring helpers: scaled exam score, answer checking, domain mastery and readiness.

export const SCALE_MIN = 100;
export const SCALE_MAX = 1000;

/**
 * Map a raw fraction correct onto the 100–1000 reporting scale.
 * Anthropic does not publish its equating function, so this is a linear
 * approximation: 0% → 100, 100% → 1000, which puts the 720 pass line at ~68.9%.
 */
export function scaledScore(correct: number, total: number): number {
  if (total <= 0) return SCALE_MIN;
  const frac = Math.min(1, Math.max(0, correct / total));
  return Math.round(SCALE_MIN + (SCALE_MAX - SCALE_MIN) * frac);
}

/** Raw fraction needed to hit a given scaled score under the linear mapping. */
export function rawFractionFor(scaled: number): number {
  return (scaled - SCALE_MIN) / (SCALE_MAX - SCALE_MIN);
}

/** Exact set match: multi-select questions get no partial credit. */
export function isCorrect(selected: readonly string[], correct: readonly string[]): boolean {
  if (selected.length !== correct.length) return false;
  const s = new Set(selected);
  return correct.every((c) => s.has(c));
}

export interface AttemptSample {
  correct: boolean;
  /** Age of the attempt in days (0 = today). */
  ageDays: number;
}

const PRIOR = 0.25; // chance-level guess on a four-option question
const PRIOR_WEIGHT = 4;
const HALF_LIFE_DAYS = 14;

/**
 * Recency-weighted accuracy with a Bayesian prior toward chance.
 * Few attempts → close to 25%; many recent correct answers → close to 100%.
 */
export function domainMastery(attempts: readonly AttemptSample[]): number {
  let w = 0;
  let c = 0;
  for (const a of attempts) {
    const weight = Math.pow(0.5, Math.max(0, a.ageDays) / HALF_LIFE_DAYS);
    w += weight;
    if (a.correct) c += weight;
  }
  return (c + PRIOR * PRIOR_WEIGHT) / (w + PRIOR_WEIGHT);
}

export interface DomainReadinessInput {
  domainId: string;
  weight: number;
  mastery: number;
  attempts: number;
}

export interface Readiness {
  predicted: number;
  passProbabilityLabel: "not enough data" | "unlikely" | "borderline" | "likely" | "very likely";
  confidence: number; // 0..1, how much evidence backs the estimate
  /** Answers behind the estimate (all domains). */
  attempts: number;
  /** Fewer than READINESS_UNLOCK answers and no mock yet: show no number at all. */
  locked: boolean;
  /** Plausible score range, narrower as confidence grows. */
  low: number;
  high: number;
  /** "baseline" until there is real evidence, then "rough" and finally "predicted". */
  confidenceLabel: "baseline" | "rough" | "predicted";
  /** Whether a submitted mock was blended in. */
  fromMock: boolean;
}

export const READINESS_UNLOCK = 10;

export interface MockSample {
  /** Scaled 100–1000 score of the latest submitted mock. */
  score: number;
  ageDays: number;
}

const MOCK_WEIGHT = 0.5;

function clampScale(v: number) {
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, v));
}

/** Half-width of the range: ±150 with no evidence, ±30 at full confidence. Rounded to 10. */
export function readinessRange(predicted: number, confidence: number): { low: number; high: number } {
  const half = 30 + 120 * (1 - Math.min(1, Math.max(0, confidence)));
  return {
    low: clampScale(Math.floor((predicted - half) / 10) * 10),
    high: clampScale(Math.ceil((predicted + half) / 10) * 10),
  };
}

export function confidenceLabelFor(confidence: number): Readiness["confidenceLabel"] {
  if (confidence < 0.4) return "baseline";
  if (confidence < 0.75) return "rough";
  return "predicted";
}

/**
 * Predicted scaled score from exam-weighted domain mastery, optionally blended
 * with the latest submitted mock (weighted by recency, half-life 14 days).
 */
export function readiness(domains: readonly DomainReadinessInput[], passingScore = 720, mock?: MockSample | null): Readiness {
  const totalWeight = domains.reduce((s, d) => s + d.weight, 0) || 1;
  const frac = domains.reduce((s, d) => s + (d.weight / totalWeight) * d.mastery, 0);
  let predicted = Math.round(SCALE_MIN + (SCALE_MAX - SCALE_MIN) * frac);
  const attempts = domains.reduce((s, d) => s + d.attempts, 0);
  let confidence = Math.min(1, attempts / Math.max(30, domains.length * 10));
  const fromMock = !!mock && Number.isFinite(mock.score);
  if (mock && fromMock) {
    const decay = Math.pow(0.5, Math.max(0, mock.ageDays) / HALF_LIFE_DAYS);
    const w = MOCK_WEIGHT * decay;
    predicted = Math.round((1 - w) * predicted + w * clampScale(mock.score));
    confidence = Math.min(1, confidence + 0.3 * decay);
  }
  const locked = attempts < READINESS_UNLOCK && !fromMock;
  let label: Readiness["passProbabilityLabel"];
  if (locked) label = "not enough data";
  else if (predicted >= passingScore + 80) label = "very likely";
  else if (predicted >= passingScore + 20) label = "likely";
  else if (predicted >= passingScore - 40) label = "borderline";
  else label = "unlikely";
  const { low, high } = readinessRange(predicted, confidence);
  return { predicted, passProbabilityLabel: label, confidence, attempts, locked, low, high, confidenceLabel: confidenceLabelFor(confidence), fromMock };
}

/** Allocate n items across buckets proportionally to weight (largest remainder), capped by availability. */
export function allocateByWeight(
  buckets: readonly { id: string; weight: number; available: number }[],
  n: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of buckets) out[b.id] = 0;
  let remaining = Math.min(
    n,
    buckets.reduce((s, b) => s + b.available, 0),
  );
  // Repeat in case caps push leftover seats to other buckets.
  while (remaining > 0) {
    const open = buckets.filter((b) => out[b.id] < b.available);
    if (open.length === 0) break;
    const tw = open.reduce((s, b) => s + Math.max(b.weight, 0.0001), 0);
    const ideal = open.map((b) => ({ b, q: (Math.max(b.weight, 0.0001) / tw) * remaining }));
    let given = 0;
    for (const { b, q } of ideal) {
      const take = Math.min(Math.floor(q), b.available - out[b.id]);
      out[b.id] += take;
      given += take;
    }
    let left = remaining - given;
    const byRemainder = ideal
      .filter(({ b }) => out[b.id] < b.available)
      .sort((x, y) => (y.q - Math.floor(y.q)) - (x.q - Math.floor(x.q)) || y.b.weight - x.b.weight);
    for (const { b } of byRemainder) {
      if (left <= 0) break;
      out[b.id] += 1;
      left -= 1;
      given += 1;
    }
    if (given === 0) break;
    remaining -= given;
  }
  return out;
}
