"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useAnimate, useReducedMotion } from "motion/react";
import clsx from "clsx";
import { Check, ChevronLeft, ChevronRight, Clock, Flag, RotateCcw, Scissors, X } from "lucide-react";

type Kind = "qualifier" | "cause";
interface Seg {
  text: string;
  kind?: Kind;
  note?: string;
}

// A practice question written for this course (not from the exam). Highlighted spans carry the reasoning.
const STEM: Seg[] = [
  {
    text: "A clinic runs a scheduling agent built with the Claude Agent SDK. It has three tools: find_patient, book_appointment and cancel_appointment. Clinic policy says an appointment ",
  },
  {
    text: "must never be cancelled",
    kind: "qualifier",
    note: "A hard rule with real consequences. Anything that works 'most of the time' (prompts, examples, a different model) cannot guarantee it.",
  },
  { text: " without the patient's explicit confirmation. " },
  {
    text: "The system prompt already states this rule.",
    kind: "cause",
    note: "The prompt is already doing all a prompt can do. More or louder prompting will not close the gap.",
  },
  { text: " Logs show that in about 3% of conversations the agent " },
  {
    text: "calls cancel_appointment after the patient only asked about rescheduling",
    kind: "cause",
    note: "The failure happens at the tool call. Nothing in code stops cancel_appointment from running without confirmation.",
  },
  { text: ". The team wants the " },
  {
    text: "most reliable",
    kind: "qualifier",
    note: "Reliable beats 'usually better'. Prefer a check in code, which behaves the same every time, over hoping the model complies.",
  },
  { text: " fix that needs " },
  {
    text: "minimal change",
    kind: "qualifier",
    note: "Rules out rebuilding the system or adding new services and agents.",
  },
  { text: " to the current system. What should they do " },
  {
    text: "first",
    kind: "qualifier",
    note: "Asks for the proportionate first move, not the ideal end-state architecture.",
  },
  { text: "?" },
];

interface Option {
  text: string;
  family?: string;
  why: string;
}

const OPTIONS: Option[] = [
  {
    text: "Add five few-shot examples where the agent asks for confirmation before cancelling.",
    family: "More examples",
    why: "Still probabilistic. It helps most of the time, but the policy says never.",
  },
  {
    text: "Move the agent to a larger, more capable model.",
    family: "Bigger model",
    why: "Costs more and still cannot guarantee a rule. This is a control problem, not a capability problem.",
  },
  {
    text: "Add a PreToolUse hook that blocks cancel_appointment unless the patient has explicitly confirmed in this session.",
    why: "A hook is code that runs just before a tool call and can refuse it. Code behaves the same every time, so the guarantee holds, and it is a small change to the existing agent.",
  },
  {
    text: "Have the agent rate its confidence that the patient wants to cancel, and proceed only above 0.9.",
    family: "Self-check",
    why: "Self-rated confidence is poorly calibrated. The model grading itself is still the model.",
  },
  {
    text: "Rewrite the rule in capitals at the top of the system prompt: NEVER CANCEL WITHOUT CONFIRMATION.",
    family: "Prompt-only fix",
    why: "The prompt already says this. Louder wording is still a request, not an enforced rule.",
  },
  {
    text: "Add an intent-classifier service and a supervisor agent that reviews every tool call before it runs.",
    family: "Over-engineered",
    why: "New infrastructure, more latency, and still model judgement. Not minimal, not first.",
  },
];
const CORRECT = 2;
const DISGUISES = OPTIONS.map((_, i) => i).filter((i) => i !== CORRECT);

const STEPS = [
  { label: "Read", caption: "Read the whole question before the options. Long scenarios bury the one or two words that decide the answer." },
  {
    label: "Qualifier",
    caption: "Find the hidden qualifiers. 'Must never', 'most reliable', 'minimal change' and 'first' set the bar: a guarantee, reached simply. Tap a highlight to see why it matters.",
  },
  { label: "Root cause", caption: "Name the root cause. The prompt already has the rule and the agent still breaks it, so nothing enforces the rule at the moment the tool runs." },
  { label: "Disguises", caption: "Strip the disguises. Tap each option you can rule out. Each one sounds helpful but is probabilistic, oversized, or fixes the wrong thing." },
  { label: "Pick", caption: "Pick the simplest option that fixes the root cause in code, so it works the same every time: a hook that blocks the cancel. Small change, guaranteed." },
];

