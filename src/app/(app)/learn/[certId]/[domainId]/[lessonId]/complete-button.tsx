"use client";

import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Loader2 } from "lucide-react";
import { completeLesson } from "@/app/actions/learn";
import { burst, useCelebrate } from "@/components/celebrate";
import { Button } from "@/components/ui/button";

export function CompleteButton({ lessonId, done: initialDone }: { lessonId: string; done: boolean }) {
  const [done, setDone] = useState(initialDone);
  const [pending, start] = useTransition();
  const { celebrate } = useCelebrate();

  if (done) {
    return (
      <motion.span
        initial={{ scale: 0.9, opacity: 0 }}
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
    );
  }

  return (
    <Button
      size="lg"
      variant="accent"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const reward = await completeLesson(lessonId);
          setDone(true);
          if (reward) {
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
  );
}
