import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { getViewer } from "@/lib/viewer";
import { getCertQuestions } from "@/lib/content";
import { inProgressAttempt, listMockAttempts } from "@/lib/repo/mock";
import { mockDurationMinutes } from "@/lib/mock-service";
import { Card, CardHeader, EmptyState, PageHeader, Pill } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { StartMockButton } from "./start-button";
import { ScoreTrend } from "./score-trend";

export const metadata: Metadata = { title: "Mock exam" };

function fmtDate(t: number) {
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default async function MockPage() {
  const { user, cert } = await getViewer();
  if (!cert) {
    return (
      <>
        <PageHeader title="Mock exam" />
        <EmptyState icon={<ClipboardCheck size={28} />} title="No exam content yet" body="Mock exams become available once questions are added." />
      </>
    );
  }
  const info = cert.examInfo;
  const bank = getCertQuestions(cert.id).length;
  const count = Math.min(bank, info.questionCount);
  const minutes = mockDurationMinutes(info.durationMinutes, info.questionCount, count);
  const current = await inProgressAttempt(user.id, cert.id);
  const history = (await listMockAttempts(user.id, cert.id)).filter((a) => a.status === "submitted");
  const best = history.reduce((m, a) => Math.max(m, a.score ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Mock exam"
        sub="A full timed run under exam conditions: no feedback until you submit, flag anything you want to revisit, and your answers save as you go."
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-6 sm:p-8">
          <h2 className="font-display text-xl font-semibold tracking-tight">{cert.name}</h2>
          <dl className="mt-6 grid grid-cols-3 gap-3">
            {[
              ["Questions", count],
              ["Minutes", minutes],
              ["Pass mark", info.passingScore],
            ].map(([k, v]) => (
              <div key={k as string} className="rounded-xl bg-surface-2/70 px-3 py-4">
                <dd className="font-display text-2xl font-semibold tabular sm:text-3xl">{v}</dd>
                <dt className="mt-0.5 text-sm text-muted">{k}</dt>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-sm text-ink-2">
            Scored on a {info.scoreScale || "100–1000"} scale. {(cert.scenarios?.length ?? 0) >= 4
              ? "Like the real exam, questions come in blocks from four randomly chosen scenarios."
              : "Questions are drawn in proportion to each domain\u2019s exam weight."}
            {count < info.questionCount
              ? ` The question bank has ${bank} question${bank === 1 ? "" : "s"} so far, so this mock is shortened to ${count} with the time scaled to match (the real exam has ${info.questionCount} in ${info.durationMinutes} minutes).`
              : ""}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {current ? (
              <>
                <ButtonLink href={`/mock/${current.id}`} variant="accent" size="lg">
                  Resume your mock
                </ButtonLink>
                <span className="text-sm text-muted">
                  {Object.keys(current.state.answers).length} of {current.state.questionIds.length} answered
                </span>
              </>
            ) : count > 0 ? (
              <StartMockButton certId={cert.id} />
            ) : (
              <p className="text-sm text-muted">No questions available yet.</p>
            )}
          </div>
        </Card>

        <Card className="p-6">
          <CardHeader title="Before you start" />
          <ul className="mt-4 space-y-2.5 text-[0.95rem] text-ink-2">
            <li>Find {minutes} uninterrupted minutes. The clock keeps running if you leave.</li>
            <li>Read the last line of each question first, then the scenario.</li>
            <li>Stuck for more than two minutes? Flag it and move on.</li>
            <li>Leave nothing blank. Unanswered questions score zero.</li>
          </ul>
        </Card>
      </div>

      <section className="mt-10">
        <div className="mb-4 flex items-end justify-between gap-3">
          <h2 className="font-display text-xl font-semibold tracking-tight">Your attempts</h2>
          {history.length ? <span className="text-sm text-muted tabular">Best {best}</span> : null}
        </div>
        {history.length === 0 ? (
          <EmptyState title="No mocks yet" body="Your first mock gives you a baseline. Most people score lower than they expect, and that’s the point: it shows you where to aim." />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
            <Card className="p-5">
              <CardHeader title="Score trend" sub={`Pass line at ${info.passingScore}`} />
              <ScoreTrend scores={[...history].reverse().map((a) => a.score ?? 0)} pass={info.passingScore} />
            </Card>
            <Card className="overflow-hidden">
              <ul className="divide-y divide-line">
                {history.map((a) => (
                  <li key={a.id}>
                    <Link href={`/mock/${a.id}/results`} className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-surface-2/60">
                      <span className="font-display text-xl font-semibold tabular">{a.score}</span>
                      <Pill tone={a.passed ? "good" : "bad"}>{a.passed ? "Pass" : "Below pass"}</Pill>
                      <span className="ml-auto text-sm text-muted tabular">
                        {a.correct}/{a.total} correct, {fmtDate(a.submittedAt ?? a.startedAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        )}
      </section>
    </>
  );
}
