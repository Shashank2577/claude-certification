import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createContentReport } from "@/lib/repo/reviews";

const schema = z.object({
  kind: z.enum(["question", "lesson"]), contentId: z.string().min(1).max(200), certId: z.string().min(1).max(100),
  reason: z.enum(["incorrect", "unclear", "outdated", "layout", "other"]), detail: z.string().min(10).max(2000),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Same-origin cookies are required; a native client will need a dedicated token flow before using this endpoint.
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid report" }, { status: 400 });
  const result = await createContentReport(user.id, parsed.data);
  return "error" in result ? NextResponse.json(result, { status: 400 }) : NextResponse.json({ ok: true }, { status: 201 });
}
