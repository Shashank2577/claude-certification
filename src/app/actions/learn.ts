"use server";

import { requireUser } from "@/lib/auth";
import { getAllLessons } from "@/lib/content";
import { XP, type Reward } from "@/lib/gamification";
import { recordActivity } from "@/lib/repo/activity";
import { markLessonDone } from "@/lib/repo/progress";

/** Marks a lesson done. Returns the reward the first time only; null on repeats or unknown ids. */
export async function completeLesson(lessonId: string): Promise<Reward | null> {
  const user = await requireUser();
  const lesson = getAllLessons().find((l) => l.id === lessonId);
  if (!lesson) return null;
  if (!await markLessonDone(user.id, { id: lesson.id, certId: lesson.certId, domainId: lesson.domainId })) return null;
  return await recordActivity(user.id, {
    kind: "lesson",
    refId: lesson.id,
    xp: XP.lessonComplete,
    minutes: lesson.estMinutes || 0,
    meta: { title: lesson.title, domainId: lesson.domainId },
  });
}
