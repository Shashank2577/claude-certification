"use client";

import { useState, useTransition } from "react";
import { Flag } from "lucide-react";
import { reportContent } from "@/app/actions/reviews";
import type { ReportReason } from "@/lib/repo/reviews";

export function ContentReport({ kind, contentId, certId }: { kind: "question" | "lesson"; contentId: string; certId: string }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  if (sent) return <p className="text-sm text-good" role="status">Thanks. Your report is in the content review queue.</p>;
  return <div className="min-w-0">
    <button type="button" onClick={() => setOpen(!open)} className="inline-flex min-h-10 items-center gap-1.5 text-sm text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink"><Flag size={14} /> Report a {kind} issue</button>
    {open && <form className="mt-3 grid max-w-lg gap-3 rounded-xl border border-line bg-surface-2 p-4" onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      start(async () => {
        const result = await reportContent({ kind, contentId, certId, reason: String(data.get("reason")) as ReportReason, detail: String(data.get("detail") ?? "") });
        if ("error" in result) setError(result.error ?? "Could not send report.");
        else setSent(true);
      });
    }}>
      <label className="grid gap-1 text-sm font-medium">What is wrong?
        <select name="reason" className="min-h-10 rounded-lg border border-line bg-bg px-3 text-ink" defaultValue="incorrect">
          <option value="incorrect">Factually incorrect</option><option value="unclear">Unclear explanation</option><option value="outdated">Outdated</option><option value="layout">Layout or visual problem</option><option value="other">Something else</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm font-medium">Details
        <textarea name="detail" required minLength={10} maxLength={2000} rows={3} className="w-full min-w-0 rounded-lg border border-line bg-bg px-3 py-2 text-ink" placeholder="Tell us where the issue is and what you expected." />
      </label>
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      <button disabled={pending} className="min-h-10 justify-self-start rounded-lg bg-ink px-4 text-sm font-semibold text-bg disabled:opacity-50">{pending ? "Sending…" : "Send report"}</button>
    </form>}
  </div>;
}
