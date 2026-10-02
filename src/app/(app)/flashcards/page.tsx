import type { Metadata } from "next";
import Link from "next/link";
import { Layers } from "lucide-react";
import { Card, EmptyState, PageHeader, Pill } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress";
import { buildDeck } from "@/lib/flashcard-deck";
import { getViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Flashcards" };

export default async function FlashcardsPage() {
  const { user, settings, cert } = await getViewer();
  if (!cert) {
    return (
      <>
        <PageHeader title="Flashcards" />
        <EmptyState icon={<Layers size={28} />} title="No flashcards yet" body="Flashcards appear here once study content is added." />
      </>
    );
  }
  const { summaries, totalDue, newLeft } = await buildDeck(user.id, cert, settings.tz);
  const total = summaries.reduce((s, d) => s + d.total, 0);
  const startable = totalDue + Math.min(newLeft, summaries.reduce((s, d) => s + d.fresh, 0));

  return (
    <>
      <PageHeader
        title="Flashcards"
        sub="Short recall drills, scheduled so you see each card right before you’d forget it."
        action={
          startable > 0 ? (
            <ButtonLink href="/flashcards/review" variant="accent" size="lg">
              Review {startable} card{startable === 1 ? "" : "s"}
            </ButtonLink>
          ) : null
        }
      />

      {total === 0 ? (
        <EmptyState icon={<Layers size={28} />} title="No flashcards for this exam yet" body="Cards will show up here as soon as they’re added to the content folder." />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-3 gap-3 sm:max-w-lg">
            <Stat label="Due now" value={totalDue} />
            <Stat label="New today" value={newLeft} />
            <Stat label="Learned" value={summaries.reduce((s, d) => s + d.learned, 0)} />
          </div>
          {startable === 0 ? (
            <p className="mb-6 rounded-2xl bg-good-soft px-4 py-3 text-good">You’re all caught up. New cards unlock tomorrow; your due cards will be waiting.</p>
          ) : null}
          <div className="grid gap-3 md:grid-cols-2">
            {summaries
              .filter((d) => d.total > 0)
              .map((d) => {
                const avail = d.due + Math.min(d.fresh, newLeft);
                return (
                  <Card key={d.domainId} className="flex flex-col p-5">
                    <div className="flex items-start gap-3">
                      <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: d.color }} aria-hidden />
                      <div className="min-w-0 flex-1">
                        <h2 className="font-display font-semibold">{d.name}</h2>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {d.due > 0 ? <Pill tone="accent">{d.due} due</Pill> : null}
                          {d.fresh > 0 ? <Pill tone="info">{d.fresh} new</Pill> : null}
                          <Pill>{d.total} cards</Pill>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4">
                      <div className="mb-1 flex justify-between text-xs text-muted">
                        <span>Learned</span>
                        <span className="tabular">
                          {d.learned} of {d.total}
                        </span>
                      </div>
                      <ProgressBar value={d.total ? d.learned / d.total : 0} color={d.color} label={`${d.name} learned`} height={6} />
                    </div>
                    <div className="mt-4">
                      {avail > 0 ? (
                        <ButtonLink href={`/flashcards/review?domain=${encodeURIComponent(d.domainId)}`} variant="outline" size="sm">
                          Review this deck
                        </ButtonLink>
                      ) : (
                        <span className="text-sm text-muted">Nothing due in this deck.</span>
                      )}
                    </div>
                  </Card>
                );
              })}
          </div>
          <p className="mt-8 text-sm text-muted">
            Shortcuts during review: Space flips the card, 1–4 grade it.{" "}
            <Link href="/focus" className="underline underline-offset-4">
              Pair it with a focus block
            </Link>
            .
          </p>
        </>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-4 py-3">
      <p className="font-display text-2xl font-semibold tabular">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}
