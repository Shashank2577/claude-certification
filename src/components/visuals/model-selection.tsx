"use client";

import { useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useHydratedReducedMotion } from "@/lib/use-reduced-motion";
import clsx from "clsx";
import { Brain, ChevronDown, Gauge, TriangleAlert } from "lucide-react";

type Tier = "haiku" | "sonnet" | "opus";
type Mode = "standard" | "extended";
type Effort = "none" | "low" | "high";

interface Profile {
  id: string;
  label: string;
  volume: string;
  tolerance: string;
  best: Tier;
  scores: Record<Tier, { q: number; note: string }>;
  failure: { what: string; trace: string[] };
}

interface TierSpec {
  name: string;
  short: string;
  // Illustrative list prices, $ per million tokens.
  inPrice: number;
  outPrice: number;
  speed: number;
  depth: number;
  note: string;
}

const TIERS: Record<Tier, TierSpec> = {
  haiku: { name: "Haiku", short: "fastest, cheapest", inPrice: 1, outPrice: 5, speed: 5, depth: 2, note: "Near-instant and the cheapest tier. Best where the task is narrow, repetitive and easy to check." },
  sonnet: { name: "Sonnet", short: "the default", inPrice: 3, outPrice: 15, speed: 4, depth: 4, note: "The default choice. Handles long context, tools and multi-step reasoning without being expensive." },
  opus: { name: "Opus", short: "deepest reasoning", inPrice: 15, outPrice: 75, speed: 2, depth: 5, note: "Strongest on hard, ambiguous, long-horizon problems. Costs about 5× Sonnet and answers more slowly." },
};

const PROFILES: Profile[] = [
  {
    id: "classify",
    label: "Classify 50,000 support tickets",
    volume: "50k requests/day",
    tolerance: "Must be under $0.002 a ticket. A 2% error rate is fixable by a human reading a queue.",
    best: "haiku",
    scores: {
      haiku: { q: 93, note: "Single-label classification with a short, stable label set. Haiku matches the expert grader most of the time." },
      sonnet: { q: 96, note: "Two to three points better on the ambiguous tickets, at roughly 3× the price." },
      opus: { q: 97, note: "Marginally better still, at roughly 15× Haiku's price. The extra 4 points do not pay for themselves here." },
    },
    failure: {
      what: "Opus on the cheap task: the failure is not quality, it is arithmetic",
      trace: [
        "50,000 × 4,000 input + 300 output tokens = 215M input, 15M output.",
        "At Haiku prices that is $230/day. At Opus prices it is $3,450/day.",
        "Opus is 1 point more accurate, which is 500 tickets a day handed to a human reviewer at ~$6 each — $3,000/day of human time.",
        "The expensive model saves ~$5/day and creates ~$2,500/day of review work. The trade fails on its own terms.",
      ],
    },
  },
  {
    id: "contract",
    label: "Draft a contract summary",
    volume: "400 requests/day",
    tolerance: "A lawyer reads every one. Latency under 20 s is fine; cost is not the constraint.",
    best: "sonnet",
    scores: {
      haiku: { q: 71, note: "Misses clauses that depend on other clauses. Flags the wrong renewal and indemnity terms." },
      sonnet: { q: 93, note: "Catches cross-references and non-standard terms. Leaves the lawyer a summary they can edit." },
      opus: { q: 97, note: "Noticeably better on dense amendments where obligations are spread over five pages." },
    },
    failure: {
      what: "Haiku on the hard task: a specific, traceable miss",
      trace: [
        "Clause 7.2 says the notice period 'is as set out in Schedule 2'.",
        "Schedule 2 sets it at 90 days for enterprise customers.",
        "The account is on the enterprise plan, so the correct answer is 90 days.",
        "Haiku reports 30 days. It read clause 7.2 and never followed the reference into Schedule 2.",
        "The lawyer does not notice, because the summary reads fluently. One wrong renewal date is worth far more than the $0.09 saved per request.",
      ],
    },
  },
  {
    id: "race",
    label: "Debug a subtle race condition",
    volume: "20 requests/day",
    tolerance: "Twenty a day. You will happily wait a minute and pay a dollar.",
    best: "opus",
    scores: {
      haiku: { q: 28, note: "Proposes a plausible fix for the wrong mechanism. Reads symptoms, not the interleaving." },
      sonnet: { q: 74, note: "Finds the shared mutable state, but stops at the first race and misses the second one." },
      opus: { q: 92, note: "Holds the whole interleaving in view and reasons about which ordering is actually reachable." },
    },
    failure: {
      what: "Sonnet on the hardest task: the expensive miss",
      trace: [
        "There are two races. Fixing only the first halves the error rate; it does not remove it.",
        "Sonnet finds race #1, reports a confident fix, and stops.",
        "In production the residual race fires about once a week, in the middle of the night.",
        "Opus spends more tokens up front and returns both. The reasoning is the deliverable, so the expensive tier buys the answer here.",
        "The lesson: judge on what the output is for. If a human must reason about the output anyway, pay for better reasoning.",
      ],
    },
  },
  {
    id: "factual",
    label: "Answer a simple factual question",
    volume: "1M requests/day",
    tolerance: "Volume is enormous. Any avoidable cost at this scale is the whole budget.",
    best: "haiku",
    scores: {
      haiku: { q: 97, note: "A short factual lookup with the answer in the context. The easy case for a small model." },
      sonnet: { q: 98, note: "One point better, at 3× the price and slower. On 1M requests that is not worth one point." },
      opus: { q: 98, note: "No meaningful gain here at 15× the price. The task is below the ceiling of every tier." },
    },
    failure: {
      what: "Opus on the trivial task: quality stops mattering long before cost does",
      trace: [
        "1M requests/day × 1,200 input + 150 output tokens.",
        "Haiku: roughly $1,950/day. Opus: roughly $14,550/day.",
        "Accuracy differs by about one point, which on a fact-lookup benchmark is inside the noise of the test set.",
        "Scaling up a model that does not help on this task is the single most expensive mistake in this app.",
      ],
    },
  },
];

