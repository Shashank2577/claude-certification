"use client";

import { useActionState, useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { CalendarPlus, Loader2, LogOut, RefreshCw } from "lucide-react";
import { logOut } from "@/app/actions/auth";
import { changePassword, rebuildPlan, updateProfile, type FormResult } from "@/app/actions/settings";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";

const input =
  "mt-1.5 block h-11 w-full rounded-xl border border-line-strong bg-surface px-3.5 text-ink placeholder:text-muted focus:border-ink focus:outline-none focus-visible:outline-2 focus-visible:outline-info";

interface Profile {
  name: string;
  email: string;
  dailyMinutes: number;
  examDate: string;
  background: "technical" | "non-technical";
  activeCert: string;
}

export function SettingsForms({ profile, certs }: { profile: Profile; certs: { id: string; name: string }[] }) {
  const [pState, pAction, pPending] = useActionState<FormResult, FormData>(updateProfile, {});
  const [wState, wAction, wPending] = useActionState<FormResult, FormData>(changePassword, {});
  const [rState, rAction, rPending] = useActionState<FormResult>(rebuildPlan, {});
  const [pwLocalError, setPwLocalError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const pwForm = useRef<HTMLFormElement>(null);

  // Submitting through startTransition (not the form action prop) keeps typed values when the server says no.
  const submitPassword = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (String(fd.get("next")) !== String(fd.get("confirm"))) {
      setPwLocalError("The new passwords don’t match.");
      return;
    }
    setPwLocalError(null);
    startTransition(() => wAction(fd));
  };
  // Clear the fields only after a successful change.
  useEffect(() => {
    if (wState.ok) pwForm.current?.reset();
  }, [wState]);

  return (
    <div className="grid max-w-3xl grid-cols-1 gap-6">
      <Card className="p-5 sm:p-6">
        <CardHeader title="Profile and study goals" sub={profile.email} />
        <form action={pAction} className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium sm:col-span-2">
            Name
            <input name="name" defaultValue={profile.name} required maxLength={60} className={input} autoComplete="name" />
          </label>
          <label className="block text-sm font-medium">
            Daily goal (minutes)
            <input name="dailyMinutes" type="number" min={5} max={240} step={5} defaultValue={profile.dailyMinutes} className={input} />
          </label>
          <label className="block text-sm font-medium">
            Exam date <span className="font-normal text-muted">(optional)</span>
            <input name="examDate" type="date" defaultValue={profile.examDate} className={input} />
          </label>
          <label className="block text-sm font-medium">
            Background
            <select name="background" defaultValue={profile.background} className={input}>
              <option value="technical">I write or review code</option>
              <option value="non-technical">I’m newer to the technical side</option>
            </select>
          </label>
          {certs.length > 1 ? (
            <label className="block text-sm font-medium">
              Studying now
              <select name="activeCert" defaultValue={profile.activeCert} className={input}>
                {certs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <input type="hidden" name="activeCert" value={profile.activeCert} />
          )}
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <Button type="submit" disabled={pPending}>
              {pPending ? <Loader2 size={16} className="animate-spin" /> : null}
              Save changes
            </Button>
            <Status state={pState} />
          </div>
        </form>
      </Card>

      <Card className="p-5 sm:p-6">
        <CardHeader title="Study plan" sub="Saving a new exam, date, goal or background rebuilds the plan automatically. Finished lessons are never scheduled again." />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <form action={rAction}>
            <Button type="submit" variant="outline" disabled={rPending}>
              {rPending ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} aria-hidden />}
              Rebuild my plan
            </Button>
          </form>
          {/* A plain link: it downloads an .ics file, not a page. */}
          <a href="/api/calendar" download="study-reminder.ics" className={buttonClass("ghost", "md", undefined, true)}>
            <CalendarPlus size={16} aria-hidden /> Add daily reminder to calendar
          </a>
          <Status state={rState} />
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <CardHeader title="Password" />
        <form ref={pwForm} onSubmit={submitPassword} className="mt-5 grid gap-4 sm:grid-cols-3">
          <label className="block text-sm font-medium">
            Current password
            <input name="current" type="password" required autoComplete="current-password" className={input} />
          </label>
          <label className="block text-sm font-medium">
            New password
            <input name="next" type="password" required minLength={8} autoComplete="new-password" className={input} />
          </label>
          <label className="block text-sm font-medium">
            Confirm new password
            <input name="confirm" type="password" required minLength={8} autoComplete="new-password" className={input} />
          </label>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
            <Button type="submit" variant="outline" disabled={wPending}>
              {wPending ? <Loader2 size={16} className="animate-spin" /> : null}
              Change password
            </Button>
            <Status state={pwLocalError ? { error: pwLocalError } : wState} />
          </div>
        </form>
      </Card>

      <Card tone="plain" className="flex flex-wrap items-center justify-between gap-3 p-5">
        <p className="text-sm text-ink-2">Leaderboard visibility lives on the achievements page.</p>
        <form action={logOut}>
          <Button variant="ghost" type="submit">
            <LogOut size={16} /> Log out
          </Button>
        </form>
      </Card>
    </div>
  );
}

function Status({ state }: { state: FormResult }) {
  if (state.error)
    return (
      <p role="alert" className="text-sm text-bad">
        {state.error}
      </p>
    );
  if (state.ok)
    return (
      <p role="status" className="text-sm text-good">
        {state.ok}
      </p>
    );
  return null;
}
