"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { completeLesson } from "@/app/actions/learn";
import { burst, useCelebrate } from "@/components/celebrate";
import { Button, ButtonLink } from "@/components/ui/button";

export interface NextLesson {
  href: string;
  title: string;
  minutes: number;
}

export function CompleteButton({
  lessonId,
  done: initialDone,
  next,
  goalLeftAfter,
}: {
  lessonId: string;
  done: boolean;
  /** Next unfinished core lesson in cert order, computed on the server. */
  next: NextLesson | null;
  /** Minutes left in today's goal once this lesson's minutes count; null when unknown. */
  goalLeftAfter: number | null;
}) {
  const [done, setDone] = useState(initialDone);
  // State, not derived from props: the router.refresh() after completing flips `initialDone` to true.
  const [justCompleted, setJustCompleted] = useState(false);
  const [earned, setEarned] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const { celebrate } = useCelebrate();
  const reduce = useReducedMotion();
  const nextRef = useRef<HTMLAnchorElement>(null);
  // The "Mark complete" button disappears on success; hand keyboard focus to the next step.
  useEffect(() => {
    if (justCompleted) nextRef.current?.focus();
  }, [justCompleted]);

  if (done) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <motion.span
            initial={reduce ? false : { scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 420, damping: 22 }}
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-good-soft px-5 font-medium text-good"
            role="status"
          >
            <span className="grid size-6 place-items-center rounded-full bg-good text-white">
              <Check size={14} strokeWidth={3} />
            </span>
            Lesson complete
          </motion.span>
          {justCompleted && earned ? (
            <p className="text-sm text-ink-2 tabular" role="status">
              +{earned} XP.{" "}
              {goalLeftAfter == null ? null : goalLeftAfter > 0 ? `${goalLeftAfter} min left in today's goal.` : "Today's goal is done."}
            </p>
          ) : null}
        </div>
        {next ? (
          <ButtonLink
            href={next.href}
            variant={justCompleted ? "accent" : "outline"}
            size="lg"
            wrap
            ref={nextRef}
            className="w-full justify-between! sm:w-auto sm:max-w-md"
          >
            <span className="min-w-0">
              <span className="block text-sm font-normal opacity-85">Next{next.minutes ? ` (~${next.minutes} min)` : ""}</span>
              <span className="block">{next.title}</span>
            </span>
            <ArrowRight size={18} className="shrink-0" aria-hidden />
          </ButtonLink>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
      <Button
        size="lg"
        variant="accent"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const reward = await completeLesson(lessonId);
            setDone(true);
            setJustCompleted(true);
            if (reward) {
              setEarned(reward.xp);
              burst("small");
              celebrate(reward);
            }
          })
        }
      >
        <AnimatePresence mode="wait" initial={false}>
          {pending ? (
            <motion.span key="l" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Loader2 size={18} className="animate-spin" />
            </motion.span>
          ) : (
            <motion.span key="c" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Check size={18} />
            </motion.span>
          )}
        </AnimatePresence>
        Mark complete
      </Button>
      <p className="text-sm text-muted">+50 XP the first time you finish a lesson.</p>
    </div>
  );
}
