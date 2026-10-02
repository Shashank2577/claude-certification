"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Loader2, RotateCcw } from "lucide-react";
import type { PublicQuestion } from "@/lib/content-types";
import type { AnswerFeedback } from "@/lib/quiz-types";
import { answerQuestion } from "@/app/actions/practice";
import { useCelebrate } from "@/components/celebrate";
import { Button, ButtonLink } from "@/components/ui/button";
import { QuestionCard } from "./question-card";

/** Inline three-question check on lesson pages. Answers count toward mastery like practice. */
export function CheckYourself({ questions: initial, lessonId }: { questions: PublicQuestion[]; lessonId: string }) {
  const { celebrate } = useCelebrate();
  // Freeze the set: a server refresh (e.g. after "Mark complete") re-picks questions and must not swap them mid-check.
  const [questions] = useState(initial);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null);
  const [results, setResults] = useState<boolean[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(0);
  useEffect(() => {
    started.current = Date.now();
  }, [index]);

  if (questions.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line-strong px-5 py-6 text-sm text-ink-2" data-lesson={lessonId}>
        No practice questions are linked to this lesson yet. Try a{" "}
        <Link href="/practice" className="font-medium text-ink underline underline-offset-4">
          practice session
        </Link>{" "}
        instead.
      </div>
    );
  }

  const q = questions[index];
  const done = results.length === questions.length && feedback == null;

  const submit = async () => {
    if (pending || selected.length === 0 || feedback) return;
    setPending(true);
    setError(null);
    const res = await answerQuestion({ questionId: q.id, selected, ms: Date.now() - started.current, mode: "lesson-check" }).catch(() => ({ error: "Couldn't save your answer. Check your connection." }));
    setPending(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setFeedback(res);
    setResults((r) => [...r, res.correct]);
    celebrate(res.reward, { refresh: false });
  };

  const next = () => {
    if (!feedback) return;
    setFeedback(null);
    setSelected([]);
    started.current = Date.now();
    if (index < questions.length - 1) setIndex(index + 1);
  };

  if (done) {
    const right = results.filter(Boolean).length;
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-line bg-surface p-6 shadow-card">
        <p className="font-display text-2xl font-semibold tabular">
          {right} of {questions.length} right
        </p>
        <p className="mt-1 text-ink-2">
          {right === questions.length
            ? "Solid. This lesson stuck."
            : right === 0
              ? "Worth a second read of the key takeaways, then try practice on this domain."
              : "Close. The ones you missed are saved to your mistakes list for later."}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setIndex(0);
              setResults([]);
              setSelected([]);
              started.current = Date.now();
            }}
          >
            <RotateCcw size={16} /> Try again
          </Button>
          <ButtonLink href={`/practice?mode=domain&domain=${encodeURIComponent(q.domainId)}`} variant="ghost">
            Practise this domain
          </ButtonLink>
        </div>
      </motion.div>
    );
  }

  return (
    <div>
      <div
        className="mb-3 flex items-center gap-1.5"
        role="progressbar"
        aria-label="Check yourself progress"
        aria-valuemin={1}
        aria-valuemax={questions.length}
        aria-valuenow={index + 1}
        aria-valuetext={`Question ${index + 1} of ${questions.length}`}
      >
        {questions.map((x, i) => (
          <span
            key={x.id}
            className={
              "h-1.5 flex-1 rounded-full transition-colors " +
              (i < results.length ? (results[i] ? "bg-good" : "bg-bad") : i === index ? "bg-ink" : "bg-surface-2")
            }
          />
        ))}
      </div>
      <QuestionCard
        question={q}
        selected={selected}
        onSelect={setSelected}
        feedback={feedback}
        onSubmit={submit}
        onNext={next}
        label={`${index + 1} of ${questions.length}`}
        compact
      />
      {error ? (
        <p role="alert" className="mt-3 text-sm text-bad">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex justify-end">
        {feedback ? (
          <Button onClick={next}>{index < questions.length - 1 ? "Next question" : "See result"}</Button>
        ) : (
          <Button onClick={submit} disabled={selected.length === 0 || pending}>
            {pending ? <Loader2 size={16} className="animate-spin" /> : null}
            Check answer
          </Button>
        )}
      </div>
    </div>
  );
}
