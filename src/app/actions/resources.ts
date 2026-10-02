"use server";

import { requireUser } from "@/lib/auth";
import { getResources } from "@/lib/content";
import { XP, type Reward } from "@/lib/gamification";
import { recordActivity } from "@/lib/repo/activity";
import { resourceEverRewarded, setResourceDone } from "@/lib/repo/resources";

export async function toggleResourceDone(resourceId: string, done: boolean): Promise<Reward | null> {
  const user = await requireUser();
  const resource = getResources().find((r) => r.id === resourceId);
  if (!resource) return null;
  await setResourceDone(user.id, resourceId, done);
  if (!done || await resourceEverRewarded(user.id, resourceId)) return null;
  return await recordActivity(user.id, { kind: "resource", refId: resourceId, xp: XP.resourceDone, minutes: 0, meta: { title: resource.title } });
}
