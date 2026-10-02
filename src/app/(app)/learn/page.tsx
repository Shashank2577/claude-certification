import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { clsx } from "clsx";
import { getCert, getCertLessons } from "@/lib/content";
import { getLessonProgress, lastStartedLesson } from "@/lib/repo/progress";
import { getViewer } from "@/lib/viewer";
import { EmptyState, PageHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress";

export const metadata: Metadata = { title: "Learn" };

export default async function LearnPage({ searchParams }: PageProps<"/learn">) {
  const sp = await searchParams;
  const { user, settings, cert: activeCert, certs } = await getViewer();
  const requested = typeof sp.cert === "string" ? getCert(sp.cert) : undefined;
  const cert = requested ?? activeCert;

  if (!cert) {
    return (
      <>
        <PageHeader title="Learn" />
        <EmptyState icon={<BookOpen size={28} />} title="No lessons yet" body="Study content hasn't been added. Check back once the content folder is filled in." />
      </>
    );
  }

  const lessons = getCertLessons(cert.id);
  const progress = await getLessonProgress(user.id);
  const resumeId = await lastStartedLesson(user.id);
  const resume = lessons.find((l) => l.id === resumeId);
  const nextUp = resume ?? lessons.find((l) => progress.get(l.id)?.status !== "done" && l.level !== "deep");
  const myCerts = certs.filter((c) => settings.certIds.includes(c.id));
  const doneTotal = lessons.filter((l) => progress.get(l.id)?.status === "done").length;

  return (
    <>
      <PageHeader
        title="Learn"
        sub={`${cert.name}. ${doneTotal} of ${lessons.length} lessons done.`}
        action={
          nextUp ? (
            <ButtonLink href={`/learn/${cert.id}/${nextUp.domainId}/${nextUp.id}`} variant="accent">
              {resume ? "Resume" : "Start"}: {nextUp.title.length > 28 ? `${nextUp.title.slice(0, 27)}…` : nextUp.title}
            </ButtonLink>
          ) : null
        }
      />

      {myCerts.length > 1 ? (
        <nav aria-label="Choose exam" className="mb-6 flex flex-wrap gap-2">
          {myCerts.map((c) => (
            <Link
              key={c.id}
              href={`/learn?cert=${c.id}`}
              aria-current={c.id === cert.id ? "page" : undefined}
              className={clsx(
                "rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors",
                c.id === cert.id ? "border-ink bg-ink text-bg" : "border-line-strong bg-surface text-ink-2 hover:border-ink hover:text-ink",
              )}
            >
              {c.name.replace(/^Claude Certified Architect\s*[–-]\s*/, "")}
            </Link>
          ))}
        </nav>
      ) : null}

      <ol className="grid gap-3">
        {cert.domains.map((d, i) => {
          const dl = lessons.filter((l) => l.domainId === d.id);
          const done = dl.filter((l) => progress.get(l.id)?.status === "done").length;
          const minutes = dl.reduce((s, l) => s + (l.estMinutes || 0), 0);
          return (
            <li key={d.id}>
              <Link
                href={`/learn/${cert.id}/${d.id}`}
                className="group grid gap-4 rounded-2xl border border-line bg-surface p-5 shadow-card transition-[border-color] hover:border-line-strong sm:grid-cols-[3rem_1fr_12rem] sm:items-center"
              >
                <span
                  className="grid size-12 place-items-center rounded-xl font-display text-lg font-semibold tabular"
                  style={{ background: `color-mix(in oklab, ${d.color || "var(--accent)"} 18%, transparent)`, color: "var(--ink)" }}
                  aria-hidden
                >
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <h2 className="font-display text-lg font-semibold tracking-tight group-hover:underline group-hover:underline-offset-4">{d.name}</h2>
                  <p className="mt-1 line-clamp-2 text-sm text-ink-2">{d.summary}</p>
                  <p className="mt-2 text-xs text-muted tabular">
                    {d.weight}% of the exam. {dl.length} lessons, about {minutes} min.
                  </p>
                </div>
                <div>
                  <div className="mb-1.5 flex justify-between text-xs text-muted tabular">
                    <span>{done === dl.length && dl.length > 0 ? "Complete" : "Progress"}</span>
                    <span>
                      {done}/{dl.length}
                    </span>
                  </div>
                  <ProgressBar value={dl.length ? done / dl.length : 0} color={d.color || "var(--accent)"} label={`${d.name} progress`} />
                </div>
              </Link>
            </li>
          );
        })}
      </ol>
    </>
  );
}
