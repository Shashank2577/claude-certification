import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getViewer } from "@/lib/viewer";
import { getCert, getQuestionMap } from "@/lib/content";
import { toPublicQuestion, type PublicQuestion } from "@/lib/content-types";
import { getMockAttempt } from "@/lib/repo/mock";
import { finalizeMock, isMockExpired, serverNow } from "@/lib/mock-service";
import { MockRunner } from "./runner";

export const metadata: Metadata = { title: "Mock exam in progress" };

export default async function MockAttemptPage({ params }: PageProps<"/mock/[attemptId]">) {
  const { attemptId } = await params;
  const { user } = await getViewer();
  const attempt = await getMockAttempt(user.id, attemptId);
  if (!attempt) notFound();
  if (attempt.status === "submitted") redirect(`/mock/${attempt.id}/results`);
  if (isMockExpired(attempt)) {
    // Time ran out while away: score what was autosaved.
    await finalizeMock(user.id, attempt);
    redirect(`/mock/${attempt.id}/results`);
  }
  const cert = getCert(attempt.certId);
  const qmap = getQuestionMap();
  const questions = attempt.state.questionIds.map((id) => qmap.get(id)).filter((q): q is NonNullable<typeof q> => !!q);
  const publicQs: PublicQuestion[] = questions.map(toPublicQuestion);

  return (
    <MockRunner
      attemptId={attempt.id}
      certName={cert?.name ?? "Mock exam"}
      questions={publicQs}
      domainNames={Object.fromEntries((cert?.domains ?? []).map((d) => [d.id, d.name]))}
      initialState={attempt.state}
      endsAt={attempt.endsAt}
      serverNow={serverNow()}
    />
  );
}
