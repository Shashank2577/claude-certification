import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getCertLessons, getCerts, getStudyPlans } from "@/lib/content";
import { getSettings } from "@/lib/repo/settings";
import { OnboardingWizard } from "./wizard";

export const metadata: Metadata = { title: "Set up your plan" };

export default async function OnboardingPage() {
  const user = await requireUser();
  const settings = await getSettings(user.id);
  const certs = getCerts().map((c) => ({
    id: c.id,
    name: c.name,
    tagline: c.tagline,
    domains: c.domains.length,
    lessons: getCertLessons(c.id).length,
    minutes: getCertLessons(c.id).reduce((s, l) => s + (l.estMinutes || 0), 0),
    passingScore: c.examInfo.passingScore,
    questionCount: c.examInfo.questionCount,
  }));
  const plans = getStudyPlans().map((p) => ({ id: p.id, title: p.title, certId: p.certId, description: p.description, days: p.days.length }));
  return (
    <div className="canvas-grid min-h-dvh">
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
    </div>
  );
}
