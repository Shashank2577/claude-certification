"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { hashPassword } from "@/lib/auth-core";
import { countAdmins, getUserById, setPassword, setRole } from "@/lib/repo/users";

/** One structured line per privileged change, so hosting logs keep an audit trail without a schema change. */
function audit(action: string, actorId: number, targetId: number, extra: Record<string, unknown> = {}) {
  console.info(`[admin-audit] ${JSON.stringify({ action, actorId, targetId, at: new Date().toISOString(), ...extra })}`);
}

async function requireAdminAction() {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("Not authorised.");
  return me;
}

export async function setUserRole(userId: number, role: "user" | "admin"): Promise<{ error?: string }> {
  const me = await requireAdminAction();
  if (role !== "user" && role !== "admin") return { error: "Unknown role." };
  const target = await getUserById(Number(userId));
  if (!target) return { error: "That user no longer exists." };
  if (role === "user") {
    if (target.id === me.id) return { error: "You can’t remove your own admin access." };
    if (target.role === "admin" && await countAdmins() <= 1) return { error: "There must always be at least one admin." };
  }
  await setRole(target.id, role);
  audit("set-role", me.id, target.id, { from: target.role, to: role });
  revalidatePath("/admin");
  revalidatePath(`/admin/users/${target.id}`);
  return {};
}

/** Sets a random temporary password, signs the user out everywhere, and returns it once. */
export async function resetUserPassword(userId: number): Promise<{ password?: string; error?: string }> {
  const me = await requireAdminAction();
  const target = await getUserById(Number(userId));
  if (!target) return { error: "That user no longer exists." };
  // Readable but strong: 4 groups from an unambiguous alphabet plus a digit guarantee.
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(16);
  let raw = "";
  for (let i = 0; i < 16; i++) raw += alphabet[bytes[i] % alphabet.length];
  const password = `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${crypto.randomInt(10, 99)}`;
  await setPassword(target.id, await hashPassword(password));
  audit("reset-password", me.id, target.id);
  return { password };
}
