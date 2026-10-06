"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireUser } from "@/lib/auth";
import { createContentReport, decideContentReport, decideIntegrityCase, type ReportReason } from "@/lib/repo/reviews";

const REASONS: ReportReason[] = ["incorrect", "unclear", "outdated", "layout", "other"];

export async function reportContent(input: { kind: "question" | "lesson"; contentId: string; certId: string; reason: ReportReason; detail: string }) {
  const user = await requireUser();
  if (!input || !["question", "lesson"].includes(input.kind) || !REASONS.includes(input.reason) || typeof input.detail !== "string") return { error: "Invalid report." };
  return createContentReport(user.id, input);
}

export async function reviewContentReport(form: FormData) {
  const admin = await requireAdmin();
  const id = Number(form.get("id"));
  const status = form.get("status");
  if (!Number.isInteger(id) || id < 1 || (status !== "resolved" && status !== "dismissed")) return;
  await decideContentReport(id, admin.id, status, String(form.get("resolution") ?? ""));
  revalidatePath("/admin/reviews");
}

export async function reviewIntegrityCase(form: FormData) {
  const admin = await requireAdmin();
  const attemptId = form.get("attemptId");
  const status = form.get("status");
  if (typeof attemptId !== "string" || (status !== "reviewed" && status !== "dismissed")) return;
  await decideIntegrityCase(attemptId, admin.id, status, String(form.get("note") ?? ""));
  revalidatePath("/admin/reviews");
}
