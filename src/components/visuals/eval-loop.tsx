"use client";

import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useHydratedReducedMotion } from "@/lib/use-reduced-motion";
import { Check, ChevronLeft, ChevronRight, Minus, Pause, Play, RotateCcw, X } from "lucide-react";
import clsx from "clsx";
import { cos, sin } from "@/lib/trig";

type Grader = "code" | "judge" | "human";
type Lever = "examples" | "model" | "refusal";
type Verdict = boolean | null; // null = this grader can't judge it

const STAGES = [
  { short: "Criteria", title: "Define success", caption: "Decide what “good” means before testing anything: a measurable target for accuracy, speed, cost and safety, and which of them are hard gates." },
  { short: "Eval set", title: "Build the test set", caption: "Collect realistic examples plus deliberately tricky ones. Typical cases alone make the system look better than it is." },
  { short: "Run", title: "Run every case", caption: "Send every test case through the current version of the system and keep each output and transcript." },
  { short: "Grade", title: "Grade the outputs", caption: "Score each answer with code, a model following a rubric, or a person. Each grader trades speed and cost for nuance." },
  { short: "Analyze", title: "Read the failures", caption: "A score says that something failed. Reading the transcripts says why, which tells you what to fix." },
  { short: "Change", title: "Change one thing", caption: "Change one variable at a time (the prompt, the model, the retrieval or a tool description) so you know what caused any difference." },
  { short: "Compare", title: "Rerun and compare", caption: "Run the same test set with the same graders, compare A with B on every metric, then keep the change or revert it. Then go round again." },
];

// Illustrative support-bot eval set. truth = what a careful expert would say.
const CASES: { id: string; text: string; edge: boolean; truth: boolean; code: Verdict; judge: boolean; why?: string }[] = [
  { id: "1", text: "Reset my password", edge: false, truth: true, code: true, judge: true },
  { id: "2", text: "Refund for order 4411", edge: false, truth: true, code: true, judge: true },
  { id: "3", text: "Where's my parcel?", edge: false, truth: true, code: false, judge: true },
  { id: "4", text: "Change billing address", edge: false, truth: true, code: true, judge: true },
  { id: "5", text: "Cancel my subscription", edge: false, truth: false, code: true, judge: false, why: "Quoted last year's cancellation policy: retrieval found a stale document." },
  { id: "6", text: "My invoice is wrong", edge: false, truth: true, code: true, judge: true },
  { id: "7", text: "Upgrade to the Pro plan", edge: false, truth: true, code: true, judge: true },
  { id: "8", text: "Let me talk to a human", edge: false, truth: true, code: true, judge: true },
  { id: "E1", text: "(empty message)", edge: true, truth: true, code: null, judge: true },
  { id: "E2", text: "my acct wnt let me in lol", edge: true, truth: false, code: false, judge: false, why: "Typos and slang: misread as a billing question." },
  { id: "E3", text: "Great, broken AGAIN. Love it.", edge: true, truth: false, code: null, judge: true, why: "Sarcasm: replied “Glad you love it!”. The LLM judge missed this one too." },
  { id: "E4", text: "What's your CEO's salary?", edge: true, truth: true, code: null, judge: true },
];

const GRADERS: Record<Grader, { name: string; how: string; speed: number; cheap: number; nuance: number; note: string }> = {
  code: { name: "Code", how: "Exact match on the label, regex, JSON schema check, unit tests.", speed: 5, cheap: 5, nuance: 1, note: "Instant, cheap and deterministic, but brittle. It failed #3 for saying “delivery” instead of “shipping”, passed #5 because the label was right but the policy was stale, and can't judge tone at all." },
  judge: { name: "LLM judge", how: "A different model scores each answer against a written rubric and returns a constrained verdict.", speed: 4, cheap: 3, nuance: 4, note: "Scales and understands tone, but it isn't deterministic. It passed the sarcasm reply (E3), so calibrate it against human grades on a sample." },
  human: { name: "Human", how: "An expert reads each answer and grades it.", speed: 1, cheap: 1, nuance: 5, note: "The gold standard, but slow and expensive. Use people on a sample to calibrate the judge, not to grade every run." },
};

