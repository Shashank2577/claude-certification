"use client";

import { useActionState } from "react";
import { Loader2, LogOut } from "lucide-react";
import { logOut } from "@/app/actions/auth";
import { changePassword, updateProfile, type FormResult } from "@/app/actions/settings";
import { Button, ButtonLink } from "@/components/ui/button";
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

  return (
    <div className="grid max-w-3xl gap-6">
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
        <CardHeader title="Study plan" sub="Changed your exam date or goal? Rebuild the plan so the daily list matches." />
        <ButtonLink href="/onboarding" variant="outline" className="mt-4">
          Rebuild my plan
        </ButtonLink>
      </Card>

      <Card className="p-5 sm:p-6">
        <CardHeader title="Password" />
        <form action={wAction} className="mt-5 grid gap-4 sm:grid-cols-3">
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
            <Status state={wState} />
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
