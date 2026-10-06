"use client";

import { useEffect, useId } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { clsx } from "clsx";
import { Check, Compass, Flag, X } from "lucide-react";
import type { PublicQuestion } from "@/lib/content-types";
import type { AnswerFeedback } from "@/lib/quiz-types";
import { Markdown } from "@/components/ui/markdown";
import { Visual } from "@/components/visuals/visual";
import { ListenButton } from "@/components/listen-button";

export interface QuestionCardProps {
  question: PublicQuestion;
  selected: string[];
  onSelect: (ids: string[]) => void;
  /** When set, the card is locked and shows answers. Omit in exam mode. */
  feedback?: AnswerFeedback | null;
  /** Called on Enter (or the caller's submit button) while unanswered. */
  onSubmit?: () => void;
  /** Called on Enter after feedback is shown. */
  onNext?: () => void;
  flagged?: boolean;
  onFlag?: (flagged: boolean) => void;
  /** Enable 1–9 / A–D / Enter shortcuts. Only one card on screen should have this. */
  keyboard?: boolean;
  label?: string;
  domainName?: string;
  compact?: boolean;
  /** Skip the wrong-answer shake (e.g. when reviewing a finished exam). */
  still?: boolean;
}

export function QuestionCard({
  question,
  selected,
  onSelect,
  feedback,
  onSubmit,
  onNext,
  flagged,
  onFlag,
  keyboard = false,
  label,
  domainName,
  compact,
  still,
}: QuestionCardProps) {
  const multi = question.choose > 1;
  const locked = !!feedback;
  const reduce = useReducedMotion();
  const groupId = useId();

  const toggle = (id: string) => {
    if (locked) return;
    if (multi) onSelect(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
    else onSelect([id]);
  };

  useEffect(() => {
    if (!keyboard) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Enter") {
        // Let buttons handle their own Enter.
        if (t && t.tagName === "BUTTON" && !t.dataset.option) return;
        e.preventDefault();
        if (locked) onNext?.();
        else if (selected.length > 0) onSubmit?.();
        return;
      }
      if (locked) return;
      let idx = -1;
      if (/^[1-9]$/.test(e.key)) idx = Number(e.key) - 1;
      else if (/^[a-z]$/i.test(e.key)) idx = question.options.findIndex((o) => o.id.toLowerCase() === e.key.toLowerCase());
      if (idx >= 0 && idx < question.options.length) {
        e.preventDefault();
        const id = question.options[idx].id;
        if (multi) onSelect(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
        else onSelect([id]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keyboard, locked, selected, question, multi, onSelect, onSubmit, onNext]);

  return (
    <motion.article
      key={question.id}
      animate={feedback && !feedback.correct && !reduce && !still ? { x: [0, -7, 6, -4, 3, 0] } : { x: 0 }}
      transition={{ duration: 0.4 }}
      className={clsx("rounded-2xl border bg-surface shadow-card", compact ? "p-4 sm:p-5" : "p-5 sm:p-7", feedback ? (feedback.correct ? "border-good" : "border-bad") : "border-line")}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
        {label ? <span className="font-medium text-ink-2 tabular">{label}</span> : null}
        {domainName ? <span>{domainName}</span> : null}
        <span>Task {question.taskStatementId}</span>
        {onFlag ? (
          <button
            type="button"
            onClick={() => onFlag(!flagged)}
            aria-pressed={!!flagged}
            className={clsx(
              "ml-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm transition-colors",
              flagged ? "bg-accent-soft text-accent-text" : "text-muted hover:bg-surface-2 hover:text-ink",
            )}
          >
            <Flag size={14} fill={flagged ? "currentColor" : "none"} />
            {flagged ? "Flagged" : "Flag"}
          </button>
        ) : null}
      </div>

      {question.scenario ? (
        <div className="mt-4 rounded-xl border-l-[3px] border-info bg-info-soft/50 px-4 py-3 text-[0.95rem] text-ink-2">
          <Markdown>{question.scenario}</Markdown>
        </div>
      ) : null}

      <div className="mt-4 flex items-start gap-2">
        <div className={clsx("min-w-0 flex-1 font-display font-medium tracking-[-0.01em]", compact ? "text-lg" : "text-xl sm:text-[1.35rem]")} id={`${groupId}-stem`}>
          <Markdown className="leading-snug">{question.stem}</Markdown>
        </div>
        <ListenButton text={question.stem} label="the question" id={`${question.id}:stem`} markdown />
      </div>
      {multi ? (
        <p className="mt-2 text-sm font-semibold text-accent-text">
          Choose {question.choose}. {selected.length > 0 && !locked ? <span className="font-normal text-muted tabular">{selected.length} selected</span> : null}
        </p>
      ) : null}

      <div role={multi ? "group" : "radiogroup"} aria-labelledby={`${groupId}-stem`} className="mt-5 grid grid-cols-1 gap-2.5">
        {question.options.map((o, i) => {
          const isSel = selected.includes(o.id);
          const isRight = feedback?.correctIds.includes(o.id) ?? false;
          const state = !feedback ? (isSel ? "selected" : "idle") : isRight ? "right" : isSel ? "wrong" : "dim";
          const why = feedback?.whyWrong[o.id];
          return (
            <div key={o.id}>
              <button
                type="button"
                role={multi ? "checkbox" : "radio"}
                aria-checked={isSel}
                data-option="1"
                disabled={locked}
                onClick={() => toggle(o.id)}
                className={clsx(
                  "group flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-[border-color,background-color,transform] duration-150 disabled:cursor-default",
                  !locked && "active:scale-[0.99]",
                  state === "idle" && "border-line bg-bg/40 hover:border-line-strong hover:bg-surface-2/60",
                  state === "selected" && "border-ink bg-surface-2/70",
                  state === "right" && "border-good bg-good-soft",
                  state === "wrong" && "border-bad bg-bad-soft",
                  state === "dim" && "border-line opacity-75",
                )}
              >
                <span
                  className={clsx(
                    "grid size-7 shrink-0 place-items-center font-display text-sm font-semibold",
                    multi ? "rounded-md" : "rounded-full",
                    state === "idle" && "border border-line-strong text-ink-2",
                    state === "selected" && "bg-ink text-bg",
                    state === "right" && "bg-good text-white",
                    state === "wrong" && "bg-bad text-white",
                    state === "dim" && "border border-line text-muted",
                  )}
                  aria-hidden
                >
                  <AnimatePresence mode="wait" initial={false}>
                    {state === "right" ? (
                      <motion.span key="r" initial={{ scale: 0.3, rotate: -30 }} animate={{ scale: [0.3, 1.25, 1], rotate: 0 }} transition={{ duration: 0.35 }}>
                        <Check size={15} strokeWidth={3} />
                      </motion.span>
                    ) : state === "wrong" ? (
                      <motion.span key="w" initial={{ scale: 0.5 }} animate={{ scale: 1 }}>
                        <X size={15} strokeWidth={3} />
                      </motion.span>
                    ) : (
                      <motion.span key="l">{o.id || i + 1}</motion.span>
                    )}
                  </AnimatePresence>
                </span>
                <span className="min-w-0 flex-1 pt-0.5 text-[0.98rem] leading-snug [overflow-wrap:anywhere]">
                  <Markdown>{o.text}</Markdown>
                </span>
              </button>
              <AnimatePresence>
                {feedback && why && !isRight ? (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    transition={{ duration: 0.25, delay: 0.05 * i }}
                    className={clsx("overflow-hidden pt-1.5 pr-2 pl-[3.25rem] text-sm", isSel ? "text-bad" : "text-muted")}
                  >
                    {why}
                  </motion.p>
                ) : null}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      <AnimatePresence>
        {feedback ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="mt-6 border-t border-line pt-5"
            role="status"
          >
            <p className={clsx("flex items-center gap-2 font-display text-lg font-semibold", feedback.correct ? "text-good" : "text-bad")}>
              {feedback.correct ? <Check size={20} strokeWidth={3} /> : <X size={20} strokeWidth={3} />}
              {feedback.correct ? "Correct" : `Not quite. The answer is ${listAnswers(feedback.correctIds)}.`}
            </p>
            <div className="mt-3 flex items-start gap-2">
              <div className="min-w-0 flex-1 text-[0.97rem] text-ink-2">
                <Markdown>{feedback.explanation}</Markdown>
              </div>
              <ListenButton text={feedback.explanation} label="the explanation" id={`${question.id}:why`} markdown />
            </div>
            {feedback.mindset ? (
              <div className="mt-4 flex items-start gap-2 rounded-xl bg-accent-soft/60 px-3.5 py-2.5 text-sm">
                <Compass size={16} className="mt-0.5 shrink-0 text-accent-text" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">Mindset: </span>
                  {feedback.mindset}
                </span>
                <ListenButton text={feedback.mindset} label="the mindset" id={`${question.id}:mindset`} size="xs" />
              </div>
            ) : null}
            {/* The figure explains why the answer is right, so it only appears once feedback is shown. */}
            {feedback.visualId ? (
              <div className="mt-5 min-w-0 overflow-x-auto">
                <Visual id={feedback.visualId} compact />
              </div>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.article>
  );
}

function listAnswers(ids: string[]) {
  return ids.length <= 1 ? (ids[0] ?? "") : `${ids.slice(0, -1).join(", ")} and ${ids[ids.length - 1]}`;
}