const verdictOf = (c: (typeof CASES)[number], g: Grader): Verdict => (g === "code" ? c.code : g === "judge" ? c.judge : c.truth);
const rate = (cs: (typeof CASES)[number][], g: Grader) => {
  const scored = cs.map((c) => verdictOf(c, g)).filter((v): v is boolean => v !== null);
  return scored.length ? Math.round((scored.filter(Boolean).length / scored.length) * 100) : 0;
};

const CRITERIA = [
  { k: "Accuracy", target: "At least 80% of eval cases pass", gate: false },
  { k: "Latency", target: "p95 under 2.5 s (19 of 20 replies are faster)", gate: false },
  { k: "Cost", target: "Under $0.04 per ticket", gate: false },
  { k: "Safety", target: "0 policy violations", gate: true },
];

type Metrics = { acc: number; lat: number; cost: number; viol: number };
const BASE: Metrics = { acc: 75, lat: 2.1, cost: 0.031, viol: 1 };
const LEVERS: Record<Lever, { label: string; m: Metrics }> = {
  examples: { label: "Add 3 worked examples to the prompt", m: { acc: 83, lat: 2.3, cost: 0.036, viol: 0 } },
  model: { label: "Switch to a smaller, faster model", m: { acc: 69, lat: 1.2, cost: 0.012, viol: 2 } },
  refusal: { label: "Rewrite the off-topic instruction", m: { acc: 79, lat: 2.1, cost: 0.031, viol: 0 } },
};
const TWO: Metrics = { acc: 80, lat: 1.3, cost: 0.016, viol: 1 };

// Ring geometry. Kept compact so 16px labels stay legible when the SVG scales down to a phone.
const R = 112;
const C = 170;
const pos = (i: number) => {
  const a = -Math.PI / 2 + (i / STAGES.length) * Math.PI * 2;
  return { x: C + R * cos(a), y: C + R * sin(a), a };
};
const arc = (i: number) => {
  const a0 = pos(i).a + 0.27;
  const a1 = pos(i + 1).a - 0.27;
  return `M ${C + R * cos(a0)} ${C + R * sin(a0)} A ${R} ${R} 0 0 1 ${C + R * cos(a1)} ${C + R * sin(a1)}`;
};

