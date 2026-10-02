"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { clsx } from "clsx";
import { ChevronLeft, ChevronRight, Clock, Flag, Grid3x3, Loader2 } from "lucide-react";
import type { PublicQuestion } from "@/lib/content-types";
import type { MockState } from "@/lib/quiz-types";
import { saveMock, submitMock } from "@/app/actions/mock";
import { useCelebrate } from "@/components/celebrate";
import { QuestionCard } from "@/components/quiz/question-card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

function clock(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

export function MockRunner({
  attemptId,
  certName,
  questions,
  domainNames,
  initialState,
  endsAt,
  serverNow,
}: {
  attemptId: string;
  certName: string;
  questions: PublicQuestion[];
  domainNames: Record<string, string>;
  initialState: MockState;
  endsAt: number;
  serverNow: number;
}) {
  const router = useRouter();
  const { celebrate } = useCelebrate();
  const [answers, setAnswers] = useState<Record<string, string[]>>(initialState.answers ?? {});
  const [flags, setFlags] = useState<string[]>(initialState.flags ?? []);
  const [index, setIndex] = useState(Math.min(initialState.currentIndex ?? 0, Math.max(0, questions.length - 1)));
  const [now, setNow] = useState(serverNow);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "offline">("saved");
  // Roving tab stop inside the question navigator.
  const [navFocus, setNavFocus] = useState(index);
  const heading = useRef<HTMLHeadingElement>(null);

  // Server clock offset so the countdown matches the deadline the server enforces.
  const offset = useRef(0);
  const timeMs = useRef<Record<string, number>>({ ...(initialState.timeMs ?? {}) });
  const qStart = useRef(0);
  const submitted = useRef(false);

  useEffect(() => {
    offset.current = serverNow - Date.now();
    qStart.current = Date.now();
    const t = setInterval(() => setNow(Date.now() + offset.current), 500);
    return () => clearInterval(t);
  }, [serverNow]);

  const remaining = endsAt - now;
  const q = questions[index];

  const commitTime = useCallback(() => {
    const id = questions[index]?.id;
    if (!id || !qStart.current) return;
    const t = Date.now();
    timeMs.current[id] = (timeMs.current[id] ?? 0) + (t - qStart.current);
    qStart.current = t;
  }, [questions, index]);

  // Latest state for autosave callbacks.
  const latest = useRef<MockState>({ questionIds: [], answers, flags, timeMs: {}, currentIndex: index });
  useEffect(() => {
    latest.current = { questionIds: questions.map((x) => x.id), answers, flags, timeMs: timeMs.current, currentIndex: index };
  }, [answers, flags, index, questions]);

  const save = useCallback(async () => {
    if (submitted.current) return;
    commitTime();
    setSaveState("saving");
    try {
      const res = await saveMock(attemptId, { ...latest.current, timeMs: { ...timeMs.current } });
      setSaveState(res.ok ? "saved" : "offline");
      if (res.expired) router.replace(`/mock/${attemptId}/results`);
    } catch {
      setSaveState("offline");
    }
  }, [attemptId, commitTime, router]);

  // Debounced save after answers/flags change.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(save, 600);
    return () => clearTimeout(t);
  }, [answers, flags, save]);

  // Heartbeat and save on tab hide.
  useEffect(() => {
    const t = setInterval(save, 15_000);
    const onVis = () => {
      if (document.visibilityState === "hidden") void save();
      else qStart.current = Date.now();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [save]);

  const submit = useCallback(async () => {
    if (submitted.current) return;
    submitted.current = true;
    setSubmitting(true);
    commitTime();
    const res = await submitMock(attemptId, { ...latest.current, timeMs: { ...timeMs.current } }).catch(() => null);
    if (!res) {
      submitted.current = false;
      setSubmitting(false);
      setSaveState("offline");
      return;
    }
    celebrate(res.reward, { refresh: false });
    router.replace(`/mock/${attemptId}/results`);
  }, [attemptId, celebrate, commitTime, router]);

  // Auto-submit at zero.
  useEffect(() => {
    if (remaining <= 0 && !submitted.current) void submit();
  }, [remaining, submit]);

  const go = useCallback(
    (i: number) => {
      if (i < 0 || i >= questions.length || i === index) return;
      commitTime();
      setIndex(i);
      setNavFocus(i);
      setNavOpen(false);
    },
    [commitTime, index, questions.length],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if (confirmOpen) return;
      if (e.key === "ArrowRight") go(index + 1);
      if (e.key === "ArrowLeft") go(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index, confirmOpen]);

  // When the question changes, move focus to its heading and bring it into view (below the sticky bars).
  const firstIndex = useRef(true);
  useEffect(() => {
    if (firstIndex.current) {
      firstIndex.current = false;
      return;
    }
    const h = heading.current;
    if (!h) return;
    h.focus({ preventScroll: true });
    // The heading is visually hidden; scroll its (visible) container instead.
    const box = h.parentElement;
    const top = box?.getBoundingClientRect().top ?? 0;
    if (box && (top < 120 || top > window.innerHeight * 0.5)) box.scrollIntoView({ block: "start" });
  }, [index]);

  const onNavKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const grid = e.currentTarget;
    const cols = Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length);
    const last = questions.length - 1;
    let next = navFocus;
    if (e.key === "ArrowRight") next = navFocus + 1;
    else if (e.key === "ArrowLeft") next = navFocus - 1;
    else if (e.key === "ArrowDown") next = navFocus + cols;
    else if (e.key === "ArrowUp") next = navFocus - cols;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    else return;
    // Keep the arrows from also reaching the page-level previous/next shortcut.
    e.preventDefault();
    e.stopPropagation();
    next = Math.max(0, Math.min(last, next));
    setNavFocus(next);
    grid.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
  };

  const answeredCount = useMemo(() => questions.filter((x) => (answers[x.id]?.length ?? 0) > 0).length, [answers, questions]);
  const unanswered = questions.length - answeredCount;
  const flaggedSet = useMemo(() => new Set(flags), [flags]);

  if (!q) return null;
  const urgent = remaining < 60_000;
  const low = remaining < 5 * 60_000;

  const navigator = (
    <div>
      <div role="group" aria-label="Question navigator" onKeyDown={onNavKey} className="grid grid-cols-6 gap-1.5 sm:grid-cols-8 lg:grid-cols-5">
        {questions.map((x, i) => {
          const answered = (answers[x.id]?.length ?? 0) > 0;
          const flagged = flaggedSet.has(x.id);
          return (
            <button
              key={x.id}
              type="button"
              tabIndex={i === navFocus ? 0 : -1}
              onFocus={() => setNavFocus(i)}
              onClick={() => go(i)}
              aria-label={`Question ${i + 1}${answered ? ", answered" : ", unanswered"}${flagged ? ", flagged" : ""}${i === index ? ", current" : ""}`}
              aria-current={i === index ? "step" : undefined}
              className={clsx(
                "relative grid h-9 min-w-0 place-items-center rounded-lg border font-display text-sm font-semibold tabular transition-colors",
                i === index ? "border-ink bg-ink text-bg" : answered ? "border-transparent bg-surface-2 text-ink" : "border-line-strong text-muted hover:border-ink",
              )}
            >
              {i + 1}
              {flagged ? <span className="absolute -top-1 -right-1 size-2.5 rounded-full border-2 border-surface bg-accent" aria-hidden /> : null}
            </button>
          );
        })}
      </div>
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <li className="flex items-center gap-1.5">
          <span className="size-3 rounded bg-surface-2" /> Answered
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-3 rounded border border-line-strong" /> Unanswered
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-accent" /> Flagged
        </li>
      </ul>
    </div>
  );

  const isFlagged = flaggedSet.has(q.id);
  const setFlag = (f: boolean) => setFlags((fl) => (f ? [...new Set([...fl, q.id])] : fl.filter((x) => x !== q.id)));
  const saveLabel = saveState === "saving" ? "Saving…" : saveState === "offline" ? "Not saved, retrying" : "Saved";

  return (
    // The exam bar comes after the question in the DOM (so Tab reaches the question first) but is shown on top.
    <div className="flex flex-col">
      <div className="relative order-2 grid scroll-mt-36 gap-6 lg:grid-cols-[1fr_260px]">
      <h1 ref={heading} tabIndex={-1} className="sr-only">
        Mock exam, question {index + 1} of {questions.length}
      </h1>
        <div className="min-w-0">
          <AnimatePresence mode="wait">
            <motion.div key={q.id} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.18 }}>
              <QuestionCard
                question={q}
                selected={answers[q.id] ?? []}
                onSelect={(ids) => setAnswers((a) => ({ ...a, [q.id]: ids }))}
                onSubmit={() => go(index + 1)}
                flagged={isFlagged}
                onFlag={setFlag}
                keyboard={!confirmOpen && !navOpen}
                label={`Question ${index + 1} of ${questions.length}`}
                domainName={domainNames[q.domainId]}
              />
            </motion.div>
          </AnimatePresence>
          <div className="mt-5 flex items-center justify-between gap-3">
            <Button variant="outline" onClick={() => go(index - 1)} disabled={index === 0}>
              <ChevronLeft size={16} /> Previous
            </Button>
            <p className="hidden text-xs text-muted sm:block">Arrow keys move between questions</p>
            {index < questions.length - 1 ? (
              <Button onClick={() => go(index + 1)}>
                Next <ChevronRight size={16} />
              </Button>
            ) : (
              <Button variant="accent" onClick={() => setConfirmOpen(true)}>
                Review and submit
              </Button>
            )}
          </div>
        </div>
        <aside className="hidden lg:block">
          <div className="sticky top-40 rounded-2xl border border-line bg-surface p-4 shadow-card">
            <p className="mb-3 font-display font-semibold">Questions</p>
            {navigator}
          </div>
        </aside>
      </div>

      <div className="sticky top-14 z-20 order-1 -mx-4 mb-5 border-b border-line bg-bg/90 px-4 py-2.5 backdrop-blur sm:-mx-6 sm:px-6 sm:py-3 lg:-mx-10 lg:px-10">
        <div className="flex items-center gap-1.5 sm:gap-3">
          <div className="mr-auto shrink-0 sm:min-w-0 sm:flex-1">
            <p className="hidden truncate text-sm text-muted sm:block">{certName}</p>
            <p className="truncate text-sm font-medium tabular">
              <span className="sm:hidden" aria-hidden>
                {answeredCount}/{questions.length}
              </span>
              <span className="sr-only sm:not-sr-only">
                {answeredCount} of {questions.length} answered
              </span>
              <span className="ml-2 hidden text-xs font-normal text-muted sm:inline">{saveLabel}</span>
            </p>
            <span className="sr-only" aria-live="polite">
              {saveState === "saved" ? "" : saveLabel}
            </span>
          </div>
          <div
            className={clsx(
              "flex shrink-0 items-center gap-1 rounded-xl px-2 py-1 font-display text-base font-semibold tabular sm:px-3 sm:py-1.5 sm:text-lg",
              urgent ? "bg-bad text-white" : low ? "bg-accent-soft text-accent-text" : "bg-surface-2",
            )}
            role="timer"
            aria-label={`Time remaining ${clock(remaining)}`}
          >
            <Clock size={16} aria-hidden className="hidden min-[360px]:block" />
            {clock(remaining)}
          </div>
          <Button
            variant="outline"
            size="sm"
            className={clsx("shrink-0 px-2! sm:hidden", isFlagged && "bg-accent-soft text-accent-text")}
            onClick={() => setFlag(!isFlagged)}
            aria-pressed={isFlagged}
            aria-label={`Flag question ${index + 1}`}
          >
            <Flag size={16} fill={isFlagged ? "currentColor" : "none"} />
          </Button>
          <Button variant="outline" size="sm" className="shrink-0 px-2! lg:hidden" onClick={() => setNavOpen(true)} aria-label="Open question navigator">
            <Grid3x3 size={16} />
          </Button>
          <Button size="sm" className="shrink-0" onClick={() => setConfirmOpen(true)} disabled={submitting}>
            Submit
          </Button>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-2 sm:mt-3">
          <motion.div className="h-full bg-ink" style={{ originX: 0 }} animate={{ scaleX: answeredCount / questions.length }} transition={{ duration: 0.4 }} />
        </div>
      </div>

      <Modal open={navOpen} onClose={() => setNavOpen(false)} title="Question navigator">
        <p className="mb-4 font-display text-lg font-semibold">Jump to a question</p>
        {navigator}
      </Modal>

      <Modal open={confirmOpen} onClose={() => !submitting && setConfirmOpen(false)} title="Submit exam">
        <p className="font-display text-2xl font-semibold tracking-tight">Submit your exam?</p>
        <p className="mt-2 text-ink-2">You can&apos;t change answers after this. Time left: {clock(remaining)}.</p>
        <dl className="mt-5 grid grid-cols-2 gap-2">
          <div className={clsx("rounded-xl px-3 py-3", unanswered ? "bg-bad-soft" : "bg-surface-2")}>
            <dd className={clsx("font-display text-2xl font-semibold tabular", unanswered ? "text-bad" : "")}>{unanswered}</dd>
            <dt className="text-sm text-ink-2">Unanswered</dt>
          </div>
          <div className={clsx("rounded-xl px-3 py-3", flags.length ? "bg-accent-soft" : "bg-surface-2")}>
            <dd className="font-display text-2xl font-semibold tabular">{flags.length}</dd>
            <dt className="text-sm text-ink-2">
              <Flag size={12} className="mr-1 inline" />
              Flagged
            </dt>
          </div>
        </dl>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button variant="accent" onClick={submit} disabled={submitting} data-autofocus>
            {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
            Submit and see results
          </Button>
          <Button
            variant="ghost"
            disabled={submitting}
            onClick={() => {
              setConfirmOpen(false);
              const firstOpen = questions.findIndex((x) => !(answers[x.id]?.length) || flaggedSet.has(x.id));
              if (firstOpen >= 0) go(firstOpen);
            }}
          >
            {unanswered || flags.length ? "Review open questions" : "Keep reviewing"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
