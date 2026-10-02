import "server-only";
import { count, eq, sql } from "drizzle-orm";
import { getDb, tx, type Executor } from "../db";
import { userSettings, users } from "@/db/schema";

export interface User {
  id: number;
  email: string;
  name: string;
  role: "user" | "admin";
  tokenVersion: number;
  createdAt: number;
  lastActiveAt: number | null;
}

type Row = typeof users.$inferSelect;

function toUser(r: Row): User {
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    role: r.role,
    tokenVersion: r.tokenVersion,
    createdAt: r.createdAt,
    lastActiveAt: r.lastActiveAt,
  };
}

export async function getUserById(id: number): Promise<User | null> {
  const db = await getDb();
  const [r] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return r ? toUser(r) : null;
}

export async function getUserWithHashByEmail(email: string): Promise<(User & { passwordHash: string }) | null> {
  const db = await getDb();
  const [r] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);
  return r ? { ...toUser(r), passwordHash: r.passwordHash } : null;
}

export async function countUsers(): Promise<number> {
  const db = await getDb();
  const [r] = await db.select({ n: count() }).from(users);
  return Number(r?.n ?? 0);
}

export async function countAdmins(): Promise<number> {
  const db = await getDb();
  const [r] = await db.select({ n: count() }).from(users).where(eq(users.role, "admin"));
  return Number(r?.n ?? 0);
}

/**
 * Creates the user and their settings row. When `firstUserIsAdmin` is set, the role is decided
 * inside the transaction so two simultaneous first sign-ups can't both become admin.
 */
export async function createUser(input: { email: string; name: string; passwordHash: string; role: "user" | "admin"; firstUserIsAdmin?: boolean }): Promise<User> {
  const now = Date.now();
  return tx(async (q: Executor) => {
    let role = input.role;
    if (input.firstUserIsAdmin && role !== "admin") {
      // Serialise first-user detection.
      await q.execute(sql`LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE`);
      const [c] = await q.select({ n: count() }).from(users);
      if (Number(c?.n ?? 0) === 0) role = "admin";
    }
    const [r] = await q
      .insert(users)
      .values({ email: input.email.trim().toLowerCase(), name: input.name, passwordHash: input.passwordHash, role, createdAt: now, lastActiveAt: now })
      .returning();
    await q.insert(userSettings).values({ userId: r.id }).onConflictDoNothing();
    return toUser(r);
  });
}

export async function setRole(userId: number, role: "user" | "admin") {
  const db = await getDb();
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

/** Sets a new hash and bumps token_version, signing the user out everywhere. */
export async function setPassword(userId: number, passwordHash: string) {
  const db = await getDb();
  await db
    .update(users)
    .set({ passwordHash, tokenVersion: sql`${users.tokenVersion} + 1` })
    .where(eq(users.id, userId));
}

export async function updateName(userId: number, name: string) {
  const db = await getDb();
  await db.update(users).set({ name }).where(eq(users.id, userId));
}

export async function touchUser(userId: number) {
  const db = await getDb();
  await db.update(users).set({ lastActiveAt: Date.now() }).where(eq(users.id, userId));
}
