import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, Card, Pill } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth";
import { listContentReports, listIntegrityCases } from "@/lib/repo/reviews";
import { reviewContentReport, reviewIntegrityCase } from "@/app/actions/reviews";

export const metadata: Metadata = { title: "Admin reviews" };

export default async function AdminReviewsPage() {
  await requireAdmin();
  const [reports, cases] = await Promise.all([listContentReports(), listIntegrityCases()]);
  const openReports = reports.filter((r) => r.report.status === "open");
  const openCases = cases.filter((c) => !c.review || c.review.status === "open");
  return <div className="min-w-0 space-y-6">
    <PageHeader title="Review queues" sub="Triage content reports and inspect mock signals before making any decision." />
    <div className="flex flex-wrap gap-3 text-sm"><Link href="/admin" className="underline underline-offset-4">Back to dashboard</Link><span>{openReports.length} open content reports</span><span>{openCases.length} open integrity signals</span></div>
    <Card className="min-w-0 p-5 sm:p-6">
      <h2 className="font-display text-xl font-semibold">Content reports</h2>
      {reports.length === 0 ? <p className="mt-3 text-sm text-muted">No reports yet.</p> : <ol className="mt-4 divide-y divide-line">{reports.map(({ report, learner }) => <li key={report.id} className="min-w-0 py-4">
        <div className="flex flex-wrap items-center gap-2"><Pill tone={report.status === "open" ? "accent" : "good"}>{report.status}</Pill><span className="font-medium">{report.kind} · {report.reason}</span><span className="font-mono text-xs text-muted wrap-anywhere">{report.contentId}</span></div>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink-2">{report.detail}</p>
        <p className="mt-2 text-xs text-muted">{learner} · {new Date(report.createdAt).toLocaleString()}</p>
        {report.status === "open" ? <form action={reviewContentReport} className="mt-3 flex min-w-0 flex-wrap gap-2">
          <input type="hidden" name="id" value={report.id} /><input name="resolution" aria-label="Resolution note" placeholder="Resolution note" maxLength={2000} className="min-h-10 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 text-sm" />
          <button name="status" value="resolved" className="min-h-10 rounded-lg bg-ink px-3 text-sm text-bg">Resolve</button><button name="status" value="dismissed" className="min-h-10 rounded-lg border border-line px-3 text-sm">Dismiss</button>
        </form> : report.resolution ? <p className="mt-2 text-sm text-muted">Resolution: {report.resolution}</p> : null}
      </li>)}</ol>}
    </Card>
    <Card className="min-w-0 p-5 sm:p-6">
      <h2 className="font-display text-xl font-semibold">Mock integrity signals</h2>
      <p className="mt-1 text-sm text-muted">Server-recorded exam duration and score can point to attempts worth inspecting. A signal alone is not proof of misconduct.</p>
      {cases.length === 0 ? <p className="mt-3 text-sm text-muted">No attempts meet the review rule.</p> : <ol className="mt-4 divide-y divide-line">{cases.map(({ attempt, learner, review, signal }) => <li key={attempt.id} className="min-w-0 py-4">
        <div className="flex flex-wrap items-center gap-2"><Pill tone={!review || review.status === "open" ? "accent" : "good"}>{review?.status ?? "open"}</Pill><span className="font-medium">{learner}</span><span className="font-mono text-xs text-muted wrap-anywhere">{attempt.certId} · {attempt.id}</span></div>
        <p className="mt-2 text-sm text-ink-2">{signal}</p>
        <p className="mt-1 text-xs text-muted">Submitted {attempt.submittedAt ? new Date(attempt.submittedAt).toLocaleString() : "—"}. Client-reported per-question timing is excluded from this rule.</p>
        {!review || review.status === "open" ? <form action={reviewIntegrityCase} className="mt-3 flex min-w-0 flex-wrap gap-2">
          <input type="hidden" name="attemptId" value={attempt.id} /><input name="note" aria-label="Review note" placeholder="Review note" maxLength={2000} className="min-h-10 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 text-sm" />
          <button name="status" value="reviewed" className="min-h-10 rounded-lg bg-ink px-3 text-sm text-bg">Mark reviewed</button><button name="status" value="dismissed" className="min-h-10 rounded-lg border border-line px-3 text-sm">Dismiss signal</button>
        </form> : review.note ? <p className="mt-2 text-sm text-muted">Reviewer note: {review.note}</p> : null}
      </li>)}</ol>}
    </Card>
  </div>;
}
