"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import confetti from "canvas-confetti";
import { X } from "lucide-react";
import type { Reward } from "@/lib/gamification";
import { Modal } from "./ui/modal";
import { NamedIcon, TIER_COLORS } from "./ui/icon";
import { Button } from "./ui/button";

type Toast = { id: number; text: string; tone: "xp" | "goal" | "info" };
type Badge = Reward["achievements"][number];
type LevelUp = { level: number; name: string; badges: Badge[] };

interface Ctx {
  celebrate: (reward: Reward | null | undefined, opts?: { refresh?: boolean }) => void;
  toast: (text: string, tone?: Toast["tone"]) => void;
}

const CelebrateContext = createContext<Ctx>({ celebrate: () => {}, toast: () => {} });

/** How long the non-blocking badge card stays up. Restarts when more badges merge in. */
const BADGE_MS = 5000;

export function useCelebrate() {
  return useContext(CelebrateContext);
}

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function burst(kind: "small" | "big" = "small") {
  if (reducedMotion()) return;
  const colors = ["#f2a532", "#f07b1f", "#1d6b55", "#3550c4", "#ecebe4"];
  if (kind === "small") {
    void confetti({ particleCount: 60, spread: 70, startVelocity: 32, origin: { y: 0.7 }, colors, scalar: 0.9, disableForReducedMotion: true });
    return;
  }
  const end = Date.now() + 700;
  (function frame() {
    void confetti({ particleCount: 5, angle: 60, spread: 60, origin: { x: 0, y: 0.75 }, colors, disableForReducedMotion: true });
    void confetti({ particleCount: 5, angle: 120, spread: 60, origin: { x: 1, y: 0.75 }, colors, disableForReducedMotion: true });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}

function uniqueBadges(list: Badge[]) {
  const seen = new Set<string>();
  return list.filter((b) => (seen.has(b.id) ? false : (seen.add(b.id), true)));
}

/**
 * Rewards feedback. XP and goal toasts and badge unlocks are non-blocking (corner cards in a polite
 * live region) so they never cover what the learner is doing. Only a level-up opens a modal, and any
 * badges waiting at that moment are folded into it.
 */
export function CelebrationProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [badgeKey, setBadgeKey] = useState(0);
  const [levels, setLevels] = useState<LevelUp[]>([]);
  const nextId = useRef(1);
  // Mirrors of the queues so celebrate() can merge them without nesting state updaters.
  const badgesRef = useRef<Badge[]>([]);
  const levelsRef = useRef<LevelUp[]>([]);
  const updateBadges = useCallback((b: Badge[]) => {
    badgesRef.current = b;
    setBadges(b);
  }, []);
  const updateLevels = useCallback((l: LevelUp[]) => {
    levelsRef.current = l;
    setLevels(l);
  }, []);

  const toast = useCallback((text: string, tone: Toast["tone"] = "info") => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-3), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  const celebrate = useCallback<Ctx["celebrate"]>(
    (reward, opts) => {
      if (!reward) return;
      if (reward.xp > 0) toast(`+${reward.xp} XP`, "xp");
      if (reward.goalHit) toast("Daily goal reached", "goal");
      const q = levelsRef.current;
      if (reward.levelUp) {
        // Merge the waiting badge card and this reward's badges into the single level-up modal.
        const merged = uniqueBadges([...badgesRef.current, ...reward.achievements]);
        updateLevels([...q, { level: reward.levelUp.level, name: reward.levelUp.name, badges: merged }]);
        updateBadges([]);
      } else if (reward.achievements.length) {
        if (q.length) {
          // A level-up modal is already showing: fold new badges into it instead of a card.
          updateLevels([{ ...q[0], badges: uniqueBadges([...q[0].badges, ...reward.achievements]) }, ...q.slice(1)]);
        } else {
          updateBadges(uniqueBadges([...badgesRef.current, ...reward.achievements]));
          setBadgeKey((k) => k + 1);
        }
      }
      if (opts?.refresh !== false) router.refresh();
    },
    [router, toast, updateBadges, updateLevels],
  );

  // Auto-dismiss the badge card; a new badge restarts the clock.
  useEffect(() => {
    if (!badges.length) return;
    const t = setTimeout(() => updateBadges([]), BADGE_MS);
    return () => clearTimeout(t);
  }, [badges.length, badgeKey, updateBadges]);

  const current = levels[0];
  const currentLevel = current?.level;
  useEffect(() => {
    if (currentLevel != null) burst("big");
  }, [currentLevel]);
  const close = useCallback(() => updateLevels(levelsRef.current.slice(1)), [updateLevels]);
  const dismissBadges = useCallback(() => updateBadges([]), [updateBadges]);

  const value = useMemo(() => ({ celebrate, toast }), [celebrate, toast]);

  return (
    <CelebrateContext.Provider value={value}>
      {children}
      {/* Badge unlocks: top corner, below the header, clear of the answer feedback the learner is reading. */}
      <div aria-live="polite" className="pointer-events-none fixed top-16 right-3 left-3 z-[90] flex justify-end sm:left-auto sm:w-80 lg:top-[4.5rem] lg:right-6">
        <AnimatePresence>
          {badges.length ? <BadgeCard key="badges" badges={badges} onClose={dismissBadges} reduce={!!reduce} /> : null}
        </AnimatePresence>
      </div>
      <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-24 z-[90] flex flex-col items-end gap-2 lg:bottom-6">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout={!reduce}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.9 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.95 }}
              transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 28 }}
              className={
                t.tone === "xp"
                  ? "rounded-full bg-accent px-4 py-1.5 font-display text-sm font-bold text-accent-ink shadow-card tabular"
                  : t.tone === "goal"
                    ? "rounded-full bg-good px-4 py-1.5 text-sm font-semibold text-white shadow-card"
                    : "rounded-full bg-ink px-4 py-1.5 text-sm font-medium text-bg shadow-card"
              }
            >
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <Modal open={!!current} onClose={close} title="Level up">
        {current ? <LevelMoment item={current} onClose={close} reduce={!!reduce} /> : null}
      </Modal>
    </CelebrateContext.Provider>
  );
}

