"use server";

import { requireUser } from "@/lib/auth";
import { getCert, getCertQuestions, getQuestion } from "@/lib/content";
import { toPublicQuestion, type PublicQuestion } from "@/lib/content-types";
import { selectAdaptive } from "@/lib/adaptive";
import { XP, type Reward } from "@/lib/gamification";
import { isCorrect } from "@/lib/scoring";
import type { AnswerFeedback, PracticeMode } from "@/lib/quiz-types";
import {
  bumpQuizSession,
  createQuizSession,
  currentMistakes,
  domainStats,
  finishQuizSession,
  getFlags,
  getQuizSession,
  questionHistory,
  recordAttempt,
  setFlag,
} from "@/lib/repo/attempts";
import { recordActivity } from "@/lib/repo/activity";
import { num } from "@/lib/db";
import { sql } from "drizzle-orm";

const MODES: PracticeMode[] = ["adaptive", "domain", "task", "weak", "mistakes", "flagged"];

export async function startPractice(input: {
  mode: PracticeMode;
  certId: string;
  domainId?: string;
  taskId?: string;
  count: number;
}): Promise<{ sessionId: string; questions: PublicQuestion[] } | { error: string }> {
  const user = await requireUser();
  const cert = getCert(input.certId);
  if (!cert) return { error: "That exam isn't available." };
  const mode = MODES.includes(input.mode) ? input.mode : "adaptive";
  const count = Math.max(1, Math.min(50, Math.round(Number(input.count) || 10)));

  const all = getCertQuestions(cert.id);
  const stats = await domainStats(user.id, cert.id, cert.domains.map((d) => d.id));
  const mastery = Object.fromEntries(stats.map((s) => [s.domainId, s.mastery]));
  const history = await questionHistory(user.id);

  let pool = all;
  if (mode === "domain") pool = all.filter((q) => q.domainId === input.domainId);
  else if (mode === "task") pool = all.filter((q) => q.taskStatementId === input.taskId);
  else if (mode === "weak") {
    // Weakest domains first; take enough domains to fill the session comfortably.
    const ranked = [...stats].sort((a, b) => a.mastery - b.mastery);
    const chosen: string[] = [];
    let size = 0;
    for (const s of ranked) {
      chosen.push(s.domainId);
      size += all.filter((q) => q.domainId === s.domainId).length;
      if (chosen.length >= 2 && size >= count * 2) break;
    }
    pool = all.filter((q) => chosen.includes(q.domainId));
  } else if (mode === "mistakes") {
    const ids = new Set(await currentMistakes(user.id));
    pool = all.filter((q) => ids.has(q.id));
  } else if (mode === "flagged") {
    const ids = new Set(await getFlags(user.id));
    pool = all.filter((q) => ids.has(q.id));
  }

  if (pool.length === 0) return { error: "No questions match that choice yet." };
  const picked = selectAdaptive(pool, { count, mastery, history });
  const sessionId = await createQuizSession(user.id, mode, { domainId: input.domainId, taskId: input.taskId, certId: cert.id }, picked.map((q) => q.id));
  return { sessionId, questions: picked.map(toPublicQuestion) };
}

export async function answerQuestion(input: {
  questionId: string;
  selected: string[];
  ms: number;
  mode: "practice" | "lesson-check";
  sessionId?: string | null;
}): Promise<AnswerFeedback | { error: string }> {
  const user = await requireUser();
  const q = getQuestion(input.questionId);
  if (!q) return { error: "Question not found." };
  const valid = new Set(q.options.map((o) => o.id));
  const selected = [...new Set((input.selected ?? []).filter((s) => valid.has(s)))];
  if (selected.length === 0) return { error: "Pick an answer first." };

  let sessionId: string | null = null;
  if (input.sessionId) {
    const s = await getQuizSession(user.id, input.sessionId);
    if (!s || s.finishedAt) return { error: "This practice session has ended." };
    const ids = s.questionIds;
    if (!ids.includes(q.id)) return { error: "That question isn't part of this session." };
    // One scored answer per question per session.
    const already = (await num(sql`SELECT COUNT(*)::int n FROM question_attempts WHERE user_id = ${user.id} AND session_id = ${s.id} AND question_id = ${q.id}`)) > 0;
    if (already) return { error: "You already answered this one." };
    sessionId = s.id;
  }

  const correct = isCorrect(selected, q.correct);
  const ms = Math.max(0, Math.min(Number(input.ms) || 0, 30 * 60_000));
  await recordAttempt({
    userId: user.id,
    questionId: q.id,
    certId: q.certId,
    domainId: q.domainId,
    taskId: q.taskStatementId,
    selected,
    correct,
    ms,
    mode: input.mode === "lesson-check" ? "lesson-check" : "practice",
    sessionId,
  });
  if (sessionId) await bumpQuizSession(sessionId, correct);
  const reward = await recordActivity(user.id, {
    kind: "answer",
    refId: q.id,
    xp: correct ? XP.answerCorrect : XP.answerWrong,
    minutes: ms / 60_000,
    meta: { correct: correct ? 1 : 0, mode: input.mode },
  });
  return { correct, correctIds: q.correct, explanation: q.explanation, whyWrong: q.whyWrong, mindset: q.mindset, reward };
}

export async function toggleFlag(questionId: string, flagged: boolean): Promise<void> {
  const user = await requireUser();
  if (!getQuestion(questionId)) return;
  await setFlag(user.id, questionId, !!flagged);
}

export async function finishPractice(sessionId: string): Promise<Reward | null> {
  const user = await requireUser();
  const s = await getQuizSession(user.id, sessionId);
  if (!s || s.finishedAt || s.answered === 0) {
    if (s && !s.finishedAt) await finishQuizSession(s.id);
    return null;
  }
  // Only the request that actually closes the session awards, so double submits can't double-pay.
  if (!(await finishQuizSession(s.id))) return null;
  const perfect = s.answered >= 5 && s.correct === s.answered;
  return await recordActivity(user.id, {
    kind: "quiz",
    refId: s.id,
    xp: perfect ? XP.perfectQuiz : 0,
    meta: { perfect: perfect ? 1 : 0, answered: s.answered, correct: s.correct, mode: s.mode },
  });
}
