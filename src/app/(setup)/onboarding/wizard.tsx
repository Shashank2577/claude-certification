"use client";

import { useMemo, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { clsx } from "clsx";
import { ArrowLeft, Check, Code2, Loader2, MessageCircle } from "lucide-react";
import { completeOnboarding } from "@/app/actions/onboarding";
import { Button, ButtonLink } from "@/components/ui/button";

interface CertOption {
  id: string;
  name: string;
  tagline: string;
  domains: number;
  lessons: number;
  minutes: number;
  passingScore: number;
  questionCount: number;
}

interface PlanOption {
  id: string;
  title: string;
  certId: string;
  description: string;
  days: number;
}

const MINUTES = [10, 20, 30, 45, 60, 90];
const STEPS = ["Exam", "Schedule", "Background", "Plan"] as const;

export function OnboardingWizard({
  name,
  certs,
  plans,
  initial,
}: {
  name: string;
  certs: CertOption[];
  plans: PlanOption[];
  initial: { certIds: string[]; examDate: string | null; dailyMinutes: number; background: "technical" | "non-technical"; returning: boolean };
}) {
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [certIds, setCertIds] = useState<string[]>(initial.certIds.length ? initial.certIds : certs[0] ? [certs[0].id] : []);
  const [examDate, setExamDate] = useState(initial.examDate ?? "");
  const [minutes, setMinutes] = useState(initial.dailyMinutes || 20);
  const [background, setBackground] = useState(initial.background);
  const [planChoice, setPlanChoice] = useState("personal");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const primary = certs.find((c) => c.id === certIds[0]);
  const curated = plans.filter((p) => p.certId === certIds[0]);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const daysLeft = examDate ? Math.max(0, Math.round((Date.parse(examDate) - Date.parse(today)) / 86_400_000)) : null;

  const go = (n: number) => {
    setDir(n > step ? 1 : -1);
    setStep(n);
  };

  const canNext = step === 0 ? certIds.length > 0 : true;

  const finish = () => {
    setError(null);
    startTransition(async () => {
      const res = await completeOnboarding({
        certIds,
        examDate: examDate || null,
        dailyMinutes: minutes,
        background,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        planChoice,
      });
      if (res?.error) setError(res.error);
    });
  };

  if (certs.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <h1 className="font-display text-3xl font-semibold">No study content yet</h1>
        <p className="mt-3 text-ink-2">Add exam content to the content folder (see CONTENT_SCHEMA.md), then reload this page.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4 py-8 sm:py-14">
      <div className="flex items-center justify-between">
        <p className="font-display font-semibold">Architect Prep</p>
        {initial.returning ? (
          <ButtonLink href="/today" variant="ghost" size="sm">
            Cancel
          </ButtonLink>
        ) : null}
      </div>

      <ol className="mt-8 flex gap-2" aria-label="Setup progress">
        {STEPS.map((s, i) => (
          <li key={s} className="flex-1">
            <div className="h-1 overflow-hidden rounded-full bg-surface-2">
              <motion.div className="h-full bg-ink" initial={false} animate={{ scaleX: i <= step ? 1 : 0 }} style={{ originX: 0 }} transition={{ duration: 0.4 }} />
            </div>
            <span className={clsx("mt-2 block text-xs", i === step ? "font-semibold text-ink" : "text-muted")} aria-current={i === step ? "step" : undefined}>
              {s}
            </span>
          </li>
        ))}
      </ol>

      <div className="relative mt-10 flex-1">
        <AnimatePresence mode="wait" custom={dir}>
          <motion.section
            key={step}
            custom={dir}
            initial={{ opacity: 0, x: dir * 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -28 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            {step === 0 ? (
              <>
                <h1 className="font-display text-3xl font-semibold tracking-[-0.025em] sm:text-4xl">Hi {name.split(" ")[0]}. Which exam are you preparing for?</h1>
                <p className="mt-3 text-ink-2">Pick one or both. Your plan starts with the first one you choose.</p>
                <div className="mt-8 grid gap-3">
                  {certs.map((c) => {
                    const on = certIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setCertIds((ids) => (on ? ids.filter((x) => x !== c.id) : [...ids, c.id]))}
                        className={clsx(
                          "group relative rounded-2xl border p-5 text-left transition-[border-color,background-color,box-shadow]",
                          on ? "border-ink bg-surface shadow-card" : "border-line bg-surface/60 hover:border-line-strong",
                        )}
                      >
                        <div className="flex items-start gap-4">
                          <span className={clsx("mt-1 grid size-5 shrink-0 place-items-center rounded-md border", on ? "border-ink bg-ink text-bg" : "border-line-strong")}>
                            {on ? <Check size={14} strokeWidth={3} /> : null}
                          </span>
                          <div className="min-w-0">
                            <p className="font-display text-lg font-semibold">{c.name}</p>
                            <p className="mt-1 text-sm text-ink-2">{c.tagline}</p>
                            <p className="mt-3 text-xs text-muted tabular">
                              {c.domains} domains, {c.lessons > 0 ? `${c.lessons} lessons (${readingTime(c.minutes)} of reading)` : "lessons still being added"}. {c.questionCount} questions on exam day, pass at {c.passingScore}.
                            </p>
                          </div>
                        </div>
                        {certIds[0] === c.id && certIds.length > 1 ? <span className="absolute top-4 right-4 text-xs font-medium text-accent-text">Starts first</span> : null}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}

            {step === 1 ? (
              <>
                <h1 className="font-display text-3xl font-semibold tracking-[-0.025em] sm:text-4xl">When is your exam, and how much time can you give it each day?</h1>
                <p className="mt-3 text-ink-2">Pick a daily goal you could hit on a bad day. Small goals you keep beat big ones you skip.</p>
                <label className="mt-8 block text-sm font-medium">
                  Exam date <span className="font-normal text-muted">(optional)</span>
                  <input
                    type="date"
                    min={today}
                    value={examDate}
                    onChange={(e) => setExamDate(e.target.value)}
                    className="mt-1.5 block h-11 w-full max-w-xs rounded-xl border border-line-strong bg-surface px-3.5 text-ink"
                  />
                </label>
                <p className="mt-2 text-sm text-muted">{daysLeft != null ? `${daysLeft} days to go.` : "No date yet? We’ll plan three weeks and you can change it later."}</p>
                <fieldset className="mt-8">
                  <legend className="text-sm font-medium">Daily goal</legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {MINUTES.map((m) => (
                      <button
                        key={m}
                        type="button"
                        aria-pressed={minutes === m}
                        onClick={() => setMinutes(m)}
                        className={clsx(
                          "h-11 min-w-16 rounded-xl border px-4 font-display font-semibold tabular transition-colors",
                          minutes === m ? "border-ink bg-ink text-bg" : "border-line-strong bg-surface hover:border-ink",
                        )}
                      >
                        {m} min
                      </button>
                    ))}
                  </div>
                </fieldset>
              </>
            ) : null}

            {step === 2 ? (
              <>
                <h1 className="font-display text-3xl font-semibold tracking-[-0.025em] sm:text-4xl">How would you describe your background?</h1>
                <p className="mt-3 text-ink-2">This changes how lessons open. You still get the same content either way.</p>
                <div className="mt-8 grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      { id: "technical", icon: Code2, title: "I write or review code", body: "Lessons open on the technical detail. Optional deep dives are added to your plan when there’s room." },
                      { id: "non-technical", icon: MessageCircle, title: "I’m newer to the technical side", body: "Every lesson opens with a plain-English explanation first, and your plan sticks to core lessons." },
                    ] as const
                  ).map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      aria-pressed={background === o.id}
                      onClick={() => setBackground(o.id)}
                      className={clsx(
                        "rounded-2xl border p-5 text-left transition-[border-color,box-shadow]",
                        background === o.id ? "border-ink bg-surface shadow-card" : "border-line bg-surface/60 hover:border-line-strong",
                      )}
                    >
                      <o.icon size={22} className="text-accent-text" />
                      <p className="mt-3 font-display font-semibold">{o.title}</p>
                      <p className="mt-1 text-sm text-ink-2">{o.body}</p>
                    </button>
                  ))}
                </div>
              </>
            ) : null}

            {step === 3 ? (
              <>
                <h1 className="font-display text-3xl font-semibold tracking-[-0.025em] sm:text-4xl">Your plan</h1>
                <p className="mt-3 text-ink-2">
                  {primary?.name}: {minutes} minutes a day{daysLeft != null ? `, ${daysLeft} days until the exam` : ""}. Every day has a short list; finish it and the day is done.
                </p>
                <div className="mt-8 grid gap-3">
                  <PlanChoice id="personal" active={planChoice} onPick={setPlanChoice} title="Personal plan" body="Built from your date and daily goal, weighted toward the domains worth the most marks. Ends with a mock exam and a light review day." recommended />
                  {curated.map((p) => (
                    <PlanChoice key={p.id} id={p.id} active={planChoice} onPick={setPlanChoice} title={`${p.title} (${p.days} days)`} body={p.description} />
                  ))}
                </div>
                {error ? (
                  <p role="alert" className="mt-4 rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">
                    {error}
                  </p>
                ) : null}
              </>
            ) : null}
          </motion.section>
        </AnimatePresence>
      </div>

      <div className="sticky bottom-0 mt-10 flex items-center justify-between gap-3 bg-gradient-to-t from-bg via-bg to-transparent pt-6 pb-2">
        {step > 0 ? (
          <Button variant="ghost" onClick={() => go(step - 1)}>
            <ArrowLeft size={16} /> Back
          </Button>
        ) : (
          <span />
        )}
        {step < STEPS.length - 1 ? (
          <Button size="lg" onClick={() => go(step + 1)} disabled={!canNext}>
            Continue
          </Button>
        ) : (
          <Button size="lg" variant="accent" onClick={finish} disabled={pending}>
            {pending ? <Loader2 size={18} className="animate-spin" /> : null}
            {initial.returning ? "Rebuild my plan" : "Start my plan"}
          </Button>
        )}
      </div>
    </div>
  );
}

function readingTime(minutes: number) {
  if (minutes < 90) return `${Math.max(1, Math.round(minutes))} minutes`;
  return `about ${Math.round(minutes / 60)} hours`;
}

function PlanChoice({ id, active, onPick, title, body, recommended }: { id: string; active: string; onPick: (id: string) => void; title: string; body: string; recommended?: boolean }) {
  const on = active === id;
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onPick(id)}
      className={clsx("flex items-start gap-4 rounded-2xl border p-5 text-left", on ? "border-ink bg-surface shadow-card" : "border-line bg-surface/60 hover:border-line-strong")}
    >
      <span className={clsx("mt-1 grid size-5 shrink-0 place-items-center rounded-full border", on ? "border-ink" : "border-line-strong")}>
        {on ? <span className="size-2.5 rounded-full bg-ink" /> : null}
      </span>
      <span>
        <span className="font-display font-semibold">
          {title}
          {recommended ? <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 align-middle text-xs font-medium text-accent-text">Recommended</span> : null}
        </span>
        <span className="mt-1 block text-sm text-ink-2">{body}</span>
      </span>
    </button>
  );
}