const MODES: { id: Mode; label: string; note: string }[] = [
  { id: "standard", label: "Standard", note: "Normal latency. The model returns as soon as it has an answer." },
  { id: "extended", label: "Extended thinking", note: "The model reasons for longer before replying. Slower, more output tokens, better on hard problems." },
];

// out = multiplier on output tokens (thinking tokens are billed as output), ms = added p50 latency.
const EFFORTS: { id: Effort; label: string; note: string; out: number; ms: number }[] = [
  { id: "none", label: "Off", note: "No thinking budget. Right for extraction and classification.", out: 1, ms: 0 },
  { id: "low", label: "Low", note: "A short scratch budget. A good default for summarisation.", out: 1.6, ms: 900 },
  { id: "high", label: "High", note: "Long reasoning before the answer. Worth it when the reasoning is the deliverable.", out: 3.4, ms: 4200 },
];

// Illustrative request shape per profile, used only for the $/request readout.
const SHAPE: Record<string, { inTok: number; outTok: number; daily: number }> = {
  classify: { inTok: 4000, outTok: 300, daily: 50_000 },
  contract: { inTok: 12_000, outTok: 1200, daily: 400 },
  race: { inTok: 25_000, outTok: 3000, daily: 20 },
  factual: { inTok: 1200, outTok: 150, daily: 1_000_000 },
};

const p50: Record<Tier, number> = { haiku: 0.6, sonnet: 1.9, opus: 5.4 };

