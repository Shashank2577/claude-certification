"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { completeFocus } from "@/app/actions/focus";
import type { Reward } from "@/lib/gamification";
import { useCelebrate } from "./celebrate";
import { Modal } from "./ui/modal";
import { Button, ButtonLink } from "./ui/button";

export type FocusPhase = "idle" | "work" | "break" | "sprint";

interface FocusState {
  phase: FocusPhase;
  endsAt: number | null;
  /** Seconds left while paused. */
  pausedLeft: number | null;
  /** Length of the running block in minutes. */
  blockMinutes: number;
}

interface FocusCtx extends FocusState {
  secondsLeft: number;
  running: boolean;
  workMinutes: number;
  breakMinutes: number;
  start: (phase: Exclude<FocusPhase, "idle">, minutes?: number) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  setDurations: (work: number, rest: number) => void;
}

const KEY = "ccp-focus";
const IDLE: FocusState = { phase: "idle", endsAt: null, pausedLeft: null, blockMinutes: 0 };

const Ctx = createContext<FocusCtx | null>(null);

export function useFocus() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useFocus must be used inside FocusProvider");
  return c;
}

function load(): FocusState {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...IDLE, ...(JSON.parse(raw) as FocusState) } : IDLE;
  } catch {
    return IDLE;
  }
}

export function FocusProvider({ children, workMinutes: initialWork, breakMinutes: initialBreak }: { children: ReactNode; workMinutes: number; breakMinutes: number }) {
  const [state, setState] = useState<FocusState>(IDLE);
  const [now, setNow] = useState(() => Date.now());
  const [durations, setDur] = useState({ work: initialWork, rest: initialBreak });
  const [sprintDone, setSprintDone] = useState(false);
  const { celebrate, toast } = useCelebrate();
  const finishing = useRef<number | null>(null);
  const pendingReward = useRef<Reward | null>(null);
  const sprintOpen = useRef(false);

  // Restore after mount so server and client markup match.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrating from localStorage
    setState(load());
  }, []);

  useEffect(() => {
    // The initial IDLE sentinel means "not restored yet"; writing it would wipe a running timer.
    if (state === IDLE) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {}
  }, [state]);

  const running = state.phase !== "idle" && state.endsAt != null;
  const secondsLeft = state.pausedLeft != null ? state.pausedLeft : state.endsAt ? Math.max(0, Math.ceil((state.endsAt - now) / 1000)) : 0;

  const start = useCallback<FocusCtx["start"]>(
    (phase, minutes) => {
      const m = minutes ?? (phase === "work" ? durations.work : phase === "break" ? durations.rest : 5);
      setNow(Date.now());
      setState({ phase, endsAt: Date.now() + m * 60_000, pausedLeft: null, blockMinutes: m });
    },
    [durations],
  );

  const finish = useCallback(
    (s: FocusState) => {
      if (s.endsAt == null || finishing.current === s.endsAt) return;
      finishing.current = s.endsAt;
      if (s.phase === "work" || s.phase === "sprint") {
        completeFocus(s.blockMinutes, s.phase === "sprint" ? "sprint" : "pomodoro")
          .then((r) => {
            // The sprint has its own modal; hold badge/level modals until it is dismissed.
            if (s.phase === "sprint" && sprintOpen.current) pendingReward.current = r;
            else celebrate(r);
          })
          .catch(() => {});
      }
      if (s.phase === "work") {
        toast("Focus block done. Take a break.", "info");
        setState({ phase: "break", endsAt: Date.now() + durations.rest * 60_000, pausedLeft: null, blockMinutes: durations.rest });
      } else if (s.phase === "sprint") {
        setState({ ...IDLE });
        sprintOpen.current = true;
        setSprintDone(true);
      } else {
        toast("Break over. Ready for another block?", "info");
        setState({ ...IDLE });
      }
    },
    [celebrate, toast, durations],
  );

  // Tick while running; finishing is detected inside the tick callback.
  useEffect(() => {
    if (!running || state.pausedLeft != null) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (state.endsAt != null && t >= state.endsAt) finish(state);
    };
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [running, state, finish]);

  const closeSprint = useCallback(() => {
    sprintOpen.current = false;
    setSprintDone(false);
    const r = pendingReward.current;
    pendingReward.current = null;
    if (r) celebrate(r);
  }, [celebrate]);

  const value = useMemo<FocusCtx>(
    () => ({
      ...state,
      secondsLeft,
      running: running && state.pausedLeft == null,
      workMinutes: durations.work,
      breakMinutes: durations.rest,
      start,
      pause: () =>
        setState((s) => (s.endsAt && s.pausedLeft == null ? { ...s, pausedLeft: Math.max(0, Math.ceil((s.endsAt - Date.now()) / 1000)) } : s)),
      resume: () => setState((s) => (s.pausedLeft != null ? { ...s, endsAt: Date.now() + s.pausedLeft * 1000, pausedLeft: null } : s)),
      stop: () => setState({ ...IDLE }),
      setDurations: (work, rest) => setDur({ work, rest }),
    }),
    [state, secondsLeft, running, durations, start],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <Modal open={sprintDone} onClose={closeSprint} title="Five minutes done">
        <div className="pt-2">
          <p className="font-display text-2xl font-semibold tracking-tight">Five minutes done.</p>
          <p className="mt-2 text-ink-2">Starting was the hard part, and you did it. Most people find the next 20 minutes easier than the first five.</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button
              variant="accent"
              data-autofocus
              onClick={() => {
                closeSprint();
                start("work");
              }}
            >
              Keep going for {durations.work} minutes
            </Button>
            <ButtonLink href="/today" variant="ghost" onClick={closeSprint}>
              Stop here for today
            </ButtonLink>
          </div>
        </div>
      </Modal>
    </Ctx.Provider>
  );
}

export function formatClock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