export default function EvalLoop() {
  const reduce = !!useHydratedReducedMotion();
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [grader, setGrader] = useState<Grader>("judge");
  const [withEdge, setWithEdge] = useState(true);
  const [lever, setLever] = useState<Lever>("examples");
  const [two, setTwo] = useState(false);
  const [round, setRound] = useState(1);
  const last = STAGES.length - 1;
  const stage = STAGES[step];

  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => (step >= last ? setPlaying(false) : setStep((s) => Math.min(last, s + 1))), step >= last ? 0 : 3200);
    return () => clearTimeout(t);
  }, [playing, step, last]);

  const go = (i: number) => setStep(Math.max(0, Math.min(last, i)));
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    go(step + (e.key === "ArrowRight" ? 1 : -1));
  };
  const reset = () => {
    setPlaying(false);
    setStep(0);
    setRound(1);
    setTwo(false);
  };
  const again = () => {
    setPlaying(false);
    setRound((r) => r + 1);
    setStep(2);
  };

  const cases = CASES.filter((c) => withEdge || !c.edge);
  const passRate = rate(cases, grader);
  const expertRate = rate(cases, "human");
  const fails = cases.filter((c) => c.why);

  return (
    <div className="space-y-4" onKeyDown={onKey}>
      <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <div className="rounded-xl bg-surface-2/50 p-2" tabIndex={0} role="group" aria-label="Evaluation loop diagram. Use left and right arrow keys to step.">
          <svg viewBox="-24 6 364 312" className="h-auto w-full" role="img" aria-label={`Round ${round}, stage ${step + 1} of 7, ${stage.title}: ${stage.caption}`}>
            <defs>
              <marker id="el-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M0 0 L10 5 L0 10 z" fill="var(--line-strong)" />
              </marker>
              <marker id="el-arrow-on" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M0 0 L10 5 L0 10 z" fill="var(--accent-strong)" />
              </marker>
            </defs>
            {STAGES.map((_, i) => {
              const on = i === step - 1 || (step === 0 && i === last);
              return (
                <path
                  key={i}
                  d={arc(i)}
                  fill="none"
                  stroke={on ? "var(--accent-strong)" : "var(--line-strong)"}
                  strokeWidth={on ? 2.5 : 1.25}
                  strokeDasharray={i === last ? "4 5" : undefined}
                  markerEnd={on ? "url(#el-arrow-on)" : "url(#el-arrow)"}
                  style={{ transition: reduce ? undefined : "stroke 200ms ease" }}
                />
              );
            })}
            {/* Pointer shortcut only: keyboard users step with the arrow keys or the buttons below. */}
            {STAGES.map((s, i) => {
              const p = pos(i);
              const on = i === step;
              const done = i < step;
              const side = Math.abs(cos(p.a)) < 0.3 ? 0 : cos(p.a) > 0 ? 1 : -1;
              return (
                <g key={s.short} onClick={() => go(i)} style={{ cursor: "pointer" }}>
                  <motion.circle
                    cx={p.x}
                    cy={p.y}
                    r={22}
                    fill={on ? "var(--accent)" : done ? "var(--surface)" : "var(--bg)"}
                    stroke={on ? "var(--accent-strong)" : done ? "var(--ink-2)" : "var(--line-strong)"}
                    strokeWidth={on ? 2.5 : 1.25}
                    animate={{ scale: on && !reduce ? 1.12 : 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  />
                  <text x={p.x} y={p.y + 5} textAnchor="middle" fill={on ? "var(--accent-ink)" : "var(--ink)"} style={{ font: "700 15px var(--font-display)" }}>
                    {i + 1}
                  </text>
                  <text
                    x={C + (R + 34) * cos(p.a)}
                    y={C + (R + 34) * sin(p.a) + 5}
                    textAnchor={side === 0 ? "middle" : side > 0 ? "start" : "end"}
                    dx={side * -6}
                    fill={on ? "var(--accent-text)" : "var(--ink-2)"}
                    style={{ font: `${on ? 700 : 500} 16px var(--font-sans)` }}
                  >
                    {s.short}
                  </text>
                </g>
              );
            })}
            <text x={C} y={C - 24} textAnchor="middle" fill="var(--muted)" style={{ font: "500 14px var(--font-mono)" }}>
              ROUND {round}
            </text>
            <AnimatePresence mode="wait">
              {/* motion treats x/y on SVG as transforms, so animate an offset rather than the attribute. */}
              <motion.text
                key={step}
                x={C}
                y={C + 5}
                textAnchor="middle"
                fill="var(--ink)"
                style={{ font: "600 18px var(--font-display)" }}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0 }}
                transition={{ duration: reduce ? 0 : 0.25 }}
              >
                {stage.title}
              </motion.text>
            </AnimatePresence>
            <text x={C} y={C + 28} textAnchor="middle" fill="var(--muted)" style={{ font: "500 14px var(--font-mono)" }}>
              {step >= 3 ? `${passRate}% pass · ${GRADERS[grader].name}` : `${cases.length} cases`}
            </text>
          </svg>
        </div>

        <div className="flex min-h-72 flex-col rounded-xl border border-line bg-bg/60 p-3">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={reduce ? false : { opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduce ? undefined : { opacity: 0, x: -12 }}
              transition={{ duration: reduce ? 0 : 0.22 }}
              className="flex flex-1 flex-col gap-3"
            >
              <p className="text-xs font-medium text-muted">
                Step {step + 1} · {stage.title}
              </p>

              {step === 0 && (
                <ul className="grid grid-cols-1 gap-2 @lg:grid-cols-2">
                  {CRITERIA.map((c) => (
                    <li key={c.k} className="rounded-lg border border-line bg-surface px-3 py-2">
                      <p className="flex items-center justify-between font-display text-sm font-semibold text-ink">
                        {c.k}
                        {c.gate ? <span className="rounded-full bg-bad-soft px-2 py-0.5 font-mono text-xs text-bad">hard gate</span> : null}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-2">{c.target}</p>
                    </li>
                  ))}
                  <li className="text-xs text-muted @lg:col-span-2">“Be accurate” is not a criterion. A number with a threshold is. A hard gate must pass no matter how good the other numbers look.</li>
                </ul>
              )}

              {(step === 1 || step === 2 || step === 3) && (
                <>
                  {step === 1 && <Toggle on={withEdge} onClick={() => setWithEdge((v) => !v)} label="Include edge cases (empty input, typos, sarcasm, questions it should decline)" />}
                  {step === 3 && (
                    <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Choose a grader">
                      {(Object.keys(GRADERS) as Grader[]).map((g) => (
                        <Pill key={g} on={grader === g} onClick={() => setGrader(g)} label={`Grade with ${GRADERS[g].name}`}>
                          {GRADERS[g].name}
                        </Pill>
                      ))}
                    </div>
                  )}
                  <ul className="grid grid-cols-2 gap-1.5 @lg:grid-cols-3" aria-label="Eval cases">
                    {cases.map((c, i) => {
                      const v = verdictOf(c, grader);
                      const wrong = step === 3 && v !== null && v !== c.truth;
                      return (
                        <motion.li
                          key={c.id}
                          layout={!reduce}
                          initial={reduce ? false : { opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: reduce ? 0 : step === 2 ? i * 0.12 : 0, duration: reduce ? 0 : 0.25 }}
                          title={wrong ? "This grade disagrees with the expert's" : undefined}
                          className={clsx(
                            "flex items-start gap-1.5 rounded-lg border bg-surface px-2 py-1.5 text-xs leading-snug text-ink",
                            c.edge ? "border-dashed border-info" : "border-line",
                            wrong && "ring-2 ring-accent",
                          )}
                        >
                          <span className={clsx("font-mono font-semibold", c.edge ? "text-info" : "text-muted")}>{c.id}</span>
                          <span className="flex-1 break-words">{c.text}</span>
                          {step === 3 && <Mark v={v} wrong={wrong} />}
                          {step === 2 && (
                            <motion.span
                              role="img"
                              aria-label="output recorded"
                              className="mt-1 size-2 shrink-0 rounded-full bg-good"
                              initial={reduce ? false : { opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: reduce ? 0 : i * 0.12 + 0.3, duration: reduce ? 0 : 0.2 }}
                            />
                          )}
                        </motion.li>
                      );
                    })}
                  </ul>
                  {step === 1 && (
                    <p className="text-xs text-ink-2">
                      Graded by an expert, this set scores <b className="text-ink">{expertRate}%</b>.{" "}
                      {withEdge ? "The dashed edge cases are where the weak spots show." : "Without edge cases the score is flattering and misleading."}
                    </p>
                  )}
                  {step === 2 && <p className="text-xs text-ink-2">Run several trials per case. Outputs vary from run to run, so a one-run 2-point gap may be noise.</p>}
                  {step === 3 && <GraderCard g={grader} cases={cases} />}
                </>
              )}

              {step === 4 && (
                <ul className="space-y-2">
                  {fails.map((c, i) => (
                    <motion.li
                      key={c.id}
                      initial={reduce ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: reduce ? 0 : i * 0.1, duration: reduce ? 0 : 0.25 }}
                      className="rounded-lg border border-line bg-surface px-3 py-2"
                    >
                      <p className="font-mono text-xs text-bad">
                        fail · {c.id} “{c.text}”
                      </p>
                      <p className="mt-0.5 text-xs text-ink">{c.why}</p>
                    </motion.li>
                  ))}
                  <li className="text-xs text-muted">Each confirmed failure also becomes a permanent regression case, so the next change can&apos;t quietly break it again.</li>
                </ul>
              )}

              {step === 5 && (
                <div className="space-y-2" role="group" aria-label="Pick the one change to test">
                  {(Object.keys(LEVERS) as Lever[]).map((l) => (
                    <Pill key={l} wide on={lever === l} onClick={() => setLever(l)} label={LEVERS[l].label}>
                      {LEVERS[l].label}
                    </Pill>
                  ))}
                  <Toggle on={two} onClick={() => setTwo((v) => !v)} label="Also switch the model at the same time" warn />
                  {two && <p className="text-xs text-bad">Two changes at once: if the score moves, you won&apos;t know which change caused it.</p>}
                </div>
              )}

              {step === 6 && <Compare b={two ? TWO : LEVERS[lever].m} two={two} lever={lever} reduce={reduce} onAgain={again} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="flex flex-col gap-3 @lg:flex-row @lg:items-center @lg:justify-between">
        <p className="min-h-12 text-[0.95rem] text-ink-2" aria-live="polite">
          <span className="mr-2 font-display font-semibold text-ink tabular">
            {step + 1}/{STAGES.length}
          </span>
          {stage.caption}
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          <CtrlButton label="Previous stage" onClick={() => go(step - 1)} disabled={step === 0}>
            <ChevronLeft size={18} />
          </CtrlButton>
          <CtrlButton
            label={playing ? "Pause" : "Play through the stages"}
            onClick={() => {
              if (step >= last) setStep(0);
              setPlaying((p) => !p);
            }}
          >
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </CtrlButton>
          <CtrlButton label="Next stage" onClick={() => go(step + 1)} disabled={step === last}>
            <ChevronRight size={18} />
          </CtrlButton>
          <CtrlButton label="Reset to stage 1" onClick={reset}>
            <RotateCcw size={16} />
          </CtrlButton>
        </div>
      </div>
    </div>
  );
}

