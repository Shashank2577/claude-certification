"use client";

import { useState } from "react";
import { clsx } from "clsx";
import type { PublicQuestion } from "@/lib/content-types";
import { QuestionCard } from "@/components/quiz/question-card";

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

type Filter = "all" | "wrong" | "flagged";

export function ReviewList({ items }: { items: ReviewItem[] }) {
  const [filter, setFilter] = useState<Filter>("wrong");
  const wrong = items.filter((x) => !x.correct).length;
  const flagged = items.filter((x) => x.flagged).length;
  const shown = items.filter((x) => (filter === "wrong" ? !x.correct : filter === "flagged" ? x.flagged : true));
  const tabs: [Filter, string, number][] = [
    ["wrong", "Missed", wrong],
    ["flagged", "Flagged", flagged],
    ["all", "All", items.length],
  ];

  return (
    <div>
      <div role="tablist" aria-label="Filter questions" className="mb-5 inline-flex rounded-xl bg-surface-2 p-1">
        {tabs.map(([id, label, n]) => (
          <button
            key={id}
            role="tab"
            aria-selected={filter === id}
            onClick={() => setFilter(id)}
            className={clsx("rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors", filter === id ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink")}
          >
            {label} <span className="text-muted tabular">{n}</span>
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong px-5 py-8 text-center text-ink-2">
          {filter === "wrong" ? "Nothing missed. Every answer was right." : "Nothing flagged in this attempt."}
        </p>
      ) : (
        <div className="space-y-5">
          {shown.map((x) => (
            <div key={x.question.id} id={`q-${x.n}`} className="scroll-mt-24">
              <QuestionCard
                question={x.question}
                selected={x.selected}
                onSelect={() => {}}
                feedback={{ correct: x.correct, correctIds: x.correctIds, explanation: x.explanation, whyWrong: x.whyWrong, mindset: x.mindset, reward: null }}
                label={`Question ${x.n}${x.selected.length === 0 ? ", not answered" : ""}${x.ms ? `, ${Math.round(x.ms / 1000)}s` : ""}`}
                domainName={x.domainName}
                still
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
