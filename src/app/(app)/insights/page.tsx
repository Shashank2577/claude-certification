import type { Metadata } from "next";
import { Compass, ExternalLink, MessageSquareQuote, OctagonAlert } from "lucide-react";
import { getInsights, getResources } from "@/lib/content";
import { doneResourceIds } from "@/lib/repo/resources";
import { getViewer } from "@/lib/viewer";
import { Card, EmptyState, PageHeader, Pill } from "@/components/ui/card";
import { Checklist } from "./checklist";
import { ResourcesPanel } from "./resources-panel";

export const metadata: Metadata = { title: "Insights" };

const SECTIONS = [
  { id: "reports", label: "From past candidates" },
  { id: "mindset", label: "Architect mindset" },
  { id: "exam-day", label: "Exam day" },
  { id: "resources", label: "Resources" },
];

export default async function InsightsPage() {
  const { user, settings, certs } = await getViewer();
  const insights = getInsights();
  const myCerts = certs.filter((c) => settings.certIds.includes(c.id));
  const certIds = new Set(myCerts.map((c) => c.id));
  const certName = new Map(certs.map((c) => [c.id, c.name.replace(/^Claude Certified Architect\s*[–-]\s*/, "")]));
  const resources = getResources().filter((r) => r.certIds.length === 0 || r.certIds.some((id) => certIds.has(id)));
  const domains = myCerts.flatMap((c) => c.domains.map((d) => ({ id: d.id, name: myCerts.length > 1 ? `${d.name} (${certName.get(c.id)})` : d.name })));
  const reports = [...insights.candidateReports].sort((a, b) => Number(certIds.has(b.cert)) - Number(certIds.has(a.cert)));

  return (
    <>
      <PageHeader title="Insights" sub="What people who sat the exam noticed, how to think like the exam wants you to, and the reading worth your time." />

      <nav aria-label="On this page" className="-mx-4 mb-8 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="shrink-0 rounded-xl border border-line-strong bg-surface px-3.5 py-2 text-sm font-medium text-ink-2 hover:border-ink hover:text-ink">
            {s.label}
          </a>
        ))}
      </nav>

      <section id="reports" className="scroll-mt-20" aria-labelledby="reports-h">
        <h2 id="reports-h" className="font-display text-2xl font-semibold tracking-tight">
          From past candidates
        </h2>
        {reports.length === 0 ? (
          <div className="mt-4">
            <EmptyState icon={<MessageSquareQuote size={26} />} title="No candidate reports yet" />
          </div>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {reports.map((r, i) => (
              <Card key={i} className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-display font-semibold">{r.source}</p>
                  {certName.get(r.cert) ? <Pill>{certName.get(r.cert)}</Pill> : null}
                </div>
                <p className="mt-2 font-serif text-[1.05rem] leading-relaxed text-ink">{r.summary}</p>
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
                {r.url ? (
                  <a href={r.url} target="_blank" rel="noreferrer" className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-medium text-accent-text hover:underline">
                    Read the original <ExternalLink size={13} aria-hidden />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </section>

      <section id="mindset" className="mt-14 scroll-mt-20" aria-labelledby="mindset-h">
        <h2 id="mindset-h" className="font-display text-2xl font-semibold tracking-tight">
          Architect mindset
        </h2>
        <p className="mt-1 text-ink-2">When two answers both look right, these principles usually break the tie.</p>
        {insights.mindsetPrinciples.length === 0 ? (
          <div className="mt-4">
            <EmptyState icon={<Compass size={26} />} title="No principles yet" />
          </div>
        ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {insights.mindsetPrinciples.map((p) => (
              <article key={p.id} className="rounded-2xl border-l-4 border-accent bg-surface p-5 shadow-card">
                <h3 className="font-display text-lg font-semibold tracking-tight">{p.title}</h3>
                <p className="mt-2 text-ink-2">{p.body}</p>
                {p.example ? (
                  <p className="mt-3 rounded-xl bg-surface-2/70 px-3.5 py-2.5 text-sm">
                    <span className="font-semibold">For example: </span>
                    {p.example}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      <section id="exam-day" className="mt-14 grid scroll-mt-20 gap-4 lg:grid-cols-2" aria-label="Exam day">
        <Card className="p-5 sm:p-6">
          <h2 className="font-display text-xl font-semibold tracking-tight">Exam-day checklist</h2>
          <div className="mt-3">
            {insights.examDayChecklist.length ? <Checklist items={insights.examDayChecklist} /> : <p className="text-sm text-muted">No checklist yet.</p>}
          </div>
        </Card>
        <Card tone="sunken" className="p-5 sm:p-6">
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

      <section id="resources" className="mt-14 scroll-mt-20" aria-labelledby="resources-h">
        <h2 id="resources-h" className="font-display text-2xl font-semibold tracking-tight">
          Resources
        </h2>
        <p className="mt-1 mb-5 text-ink-2">Start with the must-reads. Ticking one off earns 10 XP.</p>
        <ResourcesPanel resources={resources} domains={domains} initialDone={await doneResourceIds(user.id)} />
      </section>
    </>
  );
}
