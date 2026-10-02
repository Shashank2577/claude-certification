"use server";

import { requireUser } from "@/lib/auth";
import { getCertFlashcards, getCerts } from "@/lib/content";
import { dayKey } from "@/lib/dates";
import { XP, type Reward } from "@/lib/gamification";
import { recordActivity } from "@/lib/repo/activity";
import { upsertReview } from "@/lib/repo/flashcards";
import { getSettings } from "@/lib/repo/settings";
import type { Grade } from "@/lib/sm2";

export async function gradeCard(cardId: string, grade: number, ms: number): Promise<Reward | null> {
  const user = await requireUser();
  if (![1, 2, 3, 4].includes(grade)) return null;
  const card = getCerts()
    .flatMap((c) => getCertFlashcards(c.id))
    .find((c) => c.id === cardId);
  if (!card) return null;
  const settings = await getSettings(user.id);
  const today = dayKey(Date.now(), settings.tz);
  const { isNew } = await upsertReview({ userId: user.id, cardId, certId: card.certId, domainId: card.domainId, grade: grade as Grade, today });
  const safeMs = Math.max(0, Math.min(Number(ms) || 0, 5 * 60_000));
  return await recordActivity(user.id, {
    kind: "flashcard",
    refId: cardId,
    xp: XP.flashcardReview,
    minutes: safeMs / 60_000,
    meta: { grade, isNew: isNew ? 1 : 0, certId: card.certId },
  });
}
