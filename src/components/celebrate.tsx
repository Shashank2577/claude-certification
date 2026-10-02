"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import confetti from "canvas-confetti";
import type { Reward } from "@/lib/gamification";
import { Modal } from "./ui/modal";
import { NamedIcon, TIER_COLORS } from "./ui/icon";
import { Button } from "./ui/button";

type Toast = { id: number; text: string; tone: "xp" | "goal" | "info" };
type Big = { kind: "level"; level: number; name: string } | { kind: "badge"; id: string; title: string; description: string; icon: string; tier: string };

interface Ctx {
  celebrate: (reward: Reward | null | undefined, opts?: { refresh?: boolean }) => void;
  toast: (text: string, tone?: Toast["tone"]) => void;
}

const CelebrateContext = createContext<Ctx>({ celebrate: () => {}, toast: () => {} });

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

export function CelebrationProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [queue, setQueue] = useState<Big[]>([]);
  const nextId = useRef(1);

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
      const big: Big[] = [];
      if (reward.levelUp) big.push({ kind: "level", ...reward.levelUp });
      for (const a of reward.achievements) big.push({ kind: "badge", ...a });
      if (big.length) setQueue((q) => [...q, ...big]);
      if (opts?.refresh !== false) router.refresh();
    },
    [router, toast],
  );

  const current = queue[0];
  useEffect(() => {
    if (current) burst("big");
  }, [current]);
  const close = useCallback(() => setQueue((q) => q.slice(1)), []);

  const value = useMemo(() => ({ celebrate, toast }), [celebrate, toast]);

  return (
    <CelebrateContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-24 z-[90] flex flex-col items-end gap-2 lg:bottom-6">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 14, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 420, damping: 28 }}
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
      <Modal open={!!current} onClose={close} title={current?.kind === "level" ? "Level up" : "Badge unlocked"}>
        {current ? <BigMoment item={current} onClose={close} /> : null}
      </Modal>
    </CelebrateContext.Provider>
  );
}

function BigMoment({ item, onClose }: { item: Big; onClose: () => void }) {
  const color = item.kind === "badge" ? (TIER_COLORS[item.tier] ?? "var(--accent)") : "var(--accent)";
  return (
    <div className="flex flex-col items-center pt-2 text-center">
      <motion.div
        initial={{ scale: 0.4, rotate: -20, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.05 }}
        className="relative grid size-28 place-items-center rounded-full"
        style={{ background: `color-mix(in oklab, ${color} 22%, transparent)` }}
      >
        <motion.div
          className="absolute inset-0 rounded-full border-2"
          style={{ borderColor: color }}
          initial={{ scale: 1, opacity: 0.8 }}
          animate={{ scale: 1.35, opacity: 0 }}
          transition={{ duration: 1.4, repeat: 2, ease: "easeOut" }}
        />
        {item.kind === "level" ? (
          <span className="font-display text-5xl font-bold tabular" style={{ color: "var(--accent-text)" }}>
            {item.level}
          </span>
        ) : (
          <NamedIcon name={item.icon} size={48} className="text-ink" />
        )}
      </motion.div>
      <p className="mt-5 text-sm font-medium text-muted">{item.kind === "level" ? "You reached a new level" : `${item.tier[0].toUpperCase()}${item.tier.slice(1)} badge unlocked`}</p>
      <p className="mt-1 font-display text-2xl font-semibold tracking-tight">{item.kind === "level" ? item.name : item.title}</p>
      {item.kind === "badge" ? <p className="mt-2 max-w-[32ch] text-ink-2">{item.description}</p> : null}
      <Button variant="accent" className="mt-6" onClick={onClose} data-autofocus>
        Keep going
      </Button>
    </div>
  );
}
