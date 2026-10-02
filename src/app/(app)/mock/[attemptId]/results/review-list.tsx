"use client";

import { useCallback, useEffect, useState } from "react";
import { clsx } from "clsx";
import { Check, ChevronDown, Compass, Flag, Minus, X } from "lucide-react";
import type { PublicQuestion } from "@/lib/content-types";
import { Markdown } from "@/components/ui/markdown";

export interface ReviewItem {
  n: number;
  question: PublicQuestion;
  selected: string[];
  correct: boolean;
  correctIds: string[];
  explanation: string;
  whyWrong: Record<string, string>;
  mindset: string;
  flagged: boolean;
  ms: number;
  domainName: string;
}

type Filter = "all" | "wrong" | "skipped" | "flagged";

const isSkipped = (x: ReviewItem) => x.selected.length === 0;
const isMissed = (x: ReviewItem) => !x.correct && !isSkipped(x);

const MATCH: Record<Filter, (x: ReviewItem) => boolean> = {
  wrong: isMissed,
  skipped: isSkipped,
  flagged: (x) => x.flagged,
  all: () => true,
};

const EMPTY: Record<Filter, string> = {
  wrong: "Nothing missed among the questions you answered.",
  skipped: "You answered every question.",
  flagged: "Nothing flagged in this attempt.",
  all: "No questions in this attempt.",
};

function listIds(ids: string[]) {
  if (ids.length === 0) return "none";
  return ids.length === 1 ? ids[0] : `${ids.slice(0, -1).join(", ")} and ${ids[ids.length - 1]}`;
}

