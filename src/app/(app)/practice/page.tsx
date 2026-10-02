import type { Metadata } from "next";
import { Target } from "lucide-react";
import { getViewer } from "@/lib/viewer";
import { getCertQuestions } from "@/lib/content";
import { currentMistakes, domainStats, getFlags, questionHistory } from "@/lib/repo/attempts";
import type { PracticeMode } from "@/lib/quiz-types";
import { EmptyState, PageHeader } from "@/components/ui/card";
import { PracticeClient } from "./practice-client";

export const metadata: Metadata = { title: "Practice" };

const MODES: PracticeMode[] = ["adaptive", "domain", "task", "weak", "mistakes", "flagged"];

export default async function PracticePage({ searchParams }: PageProps<"/practice">) {
  const { user, cert } = await getViewer();
  const sp = await searchParams;
  if (!cert) {
    return (
      <>
        <PageHeader title="Practice" />
        <EmptyState icon={<Target size={28} />} title="No exam content yet" body="Questions appear here once content is added." />
      </>
    );
  }
  const questions = getCertQuestions(cert.id);
  const ids = new Set(questions.map((q) => q.id));
  const history = await questionHistory(user.id);
  const stats = await domainStats(user.id, cert.id, cert.domains.map((d) => d.id));
  const mistakes = (await currentMistakes(user.id)).filter((id) => ids.has(id));
  const flagged = (await getFlags(user.id)).filter((id) => ids.has(id));
  const unseen = questions.filter((q) => !history[q.id]).length;

  const modeParam = typeof sp.mode === "string" && MODES.includes(sp.mode as PracticeMode) ? (sp.mode as PracticeMode) : null;
  const domainParam = typeof sp.domain === "string" && cert.domains.some((d) => d.id === sp.domain) ? sp.domain : undefined;
  const taskParam = typeof sp.task === "string" ? sp.task : undefined;

  return (
    <>
      <PageHeader title="Practice" sub="Short sets with instant feedback. Every answer moves your mastery estimate, and mistakes come back until you get them right." />
      {questions.length === 0 ? (
        <EmptyState icon={<Target size={28} />} title="No questions for this exam yet" body="Practice questions will show up here as soon as they're added." />
      ) : (
        <PracticeClient
          certId={cert.id}
          domains={cert.domains.map((d) => {
            const s = stats.find((x) => x.domainId === d.id);
            return {
              id: d.id,
              name: d.name,
              color: d.color,
              weight: d.weight,
              mastery: s?.mastery ?? 0.25,
              attempts: s?.attempts ?? 0,
              accuracy: s && s.attempts ? s.correct / s.attempts : null,
              questionCount: questions.filter((q) => q.domainId === d.id).length,
              tasks: d.taskStatements.map((t) => ({ id: t.id, text: t.text, count: questions.filter((q) => q.taskStatementId === t.id).length })),
            };
          })}
          counts={{ total: questions.length, mistakes: mistakes.length, flagged: flagged.length, unseen }}
          flaggedIds={flagged}
          autoStart={modeParam ? { mode: modeParam, domainId: domainParam, taskId: taskParam } : null}
        />
      )}
    </>
  );
}
