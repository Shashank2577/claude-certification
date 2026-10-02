import "server-only";
import { getCertFlashcards } from "./content";
import type { Cert, FlashcardRef } from "./content-types";
import { dayKey } from "./dates";
import { getCardStates, newCardsToday, NEW_CARDS_PER_DAY } from "./repo/flashcards";
import { previewIntervals, NEW_CARD, type Grade } from "./sm2";

export interface DeckSummary {
  domainId: string;
  name: string;
  color: string;
  total: number;
  due: number;
  fresh: number;
  learned: number;
}

export interface SessionCard {
  id: string;
  domainId: string;
  front: string;
  back: string;
  isNew: boolean;
  hints: Record<Grade, number>;
}

/** Per-domain counts plus today's queue: due cards first, then new cards up to the daily allowance. */
export async function buildDeck(userId: number, cert: Cert, tz: string, domainId?: string, now = Date.now()) {
  const today = dayKey(now, tz);
  const cards = getCertFlashcards(cert.id);
  const [states, introduced] = await Promise.all([getCardStates(userId, cert.id), newCardsToday(userId, cert.id, today)]);
  const newLeft = Math.max(0, NEW_CARDS_PER_DAY - introduced);

  const summaries: DeckSummary[] = cert.domains.map((d) => {
    const dc = cards.filter((c) => c.domainId === d.id);
    let due = 0;
    let learned = 0;
    let fresh = 0;
    for (const c of dc) {
      const s = states.get(c.id);
      if (!s) fresh++;
      else {
        if (s.dueDay <= today) due++;
        if (s.reps >= 2 && s.interval >= 6) learned++;
      }
    }
    return { domainId: d.id, name: d.name, color: d.color, total: dc.length, due, fresh, learned };
  });

  const scope = domainId ? cards.filter((c) => c.domainId === domainId) : cards;
  const due: FlashcardRef[] = [];
  const fresh: FlashcardRef[] = [];
  for (const c of scope) {
    const s = states.get(c.id);
    if (!s) fresh.push(c);
    else if (s.dueDay <= today) due.push(c);
  }
  due.sort((a, b) => (states.get(a.id)!.dueDay < states.get(b.id)!.dueDay ? -1 : 1));
  const queue: SessionCard[] = [...due, ...fresh.slice(0, newLeft)].map((c) => {
    const s = states.get(c.id);
    return {
      id: c.id,
      domainId: c.domainId,
      front: c.front,
      back: c.back,
      isNew: !s,
      hints: previewIntervals(s ?? NEW_CARD),
    };
  });

  return { summaries, queue, newLeft, totalDue: summaries.reduce((s, d) => s + d.due, 0) };
}
