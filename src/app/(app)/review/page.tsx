import type { Metadata } from "next";
import { EmptyState, PageHeader } from "@/components/ui/card";
import { ReviewQueue } from "@/components/review-queue";
import { getViewer } from "@/lib/viewer";
import { buildReviewPlan } from "@/lib/review-plan";

export const metadata: Metadata = { title: "Review" };

export default async function ReviewPage({ searchParams }: PageProps<"/review">) {
  const { user, settings, cert } = await getViewer();
  if (!cert) return <EmptyState title="No exam content found" body="Add exam content to begin reviewing." />;
  const sp = await searchParams;
  const mockId = typeof sp.mock === "string" ? sp.mock : undefined;
  const plan = await buildReviewPlan(user.id, cert, settings.tz, mockId);
  return <div className="space-y-6">
    <PageHeader title="Review" sub="A few useful steps based on what you missed, what is due, and your latest mock." />
    <ReviewQueue plan={plan} />
  </div>;
}
