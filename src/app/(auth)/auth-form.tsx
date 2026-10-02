"use client";

import Link from "next/link";
import { useActionState } from "react";
import { motion } from "motion/react";
import { AlertCircle, Loader2 } from "lucide-react";
import { logIn, signUp, type AuthState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

const inputClass =
  "mt-1.5 block h-11 w-full rounded-xl border border-line-strong bg-surface px-3.5 text-[0.98rem] text-ink placeholder:text-muted transition-colors focus:border-ink focus:outline-none focus-visible:outline-2 focus-visible:outline-info";

export function AuthForm({ mode, next }: { mode: "login" | "signup"; next?: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === "login" ? logIn : signUp, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {mode === "signup" ? (
        <label className="block text-sm font-medium">
          What should we call you?
          <input name="name" autoComplete="name" required maxLength={60} defaultValue={state.fields?.name} className={inputClass} placeholder="Ada" />
        </label>
      ) : null}
      <label className="block text-sm font-medium">
        Email
        <input name="email" type="email" autoComplete="email" required defaultValue={state.fields?.email} className={inputClass} placeholder="you@company.com" />
      </label>
      <label className="block text-sm font-medium">
        Password
        <input
          name="password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
          minLength={8}
          className={inputClass}
          placeholder={mode === "signup" ? "8+ characters, a letter and a number" : ""}
        />
      </label>
      {state.error ? (
        <motion.p
          key={state.error}
          role="alert"
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: [0, -4, 4, -2, 0] }}
          transition={{ duration: 0.35 }}
          className="flex items-start gap-2 rounded-xl bg-bad-soft px-3 py-2.5 text-sm text-bad"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          {state.error}
        </motion.p>
      ) : null}
      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
        {pending ? <Loader2 size={18} className="animate-spin" /> : null}
        {mode === "login" ? "Log in" : "Create account"}
      </Button>
      <p className="text-center text-sm text-ink-2">
        {mode === "login" ? (
          <>
            New here?{" "}
            <Link href="/signup" className="font-medium text-ink underline underline-offset-4">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-ink underline underline-offset-4">
              Log in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
