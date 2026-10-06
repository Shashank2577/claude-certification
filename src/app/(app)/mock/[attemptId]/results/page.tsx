import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getViewer } from "@/lib/viewer";
import { getCert, getQuestionMap } from "@/lib/content";
import { toPublicQuestion } from "@/lib/content-types";
import { isCorrect } from "@/lib/scoring";
import { getMockAttempt } from "@/lib/repo/mock";
import { Card, CardHeader, PageHeader, Pill } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress";
import { ScoreDial } from "./score-dial";
import { ReviewList, type ReviewItem } from "./review-list";
import { ReviewQueue } from "@/components/review-queue";
import { buildReviewPlan } from "@/lib/review-plan";

export const metadata: Metadata = { title: "Mock results" };

function fmtDuration(ms: number) {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m ? `${m}m ${s % 60}s` : `${s}s`;
}

export default async function MockResultsPage({ params }: PageProps<"/mock/[attemptId]/results">) {
  const { attemptId } = await params;
  const { user, settings } = await getViewer();
  const attempt = await getMockAttempt(user.id, attemptId);
  if (!attempt) notFound();
  if (attempt.status !== "submitted") redirect(`/mock/${attempt.id}`);

  const cert = getCert(attempt.certId);
  const pass = cert?.examInfo.passingScore ?? 720;
  const qmap = getQuestionMap();
  const { state } = attempt;
  const domainName = new Map((cert?.domains ?? []).map((d) => [d.id, d.name]));
  const domainColor = new Map((cert?.domains ?? []).map((d) => [d.id, d.color]));

  const items: ReviewItem[] = state.questionIds.flatMap((id, i) => {
    const q = qmap.get(id);
    if (!q) return [];
    const selected = state.answers[id] ?? [];
    return [
      {
        n: i + 1,
        question: toPublicQuestion(q),
        selected,
        correct: isCorrect(selected, q.correct),
        correctIds: q.correct,
        explanation: q.explanation,
        whyWrong: q.whyWrong,
        mindset: q.mindset,
        flagged: state.flags.includes(id),
        ms: state.timeMs[id] ?? 0,
        domainName: domainName.get(q.domainId) ?? q.domainId,
      },
    ];
  });

  const totalMs = items.reduce((s, x) => s + x.ms, 0);
  const avgMs = items.length ? totalMs / items.length : 0;
  const slowest = [...items].sort((a, b) => b.ms - a.ms).slice(0, 3);
  const unanswered = items.filter((x) => x.selected.length === 0).length;
  const score = attempt.score ?? 100;
  const gap = score - pass;
  const weakest = [...attempt.breakdown].sort((a, b) => a.correct / a.total - b.correct / b.total)[0];
  const plan = cert ? await buildReviewPlan(user.id, cert, settings.tz, attempt.id) : null;

  return (
    <>
      <PageHeader
        title="Mock results"
        sub={`${cert?.name ?? "Mock exam"}, submitted ${new Date(attempt.submittedAt ?? attempt.startedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`}
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/mock" variant="outline">
              All attempts
            </ButtonLink>
            {weakest ? (
              <ButtonLink href={`/practice?mode=domain&domain=${encodeURIComponent(weakest.domainId)}`} variant="accent">
                Practise weakest domain
              </ButtonLink>
            ) : null}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Card className="min-w-0 p-6 sm:p-8">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
            <ScoreDial score={score} pass={pass} />
            <div className="text-center sm:text-left">
              <Pill tone={attempt.passed ? "good" : "bad"} className="text-sm">
                {attempt.passed ? "Pass" : "Below the pass mark"}
              </Pill>
              <p className="mt-3 font-display text-2xl font-semibold tracking-tight">
                {attempt.passed ? `${gap} points above the line.` : `${Math.abs(gap)} points to go.`}
              </p>
              <p className="mt-1 text-ink-2 tabular">
                {attempt.correct} of {attempt.total} correct{unanswered ? `, ${unanswered} left blank` : ""}. Total time {fmtDuration(totalMs)}, about {fmtDuration(avgMs)} per question.
              </p>
            </div>
          </div>
        </Card>

        <Card className="min-w-0 p-6">
          <CardHeader title="By domain" sub="Weighted as on the real exam" />
          <ul className="mt-5 space-y-4">
            {attempt.breakdown.map((d) => (
              <li key={d.domainId}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate font-medium">{d.name}</span>
                  <span className="shrink-0 text-muted tabular">
                    {d.correct}/{d.total} ({Math.round((d.correct / d.total) * 100)}%)
                  </span>
                </div>
                <ProgressBar className="mt-1.5" value={d.correct / d.total} color={domainColor.get(d.domainId) ?? "var(--ink)"} height={7} label={`${d.name} score`} />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {plan && <div className="mt-6"><ReviewQueue plan={plan} /></div>}

      {slowest.length > 0 && slowest[0].ms > 0 ? (
        <Card tone="sunken" className="mt-6 p-5">
          <CardHeader title="Where your time went" sub="Your three slowest questions" />
          <ul className="mt-3 flex flex-wrap gap-2">
            {slowest.map((x) => (
              <li key={x.question.id}>
                <a href={`#q-${x.n}`} className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-1.5 text-sm hover:border-line-strong">
                  <span className="font-semibold tabular">Q{x.n}</span>
                  <span className="text-muted tabular">{fmtDuration(x.ms)}</span>
                  <span className={x.correct ? "text-good" : x.selected.length === 0 ? "text-muted" : "text-bad"}>{x.correct ? "right" : x.selected.length === 0 ? "skipped" : "wrong"}</span>
                </a>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <section className="mt-10">
        <h2 className="mb-4 font-display text-xl font-semibold tracking-tight">Review every question</h2>
        <ReviewList items={items} />
      </section>
    </>
  );
}
