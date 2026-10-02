"use server";

import { redirect } from "next/navigation";
import { clientIp, createSession, destroySession } from "@/lib/auth";
import { hitRateLimit, LOGIN_EMAIL_RULE, LOGIN_IP_RULE, LOGIN_RULE, resetRateLimit, SIGNUP_RULE } from "@/lib/repo/rate-limit";
import { safeNext } from "@/lib/safe-next";
import { hashPassword, isAdminEmail, normalizeEmail, validateEmail, validateName, validatePassword, verifyPassword } from "@/lib/auth-core";
import { createUser, getUserWithHashByEmail } from "@/lib/repo/users";

export interface AuthState {
  error?: string;
  fields?: { email?: string; name?: string };
}

// Spend comparable time whether or not the email exists, so response timing doesn't reveal accounts.
const DUMMY_HASH = "$2b$12$ObUNokHPDjSxpu.nGgrohuRx.tXXmTRo3VPDhT4vkDxd5rsn1v.gy";

export async function signUp(_: AuthState, form: FormData): Promise<AuthState> {
  const email = normalizeEmail(String(form.get("email") ?? ""));
  const name = String(form.get("name") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const fields = { email, name };

  const wait = await hitRateLimit(SIGNUP_RULE, await clientIp());
  if (wait) return { error: `Too many sign-ups from this network. Try again in ${Math.ceil(wait / 60)} minutes.`, fields };

  const err = validateName(name) ?? validateEmail(email) ?? validatePassword(password);
  if (err) return { error: err, fields };
  if (await getUserWithHashByEmail(email)) return { error: "An account with this email already exists. Log in instead.", fields };

  // The very first account becomes admin; that check happens inside the insert transaction.
  const role = isAdminEmail(email, process.env.ADMIN_EMAILS) ? "admin" : "user";
  let user;
  try {
    user = await createUser({ email, name, passwordHash: await hashPassword(password), role, firstUserIsAdmin: true });
  } catch {
    // Unique email violation from a simultaneous sign-up.
    return { error: "An account with this email already exists. Log in instead.", fields };
  }
  await createSession(user);
  redirect("/onboarding");
}

export async function logIn(_: AuthState, form: FormData): Promise<AuthState> {
  const email = normalizeEmail(String(form.get("email") ?? ""));
  const password = String(form.get("password") ?? "");
  const fields = { email };

  const ip = await clientIp();
  // Per account+IP (stops guessing one password), per IP (stops spraying many accounts), and per
  // account alone (holds even if the client IP can be rotated or spoofed).
  const wait = Math.max(
    await hitRateLimit(LOGIN_RULE, `${ip}:${email}`),
    await hitRateLimit(LOGIN_IP_RULE, ip),
    await hitRateLimit(LOGIN_EMAIL_RULE, email),
  );
  if (wait) return { error: `Too many attempts. Try again in ${Math.ceil(wait / 60)} minutes.`, fields };

  const user = await getUserWithHashByEmail(email);
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) return { error: "That email and password don't match an account.", fields };

  await resetRateLimit(LOGIN_RULE, `${ip}:${email}`);
  await resetRateLimit(LOGIN_EMAIL_RULE, email);
  await createSession(user);
  redirect(safeNext(form.get("next")));
}

export async function logOut() {
  await destroySession();
  redirect("/login");
}
