import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { dataDir } from "./db";
import { isHostedRuntime } from "./env";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession, verifySession } from "./auth-core";
import { getUserById, type User } from "./repo/users";

let secretCache: string | null = null;

/**
 * AUTH_SECRET from env. In development only, falls back to a random secret persisted under data/
 * so sessions survive restarts. Production never touches the filesystem and refuses to run without it.
 */
export function authSecret(): string {
  if (secretCache) return secretCache;
  const env = process.env.AUTH_SECRET;
  if (env && env.length >= 32) return (secretCache = env);
  if (process.env.NODE_ENV === "production" || isHostedRuntime()) {
    throw new Error("AUTH_SECRET must be set to at least 32 characters in production.");
  }
  const file = path.join(dataDir(), ".auth-secret");
  try {
    secretCache = fs.readFileSync(file, "utf8").trim();
  } catch {
    secretCache = crypto.randomBytes(48).toString("base64url");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, secretCache, { mode: 0o600 });
  }
  return secretCache;
}

export async function createSession(user: Pick<User, "id" | "tokenVersion">) {
  const token = await signSession({ uid: user.id, tv: user.tokenVersion }, authSecret());
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/** Current user or null. Deduplicated per request. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const claims = await verifySession(token, authSecret());
  if (!claims) return null;
  const user = await getUserById(claims.uid);
  if (!user || user.tokenVersion !== claims.tv) return null;
  return user;
});

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/today");
  return user;
}

/**
 * Best-effort client IP for rate limiting. Prefer headers the platform sets itself
 * (Netlify: x-nf-client-connection-ip); the first x-forwarded-for entry can be spoofed by the client.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-nf-client-connection-ip") ||
    h.get("x-real-ip") ||
    h.get("x-forwarded-for")?.split(",").at(-1)?.trim() ||
    "local"
  );
}