function BadgeCard({ badges, onClose, reduce }: { badges: Badge[]; onClose: () => void; reduce: boolean }) {
  const one = badges.length === 1 ? badges[0] : null;
  const color = one ? (TIER_COLORS[one.tier] ?? "var(--accent)") : "var(--accent)";
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.97 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
      transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 32 }}
      className="pointer-events-auto flex w-full max-w-full items-start gap-3 rounded-2xl border border-line bg-surface p-3 pr-1.5 shadow-card"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full" style={{ background: `color-mix(in oklab, ${color} 24%, transparent)` }} aria-hidden>
        <NamedIcon name={one?.icon ?? "Award"} size={20} className="text-ink" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted">
          {one ? `${one.tier[0].toUpperCase()}${one.tier.slice(1)} badge unlocked` : `${badges.length} badges unlocked`}
        </p>
        <p className="truncate font-display font-semibold" title={badges.map((b) => b.title).join(", ")}>
          {badges.map((b) => b.title).join(", ")}
        </p>
        <Link href="/achievements" onClick={onClose} className="mt-0.5 inline-flex min-h-8 items-center text-sm font-medium text-accent-text underline underline-offset-4">
          See achievements
        </Link>
      </div>
      <button type="button" onClick={onClose} className="grid size-11 shrink-0 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-ink" aria-label="Dismiss">
        <X size={16} />
      </button>
    </motion.div>
  );
}

function LevelMoment({ item, onClose, reduce }: { item: LevelUp; onClose: () => void; reduce: boolean }) {
  return (
    <div className="flex flex-col items-center pt-2 text-center">
      <motion.div
        initial={reduce ? false : { scale: 0.4, rotate: -20, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 14, delay: 0.05 }}
        className="relative grid size-28 place-items-center rounded-full"
        style={{ background: "color-mix(in oklab, var(--accent) 22%, transparent)" }}
      >
        {reduce ? (
          <div className="absolute inset-0 rounded-full border-2" style={{ borderColor: "var(--accent)" }} />
        ) : (
          <motion.div
            className="absolute inset-0 rounded-full border-2"
            style={{ borderColor: "var(--accent)" }}
            initial={{ scale: 1, opacity: 0.8 }}
            animate={{ scale: 1.35, opacity: 0 }}
            transition={{ duration: 1.4, repeat: 2, ease: "easeOut" }}
          />
        )}
        <span className="font-display text-5xl font-bold tabular" style={{ color: "var(--accent-text)" }}>
          {item.level}
        </span>
      </motion.div>
      <p className="mt-5 text-sm font-medium text-muted">You reached a new level</p>
      <p className="mt-1 font-display text-2xl font-semibold tracking-tight">{item.name}</p>
      {item.badges.length ? (
        <div className="mt-5 w-full">
          <p className="text-sm font-medium text-muted">{item.badges.length === 1 ? "Badge unlocked" : `${item.badges.length} badges unlocked`}</p>
          <ul className="mt-2 flex flex-col gap-2 text-left">
            {item.badges.map((b) => (
              <li key={b.id} className="flex items-center gap-3 rounded-xl bg-surface-2/70 px-3 py-2">
                <span
                  className="grid size-8 shrink-0 place-items-center rounded-full"
                  style={{ background: `color-mix(in oklab, ${TIER_COLORS[b.tier] ?? "var(--accent)"} 24%, transparent)` }}
                  aria-hidden
                >
                  <NamedIcon name={b.icon} size={16} className="text-ink" />
                </span>
                <span className="min-w-0">
                  <span className="block font-medium">{b.title}</span>
                  <span className="block text-xs text-ink-2">{b.description}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button variant="accent" onClick={onClose} data-autofocus>
          Keep going
        </Button>
        {item.badges.length ? (
          <Link href="/achievements" onClick={onClose} className="inline-flex h-10 items-center px-3 text-sm font-medium text-ink-2 underline underline-offset-4 hover:text-ink">
            See achievements
          </Link>
        ) : null}
      </div>
    </div>
  );
}
