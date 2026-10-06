import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getCert, getCerts } from "@/lib/content";
import { buildReviewPlan } from "@/lib/review-plan";
import { getSettings } from "@/lib/repo/settings";

/** Versioned learner bootstrap for the web client and a future embedded iOS client. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const settings = await getSettings(user.id);
  const certs = getCerts();
  const cert = getCert(settings.activeCert ?? settings.certIds[0] ?? "") ?? certs[0];
  const review = cert && settings.onboarded ? await buildReviewPlan(user.id, cert, settings.tz) : null;
  return NextResponse.json({
    version: 1,
    learner: { id: user.id, name: user.name },
    onboardingRequired: !settings.onboarded,
    activeCertId: cert?.id ?? null,
    certs: certs.map((c) => ({ id: c.id, name: c.name, tagline: c.tagline, domains: c.domains.map((d) => ({ id: d.id, name: d.name, weight: d.weight })) })),
    review,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