export default function ModelSelection() {
  const reduce = !!useHydratedReducedMotion();
  const [pid, setPid] = useState("contract");
  const [tier, setTier] = useState<Tier>("sonnet");
  const [mode, setMode] = useState<Mode>("standard");
  const [effort, setEffort] = useState<Effort>("none");
  const [open, setOpen] = useState(false);

  const p = PROFILES.find((x) => x.id === pid)!;
  const spec = TIERS[tier];
  const eff = EFFORTS.find((e) => e.id === effort)!;
  const shape = SHAPE[p.id];
  // Illustrative: extended thinking lengthens the reasoning, so it multiplies output tokens and time, not input.
  const extendedOut = mode === "extended" ? 1.5 : 1;
  const extendedMs = mode === "extended" ? 1.5 : 1;
  const outTok = shape.outTok * eff.out * extendedOut;

  const perReq = (shape.inTok * spec.inPrice + outTok * spec.outPrice) / 1_000_000;
  const dayCost = perReq * shape.daily;
  const latency = p50[tier] + eff.ms * extendedMs;
  const q = p.scores[tier].q;
  const pick = tier === p.best;
  const gap = Math.abs(p.scores[p.best].q - q);

  const onKey = (e: KeyboardEvent) => {
    const i = PROFILES.findIndex((x) => x.id === pid);
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setPid(PROFILES[(i + 1) % PROFILES.length].id);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setPid(PROFILES[(i - 1 + PROFILES.length) % PROFILES.length].id);
    }
  };

  return (
    <div className="space-y-4" onKeyDown={onKey}>
      <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-2">
          <div className="rounded-xl bg-surface-2/50 p-2" tabIndex={0} role="group" aria-label="Task profile picker and quality comparison. Use left and right arrow keys to change task.">
            <svg viewBox="0 0 340 250" className="h-auto w-full" role="img" aria-label={`${p.label}. Quality on ${TIERS.haiku.name} ${p.scores.haiku.q}, ${TIERS.sonnet.name} ${p.scores.sonnet.q}, ${TIERS.opus.name} ${p.scores.opus.q} out of 100. Selected ${spec.name}.`}>
              <text x="10" y="18" fill="var(--muted)" style={{ font: "500 12px var(--font-mono)" }}>
                SAME TASK, SCORED ON EVERY TIER (%)
              </text>
              {(Object.keys(TIERS) as Tier[]).map((t, i) => {
                const s = p.scores[t].q;
                const on = t === tier;
                const y = 44 + i * 58;
                return (
                  <g key={t} onClick={() => setTier(t)} style={{ cursor: "pointer" }}>
                    <rect x="10" y={y} width="320" height="44" rx="10" fill={on ? "var(--accent-soft)" : "transparent"} />
                    <text x="22" y={y + 18} fill={on ? "var(--ink)" : "var(--ink-2)"} style={{ font: `${on ? 700 : 500} 14px var(--font-display)` }}>
                      {TIERS[t].name}
                    </text>
                    <text x="22" y={y + 34} fill="var(--muted)" style={{ font: "400 11px var(--font-sans)" }}>
                      ${TIERS[t].inPrice} / ${TIERS[t].outPrice} per Mtok
                    </text>
                    <rect x="140" y={y + 12} width="150" height="14" rx="7" fill="var(--surface-2)" />
                    <motion.rect
                      x="140"
                      y={y + 12}
                      height="14"
                      rx="7"
                      fill={t === p.best ? "var(--good)" : on ? "var(--accent)" : "var(--line-strong)"}
                      initial={reduce ? false : { width: 0 }}
                      animate={{ width: (s / 100) * 150 }}
                      transition={{ duration: reduce ? 0 : 0.5, ease: [0.22, 1, 0.36, 1] }}
                    />
                    <text x="318" y={y + 24} textAnchor="end" fill="var(--ink)" style={{ font: "600 14px var(--font-mono)" }}>
                      {s}
                    </text>
                    {t === p.best && (
                      <text x="318" y={y + 40} textAnchor="end" fill="var(--good)" style={{ font: "600 10px var(--font-sans)" }}>
                        best value here
                      </text>
                    )}
                  </g>
                );
              })}
              {/* Two lines: the sentence is wider than the 340-unit viewBox, and an SVG clips to its viewBox. */}
              <text x="10" y="228" fill="var(--muted)" style={{ font: "400 11px var(--font-sans)" }}>
                <tspan x="10">Illustrative quality scores, not published</tspan>
                <tspan x="10" dy={14}>
                  benchmarks. Read the gap, not the absolute number.
                </tspan>
              </text>
            </svg>
          </div>

          <div className="rounded-xl bg-surface-2/50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted">Task profile</p>
              <div className="flex flex-wrap gap-1.5">
                {PROFILES.map((x) => (
                  <Pill key={x.id} on={pid === x.id} onClick={() => setPid(x.id)} label={`Task: ${x.label}`}>
                    {x.label.length > 22 ? `${x.label.slice(0, 21)}…` : x.label}
                  </Pill>
                ))}
              </div>
            </div>
            <p className="mt-2 text-sm font-semibold text-ink">{p.label}</p>
            <p className="text-xs text-muted">
              {p.volume} · {p.tolerance}
            </p>

            <div className="mt-3 grid grid-cols-1 gap-3 @lg:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-muted">Mode</p>
                <div className="mt-1 grid grid-cols-2 gap-1.5">
                  {MODES.map((m) => (
                    <Pill key={m.id} on={mode === m.id} onClick={() => setMode(m.id)} label={`Mode: ${m.label}`}>
                      {m.label}
                    </Pill>
                  ))}
                </div>
                <p className="mt-1 text-xs text-ink-2">{MODES.find((m) => m.id === mode)!.note}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted">Thinking effort</p>
                <div className="mt-1 grid grid-cols-3 gap-1.5">
                  {EFFORTS.map((e) => (
                    <Pill key={e.id} on={effort === e.id} onClick={() => setEffort(e.id)} label={`Thinking effort: ${e.label}`}>
                      {e.label}
                    </Pill>
                  ))}
                </div>
                <p className="mt-1 text-xs text-ink-2">{eff.note}</p>
              </div>
            </div>

            {/* The tier rows in the SVG above are a pointer shortcut; this is the same choice as real buttons. */}
            <div className="mt-3">
              <p className="text-xs font-medium text-muted">Model tier</p>
              <div className="mt-1 grid grid-cols-3 gap-1.5" role="group" aria-label="Choose a model tier">
                {(Object.keys(TIERS) as Tier[]).map((t) => (
                  <Pill key={t} on={tier === t} onClick={() => setTier(t)} label={`Tier: ${TIERS[t].name}`}>
                    {TIERS[t].name}
                  </Pill>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-line bg-bg/60 p-3">
          <div className="grid grid-cols-2 gap-2">
            <Stat k="Quality" v={`${q}/100`} tone={pick ? "good" : gap > 10 ? "bad" : "warn"} sub={pick ? "right tier for this task" : `${gap} points below the best value`} />
            <Stat k="p50 latency" v={`${latency.toFixed(1)} s`} sub={`${spec.name} baseline ${p50[tier]} s${eff.ms ? ` + ${Math.round(eff.ms * extendedMs)} s thinking` : ""}`} />
            <Stat k="Cost / request" v={`$${perReq.toFixed(4)}`} sub={`${shape.inTok.toLocaleString("en-US")} in + ${Math.round(outTok)} out`} />
            <Stat k="Cost / day" v={`$${dayCost.toLocaleString("en-US", { maximumFractionDigits: 0 })}`} sub={`${shape.daily.toLocaleString("en-US")} requests`} />
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={`${tier}-${pid}`}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.2 }}
              className={clsx("rounded-lg px-3 py-2 text-xs font-medium", pick ? "bg-good-soft text-good" : gap <= 3 ? "bg-accent-soft text-accent-text" : "bg-bad-soft text-bad")}
            >
              {pick ? `Good call. ${spec.name} scores highest on value for this task.` : gap <= 3 ? `${spec.name} is ${gap} point${gap === 1 ? "" : "s"} behind, which may be worth paying for.` : `${spec.name} is ${gap} points behind here. The quality gain does not pay for itself at this volume.`}
            </motion.p>
          </AnimatePresence>

          <div className="rounded-lg border border-line bg-surface p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-ink">
              <Gauge size={13} aria-hidden />
              {spec.name}: {spec.short}
            </p>
            <p className="mt-1 text-xs text-ink-2">{spec.note}</p>
            <div className="mt-2 space-y-1">
              {(["speed", "depth"] as const).map((k) => (
                <div key={k} className="flex items-center gap-2 text-xs">
                  <span className="w-14 text-ink-2">{k === "speed" ? "Speed" : "Depth"}</span>
                  <div className="flex flex-1 gap-1" role="img" aria-label={`${k === "speed" ? "Speed" : "Depth"}: ${spec[k]} of 5`}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <span key={n} className={clsx("h-2 flex-1 rounded-full", n <= spec[k] ? "bg-accent" : "bg-surface-2")} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            aria-expanded={open}
            aria-label="Show why the cheap model fails on the hard task"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center justify-between gap-2 rounded-lg border border-line-strong bg-surface px-3 py-2 text-left text-xs font-semibold text-ink transition-colors hover:border-ink"
          >
            <span className="flex items-center gap-1.5">
              <TriangleAlert size={13} aria-hidden className="text-bad" />
              Why the cheap model fails on the hard task
            </span>
            <ChevronDown size={14} className={clsx("transition-transform", open && "rotate-180")} aria-hidden />
          </button>
          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                initial={reduce ? false : { opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={reduce ? undefined : { opacity: 0, height: 0 }}
                transition={{ duration: reduce ? 0 : 0.22 }}
                className="overflow-hidden"
              >
                <div className="rounded-lg border border-bad bg-bad-soft p-3">
                  <p className="text-xs font-semibold text-bad">{p.failure.what}</p>
                  <ol className="mt-1.5 space-y-1">
                    {p.failure.trace.map((l, i) => (
                      <li key={i} className="flex gap-2 text-xs leading-snug text-ink">
                        <span className="font-mono text-bad">{i + 1}.</span>
                        <span>{l}</span>
                      </li>
                    ))}
                  </ol>
                  <p className="mt-2 text-xs text-muted">Illustrative arithmetic for teaching. Real prices and scores come from your own evals and your provider invoice.</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex flex-col gap-3 @lg:flex-row @lg:items-center @lg:justify-between">
        <p className="min-h-12 min-w-0 text-[0.95rem] text-ink-2" aria-live="polite">
          <span className="mr-2 font-display font-semibold text-ink tabular">{spec.name}</span>
          {p.scores[tier].note} Extended thinking multiplies both output tokens and latency; on an easy task it is pure cost. Pick the cheapest tier that clears your quality bar, then re-check with an eval.
        </p>
        <button
          type="button"
          onClick={() => setTier(p.best)}
          aria-label={`Use the best-value tier for this task, ${TIERS[p.best].name}`}
          className="flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-line-strong bg-surface px-3 py-2 text-xs font-semibold text-ink transition-colors hover:border-ink"
        >
          <Brain size={14} aria-hidden />
          Best value: {TIERS[p.best].name}
        </button>
      </div>
    </div>
  );
}

function Stat({ k, v, sub, tone }: { k: string; v: string; sub: string; tone?: "good" | "bad" | "warn" }) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-surface px-2.5 py-2">
      <p className="text-[11px] font-medium text-muted">{k}</p>
      <p className={clsx("font-display text-lg font-bold tabular", tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : "text-ink")}>{v}</p>
      <p className="text-[11px] leading-snug text-muted">{sub}</p>
    </div>
  );
}

function Pill({ on, onClick, label, children }: { on: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
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