import type { Metadata } from "next";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <>
      <h1 className="font-display text-3xl font-semibold tracking-[-0.02em]">Start studying</h1>
      <p className="mt-2 mb-8 text-ink-2">Set a date, a daily goal, and we’ll build the plan around it.</p>
      <AuthForm mode="signup" />
    </>
  );
}
