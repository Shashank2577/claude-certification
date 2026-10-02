import type { Metadata } from "next";
import { buildDeck } from "@/lib/flashcard-deck";
import { getViewer } from "@/lib/viewer";
import { Reviewer } from "./reviewer";
import { EmptyState, PageHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Review flashcards" };

export default async function ReviewPage({ searchParams }: PageProps<"/flashcards/review">) {
  const { user, settings, cert } = await getViewer();
  const sp = await searchParams;
  const domainId = typeof sp.domain === "string" ? sp.domain : undefined;
  if (!cert) {
    return <EmptyState title="No flashcards yet" action={<ButtonLink href="/today">Back to today</ButtonLink>} />;
  }
  const valid = domainId && cert.domains.some((d) => d.id === domainId) ? domainId : undefined;
  const { queue } = await buildDeck(user.id, cert, settings.tz, valid);
  const domains = Object.fromEntries(cert.domains.map((d) => [d.id, { name: d.name, color: d.color }]));
  const deckName = valid ? domains[valid].name : "All decks";
  return (
    <>
      <PageHeader title="Review" sub={deckName} />
      <Reviewer cards={queue} domains={domains} />
    </>
  );
}