// lucide icons are aria-hidden by default, so the accessible name goes on a wrapper.
function Mark({ v, wrong }: { v: Verdict; wrong: boolean }) {
  const label = v === null ? "can't grade" : v ? "pass" : "fail";
  return (
    <span role="img" aria-label={wrong ? `${label}, disagrees with the expert` : label} className="shrink-0">
      {v === null ? <Minus size={14} className="text-muted" /> : v ? <Check size={14} className="text-good" /> : <X size={14} className="text-bad" />}
    </span>
  );
}

function GraderCard({ g, cases }: { g: Grader; cases: typeof CASES }) {
  const d = GRADERS[g];
  const graded = cases.filter((c) => verdictOf(c, g) !== null);
  const agree = graded.filter((c) => verdictOf(c, g) === c.truth).length;
  const rows: [string, number][] = [
    ["Speed", d.speed],
    ["Low cost", d.cheap],
    ["Nuance", d.nuance],
  ];
  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <p className="text-xs text-muted">{d.how}</p>
      <div className="mt-2 space-y-1.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center gap-2 text-xs">
            <span className="w-16 text-ink-2">{k}</span>
            <div className="flex flex-1 gap-1" role="img" aria-label={`${k}: ${v} of 5`}>
              {[1, 2, 3, 4, 5].map((n) => (
                <span key={n} className={clsx("h-2 flex-1 rounded-full transition-colors duration-300", n <= v ? "bg-accent" : "bg-surface-2")} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink">{d.note}</p>
      <p className="mt-1 text-xs text-muted">
        Agrees with the expert on {agree} of the {graded.length} cases it could grade{g === "human" ? " (it is the expert)" : ""}. Highlighted cases disagree. Real suites mix all three graders.
      </p>
    </div>
  );
}

function Compare({ b, two, lever, reduce, onAgain }: { b: Metrics; two: boolean; lever: Lever; reduce: boolean; onAgain: () => void }) {
  const rows = [
    { k: "Accuracy", a: BASE.acc, b: b.acc, fmt: (n: number) => `${n}%`, max: 100, up: true },
    { k: "Speed (p95)", a: BASE.lat, b: b.lat, fmt: (n: number) => `${n.toFixed(1)} s`, max: 3, up: false },
    { k: "Cost per ticket", a: BASE.cost, b: b.cost, fmt: (n: number) => `$${n.toFixed(3)}`, max: 0.045, up: false },
    { k: "Policy violations", a: BASE.viol, b: b.viol, fmt: (n: number) => `${n}`, max: 3, up: false },
  ];
  const ship = !two && b.acc >= 80 && b.lat < 2.5 && b.cost < 0.04 && b.viol === 0;
  const decision: "keep" | "iterate" | "revert" = two || lever === "model" ? "revert" : ship ? "keep" : "iterate";
  const verdict = {
    keep: "Meets every target, including the safety gate. Keep it as the new baseline.",
    iterate: "Passes the safety gate and beats the baseline, but accuracy is still under the 80% target. Keep it as the new baseline and go round again.",
    revert: two ? "Mostly better, but you can't tell which change helped. Revert and test one change at a time." : "Faster and cheaper, but accuracy dropped and the safety gate failed. Revert.",
  }[decision];
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">
        <span className="mr-2 inline-block size-2 rounded-full bg-line-strong" />A: baseline
        <span className="mr-2 ml-3 inline-block size-2 rounded-full bg-accent" />B: {two ? "two changes at once" : LEVERS[lever].label.toLowerCase()}
      </p>
      {rows.map((r) => {
        const better = r.up ? r.b > r.a : r.b < r.a;
        const same = r.a === r.b;
        return (
          <div key={r.k} className="text-xs">
            <div className="flex justify-between text-ink-2">
              <span>{r.k}</span>
              <span className={clsx("font-mono", same ? "text-muted" : better ? "text-good" : "text-bad")}>
                {r.fmt(r.a)} → {r.fmt(r.b)}
                <span className="sr-only">{same ? ", unchanged" : better ? ", better" : ", worse"}</span>
              </span>
            </div>
            {[r.a, r.b].map((v, j) => (
              <div key={j} className="mt-0.5 h-1.5 rounded-full bg-surface-2">
                <motion.div
                  className={clsx("h-full rounded-full", j ? "bg-accent" : "bg-line-strong")}
                  initial={reduce ? false : { width: 0 }}
                  animate={{ width: `${Math.min(100, (v / r.max) * 100)}%` }}
                  transition={{ duration: reduce ? 0 : 0.6, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
            ))}
          </div>
        );
      })}
      <p
        className={clsx(
          "rounded-lg px-3 py-2 text-xs font-medium",
          decision === "keep" && "bg-good-soft text-good",
          decision === "iterate" && "bg-accent-soft text-accent-text",
          decision === "revert" && "bg-bad-soft text-bad",
        )}
      >
        {verdict}
      </p>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted">Illustrative numbers.</span>
        <button type="button" onClick={onAgain} aria-label="Start another round from the Run stage" className="rounded-lg border border-line-strong bg-surface px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:border-ink">
          Go round again ↻
        </button>
      </div>
    </div>
  );
}

function Pill({ on, onClick, label, children, wide }: { on: boolean; onClick: () => void; label: string; children: ReactNode; wide?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      onClick={onClick}
      className={clsx(
        "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors active:scale-[0.98]",
        wide && "block w-full text-left",
        on ? "border-accent-strong bg-accent-soft text-ink" : "border-line bg-surface text-ink-2 hover:border-line-strong",
      )}
    >
      {children}
    </button>
  );
}

function Toggle({ on, onClick, label, warn }: { on: boolean; onClick: () => void; label: string; warn?: boolean }) {
  const reduce = useHydratedReducedMotion();
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onClick} className="flex w-full items-center gap-2 text-left text-xs text-ink-2">
      <span className={clsx("relative h-5 w-9 shrink-0 rounded-full transition-colors", on ? (warn ? "bg-bad" : "bg-accent-strong") : "bg-line-strong")}>
        <motion.span className="absolute top-0.5 size-4 rounded-full bg-surface" animate={{ left: on ? 18 : 2 }} transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 30 }} />
      </span>
      {label}
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
