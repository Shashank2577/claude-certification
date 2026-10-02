"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { updateSettings } from "@/lib/repo/settings";

export async function setLeaderboardOptOut(optOut: boolean) {
  const user = await requireUser();
  await updateSettings(user.id, { leaderboardOptOut: !!optOut });
  revalidatePath("/achievements");
}
