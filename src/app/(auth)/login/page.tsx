import type { Metadata } from "next";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  return (
    <>
      <h1 className="font-display text-3xl font-semibold tracking-[-0.02em]">Welcome back</h1>
      <p className="mt-2 mb-8 text-ink-2">Your streak is waiting where you left it.</p>
      <AuthForm mode="login" next={next} />
    </>
  );
}
