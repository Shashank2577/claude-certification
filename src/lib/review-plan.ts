import "server-only";

import { buildDeck } from "./flashcard-deck";
import { getCertLessons, getQuestionMap } from "./content";
import type { Cert } from "./content-types";
import { currentMistakes, domainStats } from "./repo/attempts";
import { getMockAttempt, listMockAttempts } from "./repo/mock";
import type { MockAttempt } from "./repo/mock";

export interface ReviewTask {
  id: "mistakes" | "cards" | "weak-domain" | "lesson";
  title: string;
  reason: string;
  href: string;
  count?: number;
  minutes: number;
}

export interface ReviewPlan {
  tasks: ReviewTask[];
  mock: { id: string; score: number; domain: string } | null;
}

function weakestDomain(attempt: MockAttempt | null, cert: Cert) {
  if (!attempt?.breakdown.length) return null;
  const weakest = [...attempt.breakdown]
    .filter((d) => d.total > 0 && cert.domains.some((c) => c.id === d.domainId))
    .sort((a, b) => a.correct / a.total - b.correct / b.total || b.total - a.total)[0];
  return weakest ? cert.domains.find((d) => d.id === weakest.domainId) ?? null : null;
}

/** A short, actionable queue built from existing study state. No score or completion is inferred from a page view. */
export async function buildReviewPlan(userId: number, cert: Cert, tz: string, mockId?: string): Promise<ReviewPlan> {
  const [mistakeIds, deck, stats, mocks] = await Promise.all([
    currentMistakes(userId),
    buildDeck(userId, cert, tz),
    domainStats(userId, cert.id, cert.domains.map((d) => d.id)),
    listMockAttempts(userId, cert.id),
  ]);
  const selectedMock = mockId ? await getMockAttempt(userId, mockId) : null;
  const mock = selectedMock?.certId === cert.id && selectedMock.status === "submitted"
    ? selectedMock
    : mocks.find((m) => m.status === "submitted") ?? null;
  const questions = getQuestionMap();
  const mistakes = mistakeIds.filter((id) => questions.get(id)?.certId === cert.id);
  const tasks: ReviewTask[] = [];

  if (mistakes.length) tasks.push({
    id: "mistakes",
    title: `Retry ${Math.min(5, mistakes.length)} missed question${mistakes.length === 1 ? "" : "s"}`,
    reason: "These were wrong on your most recent attempt. A correct retry clears each one from this queue.",
    href: "/practice?mode=mistakes",
    count: mistakes.length,
    minutes: 5,
  });
  if (deck.totalDue) tasks.push({
    id: "cards",
    title: `Review ${Math.min(5, deck.totalDue)} due card${deck.totalDue === 1 ? "" : "s"}`,
    reason: "These cards are due for spaced review today.",
    href: "/flashcards/review",
    count: deck.totalDue,
    minutes: 5,
  });

  const mockDomain = weakestDomain(mock, cert);
  const weakest = mockDomain ?? cert.domains
    .map((d) => ({ domain: d, stat: stats.find((s) => s.domainId === d.id) }))
    .filter((x) => (x.stat?.attempts ?? 0) >= 3)
    .sort((a, b) => (a.stat?.mastery ?? 1) - (b.stat?.mastery ?? 1))[0]?.domain;
  if (weakest) tasks.push({
    id: "weak-domain",
    title: `Practise ${weakest.name}`,
    reason: mockDomain ? "This was your weakest area in the mock. Try a short targeted set." : "Your recent answers show room to improve here.",
    href: `/practice?mode=domain&domain=${encodeURIComponent(weakest.id)}`,
    minutes: 8,
  });

  if (!tasks.length) {
    const lesson = getCertLessons(cert.id)[0];
    if (lesson) tasks.push({
      id: "lesson",
      title: `Start with ${lesson.title}`,
      reason: "A short lesson will give you a base before review becomes useful.",
      href: `/learn/${cert.id}/${lesson.domainId}/${lesson.id}`,
      minutes: Math.min(10, lesson.estMinutes),
    });
  }
  return { tasks: tasks.slice(0, 3), mock: mock && mockDomain ? { id: mock.id, score: mock.score ?? 0, domain: mockDomain.name } : null };
}
