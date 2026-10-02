import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getCertLessons, getCerts, getStudyPlans } from "@/lib/content";
import { getLessonProgress } from "@/lib/repo/progress";
import { getSettings } from "@/lib/repo/settings";
import { OnboardingWizard } from "./wizard";

export const metadata: Metadata = { title: "Set up your plan" };

export default async function OnboardingPage() {
  const user = await requireUser();
  const [settings, progress] = await Promise.all([getSettings(user.id), getLessonProgress(user.id)]);
  const isDone = (id: string) => progress.get(id)?.status === "done";
  const certs = getCerts().map((c) => ({
    id: c.id,
    name: c.name,
    tagline: c.tagline,
    domains: c.domains.length,
    lessons: getCertLessons(c.id).length,
    minutes: getCertLessons(c.id).reduce((s, l) => s + (l.estMinutes || 0), 0),
    passingScore: c.examInfo.passingScore,
    questionCount: c.examInfo.questionCount,
    // What the plan would still schedule, so the wizard can check the goal fits before the exam.
    planDomains: c.domains.map((d) => ({ id: d.id, name: d.name, weight: d.weight })),
    planLessons: getCertLessons(c.id)
      .filter((l) => !isDone(l.id))
      .map((l) => ({ id: l.id, title: l.title, domainId: l.domainId, estMinutes: l.estMinutes || 8, level: l.level })),
  }));
  const plans = getStudyPlans().map((p) => ({ id: p.id, title: p.title, certId: p.certId, description: p.description, days: p.days.length }));
  return (
    <main id="main" className="canvas-grid min-h-dvh">
      <OnboardingWizard
        name={user.name}
        certs={certs}
        plans={plans}
        initial={{
          certIds: settings.certIds,
          examDate: settings.examDate,
          dailyMinutes: settings.dailyMinutes,
          background: settings.background,
          returning: settings.onboarded,
        }}
      />
    </main>
  );
}
