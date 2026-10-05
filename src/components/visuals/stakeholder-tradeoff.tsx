"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertTriangle, ChevronLeft, ChevronRight, Check, RotateCcw } from "lucide-react";
import clsx from "clsx";

const EASE = [0.22, 1, 0.36, 1] as const;

const FACTS = [
  { k: "Triage accuracy", v: "94.1%" },
  { k: "p95 first reply", v: "1.9 s" },
  { k: "p95 drafted reply", v: "6.4 s" },
  { k: "Cost per ticket", v: "$0.011" },
  { k: "Routed to a human", v: "7%" },
];

const SECTIONS = [
  {
    id: "context",
    short: "Context",
    title: "Context",
    body: "We triage about 40,000 support tickets a month. 12% of them are currently misrouted, which costs roughly 380 manual re-handlings a week. Support want sub-second classification; finance wants the per-ticket cost under two cents; the drafting step genuinely needs a strong model.",
    note: "Context is facts and forces, not the answer. If it reads like a recommendation, it belongs in Decision.",
  },
  {
    id: "options",
    short: "Options",
    title: "Options considered",
    body: "Opus everywhere: the best accuracy we can buy and it breaks both hard constraints — $0.19 a ticket and 14 seconds p95. Rules-only classification: free, deterministic and 71% accurate, because it misses every phrasing it was not written for. Two options survive: Haiku everywhere, or Haiku with a confidence gate that sends hard cases to a person.",
    note: "An ADR that lists one option is not a decision record, it is a changelog entry.",
  },
  {
    id: "decision",
    short: "Decision",
    title: "Decision",
    body: "Classify with Haiku. Below 0.82 confidence, escalate to a human with a drafted summary attached. Use Opus only for that drafted reply. We do not use Opus for classification and we do not use a rules-only classifier.",
    note: "State what you are not doing. The rejected option is half the value of the record.",
  },
  {
    id: "consequences",
    short: "Consequences",
    title: "Consequences",
    body: "Accuracy goes from 86% to 94.1%, not to the 98.2% Opus would have given — 6% of tickets now wait on a human reviewer, and that queue is the new bottleneck. Cost rises from $0.004 to $0.011 a ticket. Every decision now needs a stored confidence and a stored reason, which is new work for the platform team.",
    note: "Trade-offs are not costs to be minimised in the writing-up; they are the decision.",
  },
  {
    id: "revisit",
    short: "Revisit triggers",
    title: "Revisit triggers",
    body: "Reopen this record if any of these becomes true: triage accuracy on the eval set falls below 88%; the human review queue's p95 wait passes 15 minutes; Opus pricing rises more than 40%; a regulator asks for a documented reason per automated decision; ticket volume passes three times today's.",
    note: "A trigger is a measurable condition, not a feeling. Without one, the decision silently becomes permanent.",
  },
];

const OPTIONS = [
  { name: "Opus everywhere", p95: "p95 14.2 s", cost: 0.19, verdict: "Breaks the latency and cost constraints outright.", tone: "bad" },
  { name: "Haiku everywhere", p95: "p95 1.1 s", cost: 0.004, verdict: "Fast and cheap, but 12% misrouted on nuanced tickets.", tone: "bad" },
  { name: "Haiku + confidence gate", p95: "p95 1.9 s", cost: 0.011, verdict: "Chosen: 94.1% at 6% human review.", tone: "good" },
  { name: "Rules only, no model", p95: "p95 0.2 s", cost: 0.0, verdict: "Deterministic and free, 71% accurate on novel phrasing.", tone: "bad" },
];

type Audience = "eng" | "compliance" | "exec";

const AUDIENCES: Record<Audience, { label: string; wants: string; headline: string; points: [string, string][] }> = {
  eng: {
    label: "Engineering manager",
    wants: "What breaks, who is on call, and what the load is",
    headline: "The classifier is cheap; the review queue is the new critical path.",
    points: [
      ["Failure mode", "Below 0.82 confidence the ticket goes to a human with a drafted summary, so the worst case is a slow answer, never a wrong one."],
      ["New load", "6% of 40,000 tickets is about 2,400 reviewer decisions a month. That queue has no owner yet and it is the thing that will page you."],
      ["Failure handling", "If Haiku degrades, drop the threshold and let more tickets through to review rather than letting accuracy drift silently."],
    ],
  },
  compliance: {
    label: "Compliance officer",
    wants: "Evidence, auditability and where a person is accountable",
    headline: "Every automated classification stores its confidence and its reason; high-impact cases are signed off by a named human.",
    points: [
      ["Audit trail", "Model, version, prompt hash, confidence and the source rule are written to an append-only log per decision, retained 24 months."],
      ["Human accountability", "Anything below the threshold, and anything touching a refund or an account closure, has a named reviewer recorded against it."],
      ["Residency", "Inference runs in eu-central-1 with no cross-region failover, so the data-residency promise stays a fact rather than a policy."],
    ],
  },
  exec: {
    label: "Executive",
    wants: "Cost, throughput, and exactly what we are not promising",
    headline: "94% of tickets route themselves for about a cent each, and 6% get a human — which is the investment, not a saving.",
    points: [
      ["Money", "$0.011 a ticket is roughly $440k a year at current volume. The Opus-everywhere option would have been $7.6m and would have missed the latency target anyway."],
      ["Throughput", "380 manual re-handlings a week become about 35. That is the headcount argument for approving the reviewer role."],
      ["What we will not promise", "We are not promising two-second end-to-end answers, and we will say so before a customer does."],
    ],
  },
};

