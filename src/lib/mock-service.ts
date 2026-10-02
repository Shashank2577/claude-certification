import "server-only";
import { getCert, getCertQuestions, getQuestionMap } from "./content";
import { XP, type Reward } from "./gamification";
import { matchScenario, mockXp, sampleMockQuestions, sampleScenarioMock, sanitizeMockState, scoreMock } from "./mock-core";
import type { MockState } from "./quiz-types";
import { recordActivity } from "./repo/activity";
import { recordAttempt } from "./repo/attempts";
import { createMockAttempt, getMockAttempt, markMockSubmitted, type MockAttempt } from "./repo/mock";

/** Time allowed for a mock: the real duration, scaled down when the bank is short. */
export function mockDurationMinutes(examMinutes: number, examCount: number, actualCount: number): number {
  if (actualCount >= examCount || examCount <= 0) return examMinutes;
  return Math.max(5, Math.round((examMinutes * actualCount) / examCount));
}

export async function startMockAttempt(userId: number, certId: string): Promise<MockAttempt | null> {
  const cert = getCert(certId);
  if (!cert) return null;
  const questions = getCertQuestions(cert.id);
  const count = cert.examInfo.questionCount;
  // Like the real exam: questions grouped under a few randomly chosen scenarios, when the bank allows it.
  const scenarios = cert.scenarios ?? [];
  const byScenario =
    scenarios.length > 0
      ? sampleScenarioMock(
          questions.map((q) => ({ id: q.id, domainId: q.domainId, scenarioId: matchScenario(q.scenario, scenarios) })),
          cert.domains,
          count,
        )
      : null;
  const ids = byScenario ?? sampleMockQuestions(questions, cert.domains, count);
  if (ids.length === 0) return null;
  const minutes = mockDurationMinutes(cert.examInfo.durationMinutes, cert.examInfo.questionCount, ids.length);
  return createMockAttempt(userId, cert.id, ids, minutes * 60_000);
}

export function optionMap(questionIds: string[]): Map<string, Set<string>> {
  const all = getQuestionMap();
  return new Map(questionIds.map((id) => [id, new Set(all.get(id)?.options.map((o) => o.id) ?? [])]));
}

/** Scores and closes an attempt exactly once. Returns null if it was already submitted. */
export async function finalizeMock(userId: number, attempt: MockAttempt, clientState?: Partial<MockState>): Promise<Reward | null> {
  if (attempt.status !== "in_progress") return null;
  const cert = getCert(attempt.certId);
  const qmap = getQuestionMap();
  const state = clientState ? sanitizeMockState(clientState, attempt.state, optionMap(attempt.state.questionIds)) : attempt.state;
  const result = scoreMock(state, qmap, cert?.domains ?? [], cert?.examInfo.passingScore ?? 720);
  const ok = await markMockSubmitted(userId, attempt.id, { state, ...result });
  if (!ok) return null;

  // Answered questions feed mastery like practice; skipped ones don't count against you twice.
  for (const p of result.perQuestion) {
    const q = qmap.get(p.id);
    const sel = state.answers[p.id];
    if (!q || !sel?.length) continue;
    await recordAttempt({
      userId,
      questionId: q.id,
      certId: q.certId,
      domainId: q.domainId,
      taskId: q.taskStatementId,
      selected: sel,
      correct: p.correct,
      ms: state.timeMs[p.id] ?? 0,
      mode: "mock",
      sessionId: attempt.id,
    });
  }
  const answered = result.perQuestion.filter((p) => (state.answers[p.id]?.length ?? 0) > 0).length;
  const minutes = Math.min((Date.now() - attempt.startedAt) / 60_000, (attempt.endsAt - attempt.startedAt) / 60_000 + 1);
  return recordActivity(userId, {
    kind: "mock",
    refId: attempt.id,
    xp: mockXp(answered, result.total, result.passed, XP.mockComplete, XP.mockPass),
    minutes,
    meta: { score: result.score, passed: result.passed ? 1 : 0, correct: result.correct, total: result.total, answered },
  });
}

/** Grace for network latency when the client auto-submits at zero. */
export const MOCK_GRACE_MS = 30_000;

export function getOwnedAttempt(userId: number, id: string) {
  return getMockAttempt(userId, id);
}

export function isMockExpired(attempt: Pick<MockAttempt, "endsAt">, now = Date.now()): boolean {
  return now > attempt.endsAt + MOCK_GRACE_MS;
}

export function serverNow(): number {
  return Date.now();
}
