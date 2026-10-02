// Framework-free auth helpers (hashing, tokens, validation, rate limiting). Unit tested.
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "ccp_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export interface SessionClaims {
  uid: number;
  tv: number; // token version; bumping it in the DB revokes every session
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signSession(claims: SessionClaims, secret: string, ttlSeconds = SESSION_TTL_SECONDS): Promise<string> {
  return new SignJWT({ tv: claims.tv })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(claims.uid))
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(key(secret));
}

export async function verifySession(token: string, secret: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: ["HS256"] });
    const uid = Number(payload.sub);
    if (!Number.isInteger(uid) || uid <= 0) return null;
    return { uid, tv: typeof payload.tv === "number" ? payload.tv : 0 };
  } catch {
    return null;
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateEmail(email: string): string | null {
  const e = normalizeEmail(email);
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return "Enter a valid email address.";
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < 8) return "Use at least 8 characters.";
  if (password.length > 128) return "Use 128 characters or fewer.";
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return "Include at least one letter and one number.";
  return null;
}

export function validateName(name: string): string | null {
  const n = name.trim();
  if (n.length < 1) return "Tell us what to call you.";
  if (n.length > 60) return "Keep your name under 60 characters.";
  return null;
}

export function isAdminEmail(email: string, adminEmails: string | undefined): boolean {
  if (!adminEmails) return false;
  const e = normalizeEmail(email);
  return adminEmails
    .split(",")
    .map((s) => normalizeEmail(s))
    .filter(Boolean)
    .includes(e);
}
