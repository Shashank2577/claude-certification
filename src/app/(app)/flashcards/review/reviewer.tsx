"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { clsx } from "clsx";
import { RotateCcw } from "lucide-react";
import { gradeCard } from "@/app/actions/flashcards";
import { useCelebrate } from "@/components/celebrate";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/card";
import { Markdown } from "@/components/ui/markdown";
import { ProgressBar } from "@/components/ui/progress";
import type { SessionCard } from "@/lib/flashcard-deck";
import { GRADE_LABELS, type Grade } from "@/lib/sm2";

const GRADE_STYLE: Record<Grade, string> = {
  1: "border-bad/40 hover:bg-bad-soft",
  2: "border-line-strong hover:bg-surface-2",
  3: "border-good/40 hover:bg-good-soft",
  4: "border-info/40 hover:bg-info-soft",
};

function interval(days: number) {
  if (days <= 1) return "1 day";
  if (days < 30) return `${days} days`;
  const months = Math.round(days / 30);
  return `${months} mo`;
}

export function Reviewer({ cards, domains }: { cards: SessionCard[]; domains: Record<string, { name: string; color: string }> }) {
  const router = useRouter();
  const { celebrate } = useCelebrate();
  const [queue, setQueue] = useState(cards);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [counts, setCounts] = useState<Record<Grade, number>>({ 1: 0, 2: 0, 3: 0, 4: 0 });
  const [xp, setXp] = useState(0);
  const shownAt = useRef(0);
  const doneRef = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const cardButton = useRef<HTMLButtonElement>(null);
  const firstCard = useRef(true);

  const card = queue[index];
  const finished = index >= queue.length;

  useEffect(() => {
    shownAt.current = Date.now();
    // After rating, the grade buttons unmount; move focus to the next card (or the summary) instead of <body>.
    if (firstCard.current) {
      firstCard.current = false;
      return;
    }
    heading.current?.focus({ preventScroll: true });
  }, [index]);

  const reveal = () => {
    setFlipped(true);
    // The "Show answer" button unmounts on reveal; keep focus on the card.
    requestAnimationFrame(() => cardButton.current?.focus({ preventScroll: true }));
  };

  useEffect(() => {
    if (finished && queue.length > 0 && !doneRef.current) {
      doneRef.current = true;
      router.refresh();
    }
  }, [finished, queue.length, router]);

  const grade = useCallback(
    (g: Grade) => {
      if (!card || !flipped) return;
      const ms = Date.now() - shownAt.current;
      setCounts((c) => ({ ...c, [g]: c[g] + 1 }));
      // Failed cards come back once more at the end of this session.
      if (g === 1) setQueue((q) => [...q, { ...card, isNew: false, hints: { ...card.hints } }]);
      setFlipped(false);
      setIndex((i) => i + 1);
      gradeCard(card.id, g, ms)
        .then((r) => {
          if (!r) return;
          setXp((x) => x + r.xp);
          // Per-card XP stays quiet; big moments (badges, levels, goal) still celebrate.
          if (r.levelUp || r.achievements.length || r.goalHit) celebrate({ ...r, xp: 0 }, { refresh: false });
        })
        .catch(() => {});
    },
    [card, flipped, celebrate],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === "Space") {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (["1", "2", "3", "4"].includes(e.key)) {
        grade(Number(e.key) as Grade);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [grade]);

  if (queue.length === 0) {
    return (
      <EmptyState
        title="Nothing to review right now"
        body="All cards in this deck are scheduled for later. Come back tomorrow, or practise questions in the meantime."
        action={
          <div className="flex gap-2">
            <ButtonLink href="/practice">Practise questions</ButtonLink>
            <ButtonLink href="/flashcards" variant="outline">
              All decks
            </ButtonLink>
          </div>
        }
      />
    );
  }

  if (finished) {
    const total = counts[1] + counts[2] + counts[3] + counts[4];
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-lg rounded-3xl border border-line bg-surface p-8 text-center shadow-card">
        <h2 ref={heading} tabIndex={-1} className="font-display text-3xl font-semibold tracking-tight outline-none">
          Session done
        </h2>
        <p className="mt-2 text-ink-2">
          {total} review{total === 1 ? "" : "s"}, +{xp} XP. Cards you missed will come back tomorrow.
        </p>
        <dl className="mt-6 grid grid-cols-4 gap-2">
          {([1, 2, 3, 4] as Grade[]).map((g) => (
            <div key={g} className="rounded-xl bg-surface-2 px-2 py-3">
              <dt className="text-xs text-muted">{GRADE_LABELS[g]}</dt>
              <dd className="font-display text-xl font-semibold tabular">{counts[g]}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-7 flex flex-wrap justify-center gap-2">
          <ButtonLink href="/flashcards" variant="accent">
            Back to decks
          </ButtonLink>
          <ButtonLink href="/today" variant="outline">
            Today’s plan
          </ButtonLink>
        </div>
      </motion.div>
    );
  }

  const dom = domains[card.domainId];
  return (
    <div className="mx-auto max-w-2xl">
      <h2 ref={heading} tabIndex={-1} className="sr-only">
        Card {index + 1} of {queue.length}
      </h2>
      <p className="sr-only" aria-live="polite">
        {flipped ? "Answer shown" : ""}
      </p>
      <div className="mb-4 flex items-center gap-3">
        <ProgressBar value={index / queue.length} label="Session progress" height={6} />
        <span className="shrink-0 text-sm text-muted tabular">
          {index + 1} / {queue.length}
        </span>
      </div>

      <div className="[perspective:1400px]">
        <AnimatePresence mode="wait">
          <motion.div key={`${card.id}-${index}`} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.2 }}>
            <motion.button
              ref={cardButton}
              type="button"
              onClick={() => setFlipped((f) => !f)}
              aria-label={flipped ? "Show question side" : "Show answer side"}
              className="relative block min-h-[18rem] w-full text-left [transform-style:preserve-3d] sm:min-h-[20rem]"
              animate={{ rotateY: flipped ? 180 : 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 26 }}
            >
              <Face side="front" hidden={flipped}>
                <CardMeta dom={dom} isNew={card.isNew} />
                <p className="mt-6 font-display text-2xl leading-snug font-semibold tracking-tight sm:text-[1.75rem]">{card.front}</p>
                <p className="mt-auto pt-8 text-sm text-muted">Press Space or tap to reveal</p>
              </Face>
              <Face side="back" hidden={!flipped}>
                <CardMeta dom={dom} isNew={card.isNew} />
                <p className="mt-4 text-sm text-muted">{card.front}</p>
                <div className="mt-3 text-lg">
                  <Markdown>{card.back}</Markdown>
                </div>
              </Face>
            </motion.button>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-5 min-h-[4.5rem]">
        {flipped ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="How well did you recall it?">
            {([1, 2, 3, 4] as Grade[]).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => grade(g)}
                className={clsx("flex flex-col items-center rounded-xl border bg-surface px-3 py-2.5 transition-colors active:scale-[0.97]", GRADE_STYLE[g])}
              >
                <span className="font-medium">
                  <kbd className="mr-1.5 font-mono text-xs text-muted">{g}</kbd>
                  {GRADE_LABELS[g]}
                </span>
                <span className="text-xs text-muted">{interval(card.hints[g])}</span>
              </button>
            ))}
          </motion.div>
        ) : (
          <Button variant="primary" size="lg" className="w-full" onClick={reveal}>
            <RotateCcw size={16} /> Show answer
          </Button>
        )}
      </div>
    </div>
  );
}

function Face({ side, hidden, children }: { side: "front" | "back"; hidden: boolean; children: React.ReactNode }) {
  return (
    <div
      aria-hidden={hidden}
      className={clsx(
        "absolute inset-0 flex flex-col rounded-3xl border border-line bg-surface p-6 shadow-card [backface-visibility:hidden] sm:p-8",
        side === "back" && "[transform:rotateY(180deg)] overflow-y-auto",
      )}
    >
      {children}
    </div>
  );
}

function CardMeta({ dom, isNew }: { dom?: { name: string; color: string }; isNew: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted">
      {dom ? <span className="size-2 rounded-full" style={{ background: dom.color }} aria-hidden /> : null}
      <span className="truncate">{dom?.name}</span>
      {isNew ? <span className="ml-auto rounded-full bg-info-soft px-2 py-0.5 font-medium text-info">New</span> : null}
    </div>
  );
}
