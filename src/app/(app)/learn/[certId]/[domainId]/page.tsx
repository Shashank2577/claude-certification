import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, Check, Circle, CircleDot, Clock } from "lucide-react";
import { getCert, getLessons } from "@/lib/content";
import { getLessonProgress } from "@/lib/repo/progress";
import { getViewer } from "@/lib/viewer";
import { Card, EmptyState, Pill } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress";

export async function generateMetadata({ params }: PageProps<"/learn/[certId]/[domainId]">): Promise<Metadata> {
  const { certId, domainId } = await params;
  const d = getCert(certId)?.domains.find((x) => x.id === domainId);
  return { title: d?.name ?? "Domain" };
}

export default async function DomainPage({ params }: PageProps<"/learn/[certId]/[domainId]">) {
  const { certId, domainId } = await params;
  const { user } = await getViewer();
  const cert = getCert(certId);
  const domain = cert?.domains.find((d) => d.id === domainId);
  if (!cert || !domain) notFound();

  const lessons = getLessons(certId, domainId);
  const progress = await getLessonProgress(user.id);
  const done = lessons.filter((l) => progress.get(l.id)?.status === "done").length;
  const next = lessons.find((l) => progress.get(l.id)?.status !== "done");
  const color = domain.color || "var(--accent)";

  return (
    <>
      <Link href={`/learn?cert=${cert.id}`} className="mb-5 inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft size={15} /> All domains
      </Link>

      <header className="mb-8">
        <div className="mb-4 h-1.5 w-16 rounded-full" style={{ background: color }} aria-hidden />
        <h1 className="font-display text-3xl font-semibold tracking-[-0.025em] sm:text-[2.5rem] sm:leading-[1.05]">{domain.name}</h1>
        <p className="mt-3 max-w-[62ch] text-ink-2">{domain.summary}</p>
        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
          <span className="text-sm text-muted tabular">{domain.weight}% of the exam</span>
          <div className="w-full max-w-xs">
            <ProgressBar value={lessons.length ? done / lessons.length : 0} color={color} label="Domain progress" />
          </div>
          <span className="text-sm text-muted tabular">
            {done}/{lessons.length} lessons
          </span>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          {next ? (
            <ButtonLink href={`/learn/${cert.id}/${domain.id}/${next.id}`} variant="accent">
              {progress.has(next.id) ? "Continue" : "Start"} with {next.title}
            </ButtonLink>
          ) : null}
          <ButtonLink href={`/practice?mode=domain&domain=${domain.id}`} variant="outline">
            Practise this domain
          </ButtonLink>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
        <section aria-labelledby="lessons-h">
          <h2 id="lessons-h" className="mb-3 font-display text-lg font-semibold">
            Lessons
          </h2>
          {lessons.length === 0 ? (
            <EmptyState icon={<BookOpen size={26} />} title="No lessons in this domain yet" body="Practice questions and flashcards may still be available." />
          ) : (
            <ol className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
              {lessons.map((l, i) => {
                const st = progress.get(l.id)?.status;
                return (
                  <li key={l.id}>
                    <Link href={`/learn/${cert.id}/${domain.id}/${l.id}`} className="flex items-center gap-4 px-4 py-4 transition-colors hover:bg-surface-2/60 sm:px-5">
                      <span className="shrink-0" aria-hidden>
                        {st === "done" ? (
                          <span className="grid size-7 place-items-center rounded-full bg-good text-white">
                            <Check size={15} strokeWidth={3} />
                          </span>
                        ) : st === "started" ? (
                          <CircleDot size={28} className="text-accent-strong" />
                        ) : (
                          <Circle size={28} className="text-line-strong" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">
                          <span className="mr-2 text-muted tabular">{i + 1}.</span>
                          {l.title}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                          <span className="inline-flex items-center gap-1 tabular">
                            <Clock size={12} /> {l.estMinutes} min
                          </span>
                          {l.level === "deep" ? <Pill tone="info">Deep dive</Pill> : null}
                          {l.taskStatementIds.map((t) => (
                            <span key={t} className="tabular">
                              Task {t}
                            </span>
                          ))}
                        </span>
                      </span>
                      <span className="sr-only">{st === "done" ? "Completed" : st === "started" ? "In progress" : "Not started"}</span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {domain.taskStatements.length > 0 ? (
          <Card tone="sunken" className="p-5">
            <h2 className="font-display font-semibold">What the exam expects</h2>
            <ul className="mt-3 space-y-3">
              {domain.taskStatements.map((t) => (
                <li key={t.id} className="flex gap-3 text-sm">
                  <span className="shrink-0 font-display font-semibold text-accent-text tabular">{t.id}</span>
                  <span className="text-ink-2">{t.text}</span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </>
  );
}