const LETTERS = "ABCDEF";
const EASE = [0.22, 1, 0.36, 1] as const;
const TABS = [
  { id: "walk", label: "Elimination funnel", icon: <Scissors size={14} /> },
  { id: "pace", label: "Time budget", icon: <Clock size={14} /> },
] as const;
type Mode = (typeof TABS)[number]["id"];

export default function ExamStrategy() {
  const [mode, setMode] = useState<Mode>("walk");
  const onTabKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next = TABS[(TABS.findIndex((t) => t.id === mode) + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length].id;
    setMode(next);
    document.getElementById(`es-tab-${next}`)?.focus();
  };
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Exam strategy view" onKeyDown={onTabKey} className="flex max-w-full rounded-xl border border-line bg-surface-2/60 p-1 @lg:inline-flex">
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`es-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={mode === t.id}
            aria-controls={`es-panel-${t.id}`}
            tabIndex={mode === t.id ? 0 : -1}
            onClick={() => setMode(t.id)}
            className={clsx(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors @lg:flex-none",
              mode === t.id ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`es-panel-${mode}`} aria-labelledby={`es-tab-${mode}`}>
        {mode === "walk" ? <Walkthrough /> : <Pacing />}
      </div>
    </div>
  );
}

function Walkthrough() {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  const [struck, setStruck] = useState<Set<number>>(new Set());
  const [note, setNote] = useState<string | null>(null);
  const [winRef, shake] = useAnimate();
  const last = STEPS.length - 1;

  const go = (s: number) => {
    const n = Math.max(0, Math.min(last, s));
    setStep(n);
    setNote(null);
    if (n < 3) setStruck(new Set());
    if (n === 4) setStruck(new Set(DISGUISES));
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      go(step + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(step - 1);
    }
  };
  const toggle = (i: number) => {
    if (step !== 3) return;
    if (i === CORRECT) {
      if (!reduce && winRef.current) shake(winRef.current, { x: [0, -6, 6, -3, 0] }, { duration: 0.35 });
      setNote("Keep this one. It is the only option that enforces the rule in code, where the failure happens.");
      return;
    }
    setStruck((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
    setNote(null);
  };

  const remaining = OPTIONS.length - struck.size;
  const allStruck = struck.size === DISGUISES.length;
  const caption = step === 3 && allStruck ? "Every disguise is gone. One option survives: the fix that is enforced in code and changes the least. Step forward to lock it in." : STEPS[step].caption;

  return (
    <div className="space-y-4" onKeyDown={onKey}>
      <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-3 rounded-xl bg-surface-2/50 p-3 @lg:p-4" tabIndex={0} role="group" aria-label="Practice question. Use left and right arrow keys to step through the funnel.">
          <p className="font-mono text-xs font-semibold tracking-wide text-muted uppercase">Practice question · written for this course</p>
          <p className="text-[0.95rem] leading-relaxed text-ink">
            {STEM.map((s, i) => {
              const lit = (s.kind === "qualifier" && step >= 1) || (s.kind === "cause" && step >= 2);
              if (!s.kind || !lit) return <span key={i}>{s.text}</span>;
              const isQ = s.kind === "qualifier";
              return (
                <motion.button
                  key={i}
                  type="button"
                  aria-label={`${s.text}: ${s.note}`}
                  onClick={() => setNote(s.note ?? null)}
                  onMouseEnter={() => setNote(s.note ?? null)}
                  onFocus={() => setNote(s.note ?? null)}
                  className="inline cursor-help rounded px-0.5 text-left font-semibold underline decoration-2 underline-offset-4"
                  style={{ textDecorationColor: isQ ? "var(--accent-strong)" : "var(--info)" }}
                  initial={reduce ? false : { backgroundColor: "rgba(0,0,0,0)" }}
                  animate={{ backgroundColor: isQ ? "var(--accent-soft)" : "var(--info-soft)" }}
                  transition={{ duration: reduce ? 0 : 0.45, ease: EASE }}
                >
                  {s.text}
                </motion.button>
              );
            })}
          </p>

          <div aria-live="polite">
            <AnimatePresence initial={false}>
              {note ? (
                <motion.p
                  key={note}
                  initial={reduce ? false : { opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduce ? 0 : 0.25 }}
                  className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink-2"
                >
                  {note}
                </motion.p>
              ) : null}
            </AnimatePresence>
          </div>

          {step >= 2 ? (
            <motion.div initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink">
              <span className="font-semibold" style={{ color: "var(--info)" }}>
                Root cause:{" "}
              </span>
              the confirmation rule lives only in the prompt. Nothing enforces it when cancel_appointment runs.
            </motion.div>
          ) : null}

          <ol className="space-y-2" aria-label="Answer options">
            {OPTIONS.map((o, i) => {
              const out = struck.has(i);
              const win = step === 4 && i === CORRECT;
              return (
                <motion.li key={i} layout={!reduce} ref={i === CORRECT ? winRef : undefined}>
                  <button
                    type="button"
                    onClick={() => toggle(i)}
                    disabled={step !== 3}
                    aria-pressed={step === 3 && i !== CORRECT ? out : undefined}
                    aria-label={`Option ${LETTERS[i]}: ${o.text}${out ? `. Eliminated, ${o.family}: ${o.why}` : ""}${win ? `. Correct: ${o.why}` : ""}`}
                    className={clsx(
                      "flex w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:cursor-default",
                      win ? "border-good bg-good-soft" : out ? "border-line bg-surface/60" : "border-line bg-surface",
                      step === 3 && !out && "hover:border-ink",
                    )}
                  >
                    <span
                      className={clsx(
                        "mt-0.5 grid size-6 shrink-0 place-items-center rounded-md font-mono text-xs font-semibold",
                        win ? "bg-good text-surface" : out ? "bg-surface-2 text-muted" : "bg-surface-2 text-ink",
                      )}
                    >
                      {win ? <Check size={14} /> : out ? <X size={14} /> : LETTERS[i]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={clsx("block", out ? "text-muted line-through decoration-[var(--bad)]" : "text-ink")}>{o.text}</span>
                      <AnimatePresence initial={false}>
                        {out || win ? (
                          <motion.span
                            initial={reduce ? false : { opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: reduce ? 0 : 0.3, ease: EASE }}
                            className="mt-1 block overflow-hidden text-[0.8rem] text-ink-2"
                          >
                            <span className="mr-1.5 font-semibold" style={{ color: win ? "var(--good)" : "var(--bad)" }}>
                              {win ? "Root-cause fix" : o.family}
                            </span>
                            {o.why}
                          </motion.span>
                        ) : null}
                      </AnimatePresence>
                    </span>
                  </button>
                </motion.li>
              );
            })}
          </ol>
          {step === 3 && !allStruck ? (
            <button type="button" onClick={() => setStruck(new Set(DISGUISES))} aria-label="Strike all disguises" className="text-sm font-medium text-accent-text underline underline-offset-4">
              Strike all disguises for me
            </button>
          ) : null}
        </div>

        <Funnel step={step} remaining={remaining} reduce={!!reduce} />
      </div>

      <div className="flex flex-col gap-3 @lg:flex-row @lg:items-center @lg:justify-between">
        <p className="min-h-12 text-[0.95rem] text-ink-2" aria-live="polite">
          <span className="mr-2 font-display font-semibold text-ink tabular">
            {step + 1}/{STEPS.length}
          </span>
          {caption}
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          <CtrlButton label="Previous step" onClick={() => go(step - 1)} disabled={step === 0}>
            <ChevronLeft size={18} />
          </CtrlButton>
          <CtrlButton label="Next step" onClick={() => go(step + 1)} disabled={step === last}>
            <ChevronRight size={18} />
          </CtrlButton>
          <CtrlButton label="Reset" onClick={() => go(0)}>
            <RotateCcw size={16} />
          </CtrlButton>
        </div>
      </div>
    </div>
  );
}

function Funnel({ step, remaining, reduce }: { step: number; remaining: number; reduce: boolean }) {
  const top = 24;
  const bandH = 44;
  const half = (i: number) => 118 - i * 19; // half-width at band edge i
  const cx = 130;
  const outY = top + STEPS.length * bandH + 22;
  return (
    <div className="flex flex-col rounded-xl border border-line bg-bg/60 p-3">
      <p className="px-1 text-xs font-medium text-muted">The funnel: each stage narrows the field</p>
      <svg
        viewBox="0 0 260 300"
        className="mx-auto h-auto w-full max-w-xs"
        role="img"
        aria-label={`Funnel at stage ${step + 1}, ${STEPS[step].label}. ${remaining} of ${OPTIONS.length} options still in play.`}
      >
        {STEPS.map((s, i) => {
          const y = top + i * bandH;
          const a = half(i);
          const b = half(i + 1);
          const done = i < step;
          const on = i === step;
          return (
            <g key={s.label}>
              <motion.path
                d={`M ${cx - a} ${y} L ${cx + a} ${y} L ${cx + b} ${y + bandH - 4} L ${cx - b} ${y + bandH - 4} Z`}
                initial={false}
                animate={{ fill: on ? "var(--accent)" : done ? "var(--accent-soft)" : "var(--surface)" }}
                stroke={on ? "var(--accent-strong)" : "var(--line-strong)"}
                strokeWidth={on ? 2 : 1}
                strokeLinejoin="round"
                transition={{ duration: reduce ? 0 : 0.4, ease: EASE }}
              />
              <text x={cx} y={y + bandH / 2 + 2} textAnchor="middle" fill={on ? "var(--accent-ink)" : "var(--ink)"} style={{ font: `${on ? 700 : 500} 13px var(--font-display)` }}>
                {i + 1}. {s.label}
              </text>
            </g>
          );
        })}
        {OPTIONS.map((_, i) => {
          const alive = i < remaining;
          const x = cx + (i - (remaining - 1) / 2) * 18;
          return (
            <motion.circle
              key={i}
              r={6}
              initial={false}
              animate={{ cx: alive ? x : cx, cy: outY, opacity: alive ? 1 : 0, scale: alive ? 1 : 0.2 }}
              transition={{ duration: reduce ? 0 : 0.5, ease: EASE }}
              fill={step === 4 ? "var(--good)" : "var(--ink)"}
            />
          );
        })}
        <text x={cx} y={outY + 24} textAnchor="middle" fill="var(--muted)" style={{ font: "500 11px var(--font-mono)" }}>
          {remaining === 1 ? "1 option survives" : `${remaining} options in play`}
        </text>
      </svg>
    </div>
  );
}

// Official exam guides: Foundations 60 items, Professional 63 items, both 120 minutes.
const EXAMS = [
  { id: "f", label: "Foundations", items: 60 },
  { id: "p", label: "Professional", items: 63 },
] as const;
const MINUTES = 120;
const CHECKPOINTS = [15, 30, 45];
const fmt = (m: number) => (Number.isInteger(m) ? String(m) : m.toFixed(1));

function Pacing() {
  const [examId, setExamId] = useState<(typeof EXAMS)[number]["id"]>("f");
  const [avg, setAvg] = useState(2);
  const reduce = useReducedMotion();
  const exam = EXAMS.find((e) => e.id === examId) ?? EXAMS[0];
  const n = exam.items;
  const per = MINUTES / n;
  const spare = MINUTES - n * avg;
  const reached = Math.min(n, Math.floor(MINUTES / avg + 1e-9));
  const verdict =
    spare > 0.01
      ? `At ${avg} min each you finish with ${fmt(spare)} min to revisit flagged questions.`
      : Math.abs(spare) <= 0.01
        ? `${avg} min each uses the full ${MINUTES} minutes, with nothing left for review. Aim a little under.`
        : `At ${avg} min each the clock runs out after question ${reached}. The last ${n - reached} get no attention at all.`;
  const pace = CHECKPOINTS.map((q) => `Q${q} by ${Math.round(q * per)} min`).join(", ");

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-surface-2/50 p-3 @lg:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-display text-lg font-semibold text-ink">
            {n} questions · {MINUTES} minutes · <span className="text-accent-text">≈ {fmt(Math.round(per * 10) / 10)} min each</span>
          </p>
          <div role="group" aria-label="Exam" className="inline-flex rounded-lg border border-line bg-surface p-0.5">
            {EXAMS.map((e) => (
              <button
                key={e.id}
                type="button"
                aria-pressed={e.id === examId}
                aria-label={`${e.label}: ${e.items} questions`}
                onClick={() => setExamId(e.id)}
                className={clsx("rounded-md px-2.5 py-1 text-xs font-medium transition-colors", e.id === examId ? "bg-ink text-surface" : "text-muted hover:text-ink")}
              >
                {e.label}
              </button>
            ))}
          </div>
        </div>
        <label htmlFor="es-avg" className="mt-3 block text-sm text-ink-2">
          Your average per question: <span className="font-mono font-semibold text-ink tabular">{avg} min</span>
        </label>
        <input
          id="es-avg"
          type="range"
          min={1}
          max={3}
          step={0.25}
          value={avg}
          onChange={(e) => setAvg(Number(e.target.value))}
          aria-valuetext={`${avg} minutes per question`}
          className="mt-2 w-full accent-[var(--accent-strong)]"
        />
        <svg viewBox={`0 0 ${n * 10} 32`} className="mt-3 h-auto w-full" role="img" aria-label={`${reached} of ${n} questions answered before time runs out`}>
          {Array.from({ length: n }, (_, i) => (
            <motion.rect
              key={i}
              x={i * 10}
              y={2}
              width={8}
              height={28}
              rx={2}
              initial={false}
              animate={{ fill: i < reached ? (CHECKPOINTS.includes(i + 1) ? "var(--accent-strong)" : "var(--good)") : "var(--bad)" }}
              transition={{ duration: reduce ? 0 : 0.25, delay: reduce ? 0 : i * 0.004 }}
            />
          ))}
        </svg>
        <div className="relative h-5" aria-hidden="true">
          {CHECKPOINTS.map((q) => (
            <span key={q} className="absolute -translate-x-1/2 font-mono text-xs text-muted" style={{ left: `${((q * 10 - 6) / (n * 10)) * 100}%` }}>
              Q{q} · {Math.round(q * per)}m
            </span>
          ))}
        </div>
        <p className="mt-1 text-[0.95rem] text-ink-2" aria-live="polite">
          {verdict}
        </p>
      </div>
      <ul className="grid grid-cols-1 gap-2 @lg:grid-cols-3">
        <Tip icon={<Clock size={16} />} title="Check every 15">
          On target for {exam.label}: {pace}.
        </Tip>
        <Tip icon={<Flag size={16} />} title="Stuck? Flag it">
          Past about 2 minutes, choose your best surviving option, flag it and move on.
        </Tip>
        <Tip icon={<Check size={16} />} title="Review at the end">
          Spend spare minutes on flagged items. Each item says how many answers to select.
        </Tip>
      </ul>
    </div>
  );
}

function Tip({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="rounded-xl border border-line bg-surface p-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
        <span className="text-accent-text">{icon}</span>
        {title}
      </p>
      <p className="mt-1 text-sm text-ink-2">{children}</p>
    </li>
  );
}

function CtrlButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid size-9 place-items-center rounded-xl border border-line-strong bg-surface text-ink transition-colors hover:border-ink active:scale-95 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
