import type { Metadata } from "next";
import { Compass, ExternalLink, MessageSquareQuote, OctagonAlert } from "lucide-react";
import { getInsights, getResources } from "@/lib/content";
import { doneResourceIds } from "@/lib/repo/resources";
import { getViewer } from "@/lib/viewer";
import { Card, EmptyState, PageHeader, Pill } from "@/components/ui/card";
import { Checklist } from "./checklist";
import { Clamp, InsightsTabs } from "./insights-tabs";
import { ResourcesPanel } from "./resources-panel";

export const metadata: Metadata = { title: "Insights" };

export default async function InsightsPage() {
  const { user, settings, certs } = await getViewer();
  const insights = getInsights();
  const myCerts = certs.filter((c) => settings.certIds.includes(c.id));
  const certIds = new Set(myCerts.map((c) => c.id));
  const certName = new Map(certs.map((c) => [c.id, c.name.replace(/^Claude Certified Architect\s*[–-]\s*/, "")]));
  const resources = getResources().filter((r) => r.certIds.length === 0 || r.certIds.some((id) => certIds.has(id)));
  const domains = myCerts.flatMap((c) => c.domains.map((d) => ({ id: d.id, name: myCerts.length > 1 ? `${d.name} (${certName.get(c.id)})` : d.name })));
  const reports = [...insights.candidateReports].sort((a, b) => Number(certIds.has(b.cert)) - Number(certIds.has(a.cert)));

  const doneIds = await doneResourceIds(user.id);

  const reportsPanel = (
    <section aria-labelledby="reports-h">
      <h2 id="reports-h" className="sr-only">
        From past candidates
      </h2>
      {reports.length === 0 ? (
        <EmptyState icon={<MessageSquareQuote size={26} />} title="No candidate reports yet" />
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-2">
          {reports.map((r, i) => (
            <Card key={i} className="flex min-w-0 flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 font-display font-semibold">{r.source}</p>
                {certName.get(r.cert) ? <Pill>{certName.get(r.cert)}</Pill> : null}
              </div>
              <Clamp className="mt-2" maxHeight="5.1rem">
                <p className="font-serif text-[1.05rem] leading-relaxed text-ink">{r.summary}</p>
                {r.tips.length > 0 ? (
                  <ul className="mt-3 space-y-1.5 text-sm text-ink-2">
                    {r.tips.map((t, j) => (
                      <li key={j} className="flex gap-2">
                        <span className="mt-[0.45rem] size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                        {t}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Clamp>
              {r.url ? (
                <a href={r.url} target="_blank" rel="noreferrer" className="mt-auto inline-flex items-center gap-1 pt-3 text-sm font-medium text-accent-text hover:underline">
                  Read the original <ExternalLink size={13} aria-hidden />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </section>
  );

  const mindsetPanel = (
    <section aria-labelledby="mindset-h">
      <h2 id="mindset-h" className="sr-only">
        Architect mindset
      </h2>
      <p className="text-ink-2">When two answers both look right, these principles usually break the tie.</p>
      {insights.mindsetPrinciples.length === 0 ? (
        <div className="mt-4">
          <EmptyState icon={<Compass size={26} />} title="No principles yet" />
        </div>
      ) : (
        <div className="mt-5 grid items-start gap-4 md:grid-cols-2">
          {insights.mindsetPrinciples.map((p) => (
            <article key={p.id} className="min-w-0 rounded-2xl border-l-4 border-accent bg-surface p-5 shadow-card">
              <h3 className="font-display text-lg font-semibold tracking-tight">{p.title}</h3>
              <Clamp className="mt-2" maxHeight="4.6rem">
                <p className="text-ink-2">{p.body}</p>
                {p.example ? (
                  <p className="mt-3 rounded-xl bg-surface-2/70 px-3.5 py-2.5 text-sm">
                    <span className="font-semibold">For example: </span>
                    {p.example}
                  </p>
                ) : null}
              </Clamp>
            </article>
          ))}
        </div>
      )}
    </section>
  );

  const examDayPanel = (
    <section className="grid items-start gap-4 lg:grid-cols-2" aria-label="Exam day">
      <Card className="min-w-0 p-5 sm:p-6">
        <h2 className="font-display text-xl font-semibold tracking-tight">Exam-day checklist</h2>
        <div className="mt-3">
          {insights.examDayChecklist.length ? <Checklist items={insights.examDayChecklist} /> : <p className="text-sm text-muted">No checklist yet.</p>}
        </div>
      </Card>
      <Card tone="sunken" className="min-w-0 p-5 sm:p-6">
        <h2 className="flex items-center gap-2 font-display text-xl font-semibold tracking-tight">
          <OctagonAlert size={19} className="text-bad" aria-hidden /> Common mistakes
        </h2>
        {insights.commonMistakes.length ? (
          <ul className="mt-4 space-y-3">
            {insights.commonMistakes.map((m, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-[0.55rem] size-1.5 shrink-0 rounded-full bg-bad" aria-hidden />
                <span>{m}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted">Nothing recorded yet.</p>
        )}
      </Card>
    </section>
  );

  const resourcesPanel = (
    <section aria-labelledby="resources-h">
      <h2 id="resources-h" className="sr-only">
        Resources
      </h2>
      <p className="mb-5 text-ink-2">Start with the must-reads. Ticking one off earns 10 XP.</p>
      <ResourcesPanel resources={resources} domains={domains} initialDone={doneIds} />
    </section>
  );

  return (
    <>
      <PageHeader title="Insights" sub="What people who sat the exam noticed, how to think like the exam wants you to, and the reading worth your time." />
      <InsightsTabs
        tabs={[
          { id: "reports", label: "From past candidates", content: reportsPanel },
          { id: "mindset", label: "Architect mindset", content: mindsetPanel },
          { id: "exam-day", label: "Exam day", content: examDayPanel },
          { id: "resources", label: "Resources", content: resourcesPanel },
        ]}
      />
    </>
  );
}
