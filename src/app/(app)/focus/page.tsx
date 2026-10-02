import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/card";
import { focusStats } from "@/lib/repo/focus";
import { getViewer } from "@/lib/viewer";
import { FocusPanel } from "./focus-panel";

export const metadata: Metadata = { title: "Focus" };

export default async function FocusPage() {
  const { user, settings } = await getViewer();
  const stats = await focusStats(user.id, settings.tz);
  return (
    <>
      <PageHeader title="Focus" sub="One task, one timer. The timer keeps running while you move around the app." />
      <FocusPanel {...stats} />
    </>
  );
}
