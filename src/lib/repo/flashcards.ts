import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDb, num } from "../db";
import { flashcardReviews } from "@/db/schema";
import { addDays } from "../dates";
import { NEW_CARD, review, type CardState, type Grade } from "../sm2";

export const NEW_CARDS_PER_DAY = 10;

export interface CardRow extends CardState {
  cardId: string;
  dueDay: string;
  lastGrade: number;
  reviewedAt: number;
}

export async function getCardStates(userId: number, certId: string): Promise<Map<string, CardRow>> {
  const db = await getDb();
  const rs = await db
    .select({
      cardId: flashcardReviews.cardId,
      ease: flashcardReviews.ease,
      interval: flashcardReviews.interval,
      reps: flashcardReviews.reps,
      lapses: flashcardReviews.lapses,
      dueDay: flashcardReviews.dueDay,
      lastGrade: flashcardReviews.lastGrade,
      reviewedAt: flashcardReviews.reviewedAt,
    })
    .from(flashcardReviews)
    .where(and(eq(flashcardReviews.userId, userId), eq(flashcardReviews.certId, certId)));
  return new Map(rs.map((r) => [r.cardId, r]));
}

async function cardState(userId: number, cardId: string): Promise<CardState | undefined> {
  const db = await getDb();
  const [r] = await db
    .select({ ease: flashcardReviews.ease, interval: flashcardReviews.interval, reps: flashcardReviews.reps, lapses: flashcardReviews.lapses })
    .from(flashcardReviews)
    .where(and(eq(flashcardReviews.userId, userId), eq(flashcardReviews.cardId, cardId)))
    .limit(1);
  return r;
}

export async function getCardState(userId: number, cardId: string): Promise<CardState> {
  return (await cardState(userId, cardId)) ?? NEW_CARD;
}

/** New cards introduced today for a cert (tracked through the activity log). */
export async function newCardsToday(userId: number, certId: string, today: string): Promise<number> {
  return num(
    sql`SELECT COUNT(*)::int n FROM activity_log
        WHERE user_id = ${userId} AND kind = 'flashcard' AND day = ${today}
          AND (meta->>'isNew')::int = 1 AND meta->>'certId' = ${certId}`,
  );
}

export async function upsertReview(input: {
  userId: number;
  cardId: string;
  certId: string;
  domainId: string;
  grade: Grade;
  today: string;
}): Promise<{ state: CardState; isNew: boolean }> {
  const existing = await cardState(input.userId, input.cardId);
  const next = review(existing ?? NEW_CARD, input.grade);
  const values = {
    ease: next.ease,
    interval: next.interval,
    reps: next.reps,
    lapses: next.lapses,
    dueDay: addDays(input.today, next.interval),
    lastGrade: input.grade,
    reviewedAt: Date.now(),
  };
  const db = await getDb();
  await db
    .insert(flashcardReviews)
    .values({ userId: input.userId, cardId: input.cardId, certId: input.certId, domainId: input.domainId, ...values })
    .onConflictDoUpdate({ target: [flashcardReviews.userId, flashcardReviews.cardId], set: values });
  return { state: next, isNew: !existing };
}