const PROMISES = [
  { id: "fast", text: "Under 2 seconds, every ticket, guaranteed.", note: "Undeliverable. We have a p95, not a maximum, and a single region with no failover. A guarantee like this fails once and the SLA becomes the thing customers hold us to." },
  { id: "vague", text: "As fast as the model provider allows.", note: "Not a commitment. Nothing here can be managed, alerted on or held to. It reads as caution and functions as an invitation to complain later." },
  { id: "honest", text: "95% of first replies under 4 seconds, drafted answers under 7 seconds, measured live on the eval set.", note: "Exactly what we measure, so exactly what we can prove when someone asks. The number, the percentile and the measurement all match the design." },
];

export default function StakeholderTradeoff() {
  const reduce = !!useReducedMotion();
  const [step, setStep] = useState(0);
  const [audience, setAudience] = useState<Audience>("eng");
  const [promise, setPromise] = useState<string | null>(null);
  const last = SECTIONS.length - 1;

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    setStep((s) => Math.min(last, Math.max(0, s + (e.key === "ArrowRight" ? 1 : -1))));
  };
  const a = AUDIENCES[audience];

  return (
    <div className="space-y-4" onKeyDown={onKey}>
      <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="min-w-0 rounded-xl border border-line bg-bg/60 p-3">
          <p className="text-xs font-medium text-muted">Decision record</p>
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="ADR sections. Use left and right arrow keys to move between sections.">
            {SECTIONS.map((s, i) => (
              <Pill key={s.id} on={step === i} onClick={() => setStep(i)} label={`ADR section ${i + 1}: ${s.title}`}>
                <span className="font-mono">{i + 1}</span> {s.short}
              </Pill>
            ))}
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: reduce ? 0 : 0.22 }}
              className="mt-3 space-y-2"
            >
              <h3 className="font-display text-base font-semibold text-ink">{SECTIONS[step].title}</h3>
              <p className="text-sm leading-relaxed text-ink-2">{SECTIONS[step].body}</p>
              <p className="rounded-lg bg-accent-soft px-3 py-2 text-xs text-ink">{SECTIONS[step].note}</p>
            </motion.div>
          </AnimatePresence>

          {step === 1 && (
            <div className="mt-3 rounded-xl bg-surface-2/50 p-2">
              <svg
                viewBox="0 0 340 152"
                className="h-auto w-full"
                role="img"
                aria-label={`Cost per ticket by option: ${OPTIONS.map((o) => `${o.name} ${o.cost === 0 ? "free" : `$${o.cost.toFixed(3)}`}, ${o.p95}`).join("; ")}. Chosen: Haiku with a confidence gate.`}
              >
                <text x={4} y={12} fill="var(--muted)" style={{ font: "600 11px var(--font-mono)" }}>
                  COST PER TICKET AND p95 LATENCY
                </text>
                {OPTIONS.map((o, i) => {
                  const y = 24 + i * 30;
                  const on = o.tone === "good";
                  return (
                    <g key={o.name}>
                      <text x={4} y={y + 11} fill={on ? "var(--ink)" : "var(--ink-2)"} style={{ font: `${on ? 700 : 500} 12px var(--font-sans)` }}>
                        {o.name}
                      </text>
                      <text x={4} y={y + 24} fill="var(--muted)" style={{ font: "400 11px var(--font-mono)" }}>
                        {o.p95}
                      </text>
                      <rect x={150} y={y + 2} width={130} height={13} rx={6} fill="var(--surface)" stroke="var(--line)" />
                      <motion.rect
                        x={150}
                        y={y + 2}
                        height={13}
                        rx={6}
                        fill={on ? "var(--good)" : "var(--bad)"}
                        initial={false}
                        animate={{ width: Math.max(3, (o.cost / 0.19) * 130) }}
                        transition={{ duration: reduce ? 0 : 0.55, ease: EASE }}
                      />
                      <text x={288} y={y + 13} fill={on ? "var(--good)" : "var(--ink-2)"} style={{ font: `${on ? 700 : 400} 12px var(--font-mono)` }}>
                        {o.cost === 0 ? "free" : `$${o.cost.toFixed(3)}`}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-3 rounded-xl border border-line bg-bg/60 p-3">
          <div>
            <p className="text-xs font-medium text-muted">The facts, identical in every room</p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Measured facts, unchanged by audience">
              {FACTS.map((f) => (
                <li key={f.k} className="rounded-lg border border-line bg-surface px-2 py-1">
                  <span className="block font-mono text-xs font-semibold text-ink">{f.v}</span>
                  <span className="block text-[11px] text-muted">{f.k}</span>
                </li>
              ))}
            </ul>
          </div>

          <div role="group" aria-label="Choose the audience">
            <p className="text-xs font-medium text-muted">Same decision, rewritten for</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {(Object.keys(AUDIENCES) as Audience[]).map((k) => (
                <Pill key={k} on={audience === k} onClick={() => setAudience(k)} label={`Audience: ${AUDIENCES[k].label}`}>
                  {AUDIENCES[k].label}
                </Pill>
              ))}
            </div>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={audience}
              initial={reduce ? false : { opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduce ? undefined : { opacity: 0, x: -10 }}
              transition={{ duration: reduce ? 0 : 0.22 }}
            >
              <p className="text-xs text-muted">Wants: {a.wants}</p>
              <p className="mt-1 font-display text-sm font-semibold text-ink">{a.headline}</p>
              <ul className="mt-2 space-y-1.5">
                {a.points.map(([k, v]) => (
                  <li key={k} className="rounded-lg border border-line bg-surface px-2.5 py-2">
                    <span className="block text-xs font-semibold text-ink">{k}</span>
                    <span className="mt-0.5 block text-xs text-ink-2">{v}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          </AnimatePresence>

          <p className="text-xs text-muted">
            Three versions, one set of numbers. Changing the audience changes what you lead with and what you leave out — never the measurements.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-line bg-bg/60 p-3">
        <p className="text-xs font-semibold text-muted">“Can you commit to a 2-second answer?” Pick what you would actually say.</p>
        <div className="mt-2 grid grid-cols-1 gap-2 @2xl:grid-cols-3">
          {PROMISES.map((p) => {
            const picked = promise === p.id;
            const good = p.id === "honest";
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={picked}
                aria-label={`Promise to stakeholders: ${p.text}`}
                onClick={() => setPromise(p.id)}
                className={clsx(
                  "rounded-lg border px-2.5 py-2 text-left transition-colors",
                  picked ? (good ? "border-good bg-good-soft" : "border-bad bg-bad-soft") : "border-line bg-surface hover:border-line-strong",
                )}
              >
                <span className="flex items-start gap-1.5 text-xs font-medium text-ink">
                  {good ? <Check size={14} className="mt-0.5 shrink-0" style={{ color: "var(--good)" }} aria-hidden /> : <AlertTriangle size={14} className="mt-0.5 shrink-0" style={{ color: "var(--bad)" }} aria-hidden />}
                  “{p.text}”
                </span>
                <AnimatePresence initial={false}>
                  {picked && (
                    <motion.span
                      initial={reduce ? false : { opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: reduce ? 0 : 0.2 }}
                      className="mt-1.5 block text-xs text-ink-2"
                    >
                      {p.note}
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            );
          })}
        </div>
        <p className="mt-2 min-h-10 text-[0.95rem] text-ink-2" aria-live="polite">
          {promise
            ? PROMISES.find((p) => p.id === promise)?.note
            : "Expectation management is saying the number you can measure, with its percentile, before anyone asks for a better one. Choose a promise to see whether it is one you could defend in an incident review."}
        </p>
      </div>

      <div className="flex flex-col gap-3 @lg:flex-row @lg:items-center @lg:justify-between">
        <p className="min-h-10 min-w-0 text-[0.95rem] text-ink-2" aria-live="polite">
          <span className="mr-2 font-display font-semibold text-ink tabular">
            {step + 1}/{SECTIONS.length}
          </span>
          {SECTIONS[step].note}
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          <CtrlButton label="Previous section" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            <ChevronLeft size={18} />
          </CtrlButton>
          <CtrlButton label="Next section" onClick={() => setStep((s) => Math.min(last, s + 1))} disabled={step === last}>
            <ChevronRight size={18} />
          </CtrlButton>
          <CtrlButton
            label="Reset"
            onClick={() => {
              setStep(0);
              setAudience("eng");
              setPromise(null);
            }}
          >
            <RotateCcw size={16} />
          </CtrlButton>
        </div>
      </div>
    </div>
  );
}

function Pill({ on, onClick, label, children }: { on: boolean; onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      onClick={onClick}
      className={clsx(
        "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors active:scale-[0.98]",
        on ? "border-accent-strong bg-accent-soft text-ink" : "border-line bg-surface text-ink-2 hover:border-line-strong",
      )}
    >
      {children}
    </button>
  );
}

function CtrlButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid size-9 place-items-center rounded-xl border border-line-strong bg-surface text-ink transition-colors hover:border-ink active:scale-95 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
