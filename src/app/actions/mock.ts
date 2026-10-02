"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import type { Reward } from "@/lib/gamification";
import { sanitizeMockState } from "@/lib/mock-core";
import { finalizeMock, MOCK_GRACE_MS, optionMap, startMockAttempt } from "@/lib/mock-service";
import type { MockState } from "@/lib/quiz-types";
import { abandonMockAttempt, getMockAttempt, inProgressAttempt, saveMockState } from "@/lib/repo/mock";

export async function startMock(certId: string): Promise<{ error: string } | never> {
  const user = await requireUser();
  const existing = await inProgressAttempt(user.id, certId);
  if (existing) redirect(`/mock/${existing.id}`);
  const attempt = await startMockAttempt(user.id, certId);
  if (!attempt) return { error: "There aren't any questions for this exam yet." };
  redirect(`/mock/${attempt.id}`);
}

/** Autosave. Returns the server's deadline so the client can correct clock drift. */
export async function saveMock(attemptId: string, state: Partial<MockState>): Promise<{ ok: boolean; endsAt?: number; expired?: boolean }> {
  const user = await requireUser();
  const attempt = await getMockAttempt(user.id, attemptId);
  if (!attempt || attempt.status !== "in_progress") return { ok: false };
  if (Date.now() > attempt.endsAt + MOCK_GRACE_MS) return { ok: false, expired: true, endsAt: attempt.endsAt };
  await saveMockState(user.id, attempt.id, sanitizeMockState(state, attempt.state, optionMap(attempt.state.questionIds)));
  return { ok: true, endsAt: attempt.endsAt };
}

export async function submitMock(attemptId: string, state: Partial<MockState>): Promise<{ reward: Reward | null; error?: string }> {
  const user = await requireUser();
  const attempt = await getMockAttempt(user.id, attemptId);
  if (!attempt) return { reward: null, error: "Attempt not found." };
  if (attempt.status !== "in_progress") return { reward: null };
  // After the deadline, only the last autosaved answers count.
  const late = Date.now() > attempt.endsAt + MOCK_GRACE_MS;
  const reward = await finalizeMock(user.id, attempt, late ? undefined : state);
  return { reward };
}

export async function abandonMock(attemptId: string) {
  const user = await requireUser();
  await abandonMockAttempt(user.id, attemptId);
  redirect("/mock");
}