/** A rough plain-text version of a markdown stem for the one-line summary. */
function plain(md: string) {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[`*_>#[\]]/g, "")
    .replace(/\(https?:[^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function ReviewList({ items }: { items: ReviewItem[] }) {
  const missed = items.filter(isMissed).length;
  const [filter, setFilter] = useState<Filter>(missed > 0 ? "wrong" : "all");
  const [open, setOpen] = useState<ReadonlySet<number>>(() => new Set());
  const shown = items.filter(MATCH[filter]);
  const tabs: [Filter, string, number][] = [
    ["wrong", "Missed", missed],
    ["skipped", "Skipped", items.filter(isSkipped).length],
    ["flagged", "Flagged", items.filter((x) => x.flagged).length],
    ["all", "All", items.length],
  ];

  const toggle = (n: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });

  // Links such as "#q-12" (the slowest-questions list) open that item, switching filter if it is hidden.
  const openFromHash = useCallback(() => {
    const m = /^#q-(\d+)$/.exec(window.location.hash);
    if (!m) return;
    const n = Number(m[1]);
    const item = items.find((x) => x.n === n);
    if (!item) return;
    setFilter((f) => (MATCH[f](item) ? f : "all"));
    setOpen((prev) => (prev.has(n) ? prev : new Set(prev).add(n)));
    requestAnimationFrame(() => {
      const el = document.getElementById(`q-${n}`);
      el?.scrollIntoView({ block: "start" });
      el?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
    });
  }, [items]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing with the URL hash on mount
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, [openFromHash]);

  const allOpen = shown.length > 0 && shown.every((x) => open.has(x.n));

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Filter questions" className="inline-flex max-w-full flex-wrap rounded-xl bg-surface-2 p-1">
          {tabs.map(([id, label, n]) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
              className={clsx("rounded-lg px-3 py-1.5 text-sm font-medium transition-colors", filter === id ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink")}
            >
              {label} <span className="text-muted tabular">({n})</span>
            </button>
          ))}
        </div>
        {shown.length > 0 ? (
          <button
            type="button"
            onClick={() => setOpen(allOpen ? new Set() : new Set(shown.map((x) => x.n)))}
            className="text-sm font-medium text-ink-2 underline-offset-4 hover:text-ink hover:underline"
          >
            {allOpen ? "Collapse all" : "Expand all"}
          </button>
        ) : null}
      </div>
      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong px-5 py-8 text-center text-ink-2">{EMPTY[filter]}</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((x) => (
            <ReviewRow key={x.question.id} item={x} open={open.has(x.n)} onToggle={() => toggle(x.n)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ReviewRow({ item: x, open, onToggle }: { item: ReviewItem; open: boolean; onToggle: () => void }) {
  const skipped = isSkipped(x);
  const panelId = `q-${x.n}-detail`;
  const status = x.correct ? "Correct" : skipped ? "Skipped" : "Missed";
  return (
    <li id={`q-${x.n}`} className={clsx("scroll-mt-24 rounded-2xl border bg-surface", open ? "shadow-card" : "", x.correct ? "border-line" : skipped ? "border-line" : "border-bad/40")}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="flex w-full min-w-0 items-start gap-3 rounded-2xl px-4 py-2.5 text-left hover:bg-surface-2/50"
      >
        <span
          className={clsx(
            "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full",
            x.correct ? "bg-good text-white" : skipped ? "border border-line-strong text-muted" : "bg-bad text-white",
          )}
          aria-hidden
        >
          {x.correct ? <Check size={14} strokeWidth={3} /> : skipped ? <Minus size={14} strokeWidth={3} /> : <X size={14} strokeWidth={3} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 text-sm">
            <span className="font-semibold tabular">Q{x.n}</span>
            <span className="sr-only">{status}.</span>
            {x.flagged ? (
              <span className="inline-flex items-center gap-1 text-accent-text">
                <Flag size={12} fill="currentColor" aria-hidden /> Flagged
              </span>
            ) : null}
            <span className="min-w-0 truncate text-muted">{x.domainName}</span>
            <span className="w-full text-ink-2 sm:ml-auto sm:w-auto sm:shrink-0">
              Your answer: <span className={clsx("font-medium", x.correct ? "text-good" : skipped ? "text-muted" : "text-bad")}>{skipped ? "skipped" : listIds(x.selected)}</span>
              {x.correct ? null : (
                <>
                  {" · "}Correct: <span className="font-medium text-good">{listIds(x.correctIds)}</span>
                </>
              )}
            </span>
          </span>
          <span className="mt-0.5 line-clamp-1 text-[0.95rem] text-ink">{plain(x.question.stem)}</span>
        </span>
        <ChevronDown size={18} className={clsx("mt-1 shrink-0 text-muted transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? <ReviewDetail id={panelId} item={x} /> : null}
    </li>
  );
}

function ReviewDetail({ id, item: x }: { id: string; item: ReviewItem }) {
  const skipped = isSkipped(x);
  return (
    <div id={id} className="border-t border-line px-4 pt-4 pb-5 sm:px-6">
      <p className="text-sm text-muted">
        {x.domainName} · Task {x.question.taskStatementId}
        {x.ms ? <span className="tabular"> · {Math.round(x.ms / 1000)}s</span> : null}
      </p>
      {x.question.scenario ? (
        <div className="mt-3 rounded-xl border-l-[3px] border-info bg-info-soft/50 px-4 py-3 text-[0.95rem] text-ink-2">
          <Markdown>{x.question.scenario}</Markdown>
        </div>
      ) : null}
      <div className="mt-3 font-display text-lg font-medium tracking-[-0.01em]">
        <Markdown className="leading-snug">{x.question.stem}</Markdown>
      </div>
      <ul className="mt-4 grid gap-2">
        {x.question.options.map((o) => {
          const right = x.correctIds.includes(o.id);
          const picked = x.selected.includes(o.id);
          const why = x.whyWrong[o.id];
          return (
            <li key={o.id}>
              <div
                className={clsx(
                  "flex items-start gap-3 rounded-xl border px-3.5 py-2.5",
                  right ? "border-good bg-good-soft" : picked ? "border-bad bg-bad-soft" : "border-line opacity-80",
                )}
              >
                <span
                  className={clsx(
                    "grid size-6 shrink-0 place-items-center rounded-full font-display text-xs font-semibold",
                    right ? "bg-good text-white" : picked ? "bg-bad text-white" : "border border-line text-muted",
                  )}
                  aria-hidden
                >
                  {o.id}
                </span>
                <span className="min-w-0 flex-1 text-[0.95rem] leading-snug">
                  <span className="sr-only">
                    Option {o.id}
                    {right ? ", correct answer" : ""}
                    {picked ? ", your answer" : ""}.{" "}
                  </span>
                  <Markdown>{o.text}</Markdown>
                </span>
              </div>
              {why && !right ? <p className={clsx("pt-1 pr-2 pl-[3rem] text-sm", picked ? "text-bad" : "text-muted")}>{why}</p> : null}
            </li>
          );
        })}
      </ul>
      <div className="mt-5 border-t border-line pt-4">
        <p className={clsx("flex items-center gap-2 font-display text-base font-semibold", x.correct ? "text-good" : skipped ? "text-ink-2" : "text-bad")}>
          {x.correct ? <Check size={18} strokeWidth={3} /> : skipped ? <Minus size={18} strokeWidth={3} /> : <X size={18} strokeWidth={3} />}
          {x.correct
            ? "Correct"
            : skipped
              ? `You skipped this. The answer is ${listIds(x.correctIds)}.`
              : `Not quite. The answer is ${listIds(x.correctIds)}.`}
        </p>
        <div className="mt-2 text-[0.95rem] text-ink-2">
          <Markdown>{x.explanation}</Markdown>
        </div>
        {x.mindset ? (
          <p className="mt-3 flex items-start gap-2.5 rounded-xl bg-accent-soft/60 px-3.5 py-2.5 text-sm">
            <Compass size={16} className="mt-0.5 shrink-0 text-accent-text" aria-hidden />
            <span>
              <span className="font-semibold">Mindset: </span>
              {x.mindset}
            </span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
