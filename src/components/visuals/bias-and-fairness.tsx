"use client";

import { useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { useHydratedReducedMotion } from "@/lib/use-reduced-motion";
import { Scale, ShieldAlert, Users } from "lucide-react";
import clsx from "clsx";

const EASE = [0.22, 1, 0.36, 1] as const;

// Group labels stand in for any protected attribute; naming real ones invites the reader to argue
// about the example instead of the measurement.
const GROUPS = ["Group A", "Group B", "Group C"] as const;
const BASE = [0.79, 0.83, 0.72]; // rates this task produces before anything in your system touches it
const MODEL_BIAS = [0.97, 1, 0.95]; // training-data bias: a floor nobody chose deliberately

type Wording = "criteria" | "legacy";
type Corpus = "balanced" | "skewed";
type EvalSet = "balanced" | "skewed";

const WORDING: Record<Wording, { label: string; text: string; mult: number[] }> = {
  criteria: {
    label: "Criteria first",
    text: "Score against the listed requirements only. Do not weigh anything that is not listed.",
    mult: [1.03, 1, 1.04],
  },
  legacy: {
    label: "Legacy wording",
    text: "Looking for a young, energetic team player who fits our culture. Penalise career gaps.",
    mult: [0.86, 1.04, 0.76],
  },
};

const CORPUS: Record<Corpus, { label: string; text: string; mult: number[] }> = {
  balanced: { label: "Representative", text: "The retrieval corpus mirrors the applicant pool (A 40% / B 40% / C 20%), so no group's shape becomes the template.", mult: [1, 1, 1] },
  skewed: { label: "One group dominates", text: "The corpus is A 15% / B 80% / C 5%, so the few-shot examples and style guides all describe Group B.", mult: [0.94, 1, 0.85] },
};

const EVALSET: Record<EvalSet, { label: string; text: string; w: number[] }> = {
  balanced: { label: "Balanced", text: "Quotas of at least 200 cases per group, so each rate carries an interval you can defend.", w: [0.4, 0.4, 0.2] },
  skewed: { label: "Skewed", text: "Cases taken from last year's hires: A 5% / B 90% / C 5%.", w: [0.05, 0.9, 0.05] },
};

// Bar geometry. The 4/5ths floor is the number that matters, so the axis labels get their own margin.
const B = { x: 40, w: 280, top: 36, h: 122, base: 158 };
const barX = (i: number) => B.x + i * ((B.w + 26) / 3);
const barW = (B.w + 26) / 3 - 22;
const yFor = (p: number) => B.base - (p / 100) * B.h;

const rate = (i: number, w: Wording, c: Corpus) => Math.round(Math.min(0.97, BASE[i] * MODEL_BIAS[i] * WORDING[w].mult[i] * CORPUS[c].mult[i]) * 100);

export default function BiasAndFairness() {
  const reduce = !!useHydratedReducedMotion();
  const [wording, setWording] = useState<Wording>("legacy");
  const [corpus, setCorpus] = useState<Corpus>("skewed");
  const [evalSet, setEvalSet] = useState<EvalSet>("skewed");

  const rates = GROUPS.map((_, i) => rate(i, wording, corpus));
  const best = Math.max(...rates);
  const worst = Math.min(...rates);
  const worstName = GROUPS[rates.indexOf(worst)];
  const ratio = best ? worst / best : 1;
  const measured = Math.round(rates.reduce((s, r, i) => s + r * EVALSET[evalSet].w[i], 0));
  const overBar = measured >= 80;
  const underFourFifths = ratio < 0.8;

  const verdict = overBar
    ? `Overall accuracy is ${measured}%, so this clears the bar and ships. ${worstName} passes at ${worst}% — ${Math.round(ratio * 100)}% of the best group, below the 4/5ths floor.`
    : `Overall accuracy is ${measured}%, so even the single headline number is red. You never needed a subgroup breakdown to see this one.`;

  const mitigations = [
    { t: "Rephrase to criteria", d: "Replace every adjective of intent with a checkable requirement. Cheapest change, and the one the wording switch measures." },
    { t: "Rebalance the eval set", d: "Quota a minimum per group and report every metric per group. Never ship one overall accuracy figure on its own." },
    { t: "Gate the release on 4/5ths", d: `Fail the release when any group passes at under 80% of the best group. Right now that ratio is ${Math.round(ratio * 100)}%.` },
    { t: "Rebalance the corpus", d: "Sample examples and retrieved references per group, or stratify retrieval so one group is not the template." },
    { t: "Human review gate", d: "Put a person on every borderline decision and on every low-volume-group case, and record the reason. That record is what an auditor asks for." },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="min-w-0 rounded-xl bg-surface-2/50 p-2">
          <svg
            viewBox="0 0 340 224"
            className="h-auto w-full"
            role="img"
            aria-label={`Per-group screening pass rates: ${GROUPS.map((g, i) => `${g} ${rates[i]} percent`).join(", ")}. Weighted overall on the eval set ${measured} percent. Best group ${best} percent, worst group ${worst} percent, ratio ${Math.round(ratio * 100)} percent.`}
          >
            <text x={4} y={14} fill="var(--muted)" style={{ font: "600 11px var(--font-mono)" }}>
              TRUE PASS RATE PER GROUP
            </text>
            <line x1={4} y1={yFor(80)} x2={B.x + B.w} y2={yFor(80)} stroke="var(--accent-strong)" strokeDasharray="5 4" strokeWidth={1.5} />
            <text x={4} y={yFor(80) - 4} fill="var(--accent-text)" style={{ font: "600 11px var(--font-mono)" }}>
              80% bar
            </text>
            <line x1={4} y1={B.base} x2={B.x + B.w} y2={B.base} stroke="var(--line-strong)" strokeWidth={1.25} />
            {rates.map((p, i) => (
              <g key={GROUPS[i]}>
                <rect x={barX(i)} y={B.top} width={barW} height={B.base - B.top} rx={6} fill="var(--surface)" stroke="var(--line)" />
                <motion.rect
                  x={barX(i)}
                  width={barW}
                  rx={6}
                  fill={p >= 80 ? "var(--good)" : ratio < 0.8 && p < best * 0.8 ? "var(--bad)" : "var(--accent-strong)"}
                  initial={false}
                  animate={{ y: yFor(p), height: B.base - yFor(p) }}
                  transition={{ duration: reduce ? 0 : 0.55, ease: EASE }}
                />
                <text x={barX(i) + barW / 2} y={yFor(p) - 7} textAnchor="middle" fill="var(--ink)" style={{ font: "700 14px var(--font-mono)" }}>
                  {p}%
                </text>
                <text x={barX(i) + barW / 2} y={B.base + 16} textAnchor="middle" fill="var(--ink-2)" style={{ font: "500 12px var(--font-sans)" }}>
                  {GROUPS[i]}
                </text>
              </g>
            ))}
            <rect x={B.x} y={190} width={B.w} height={14} rx={7} fill="var(--surface-2)" />
            <motion.rect
              x={B.x}
              y={190}
              height={14}
              rx={7}
              fill={overBar ? "var(--good)" : "var(--bad)"}
              initial={false}
              animate={{ width: (measured / 100) * B.w }}
              transition={{ duration: reduce ? 0 : 0.55, ease: EASE }}
            />
            <text x={B.x + B.w} y={218} textAnchor="end" fill="var(--muted)" style={{ font: "500 11px var(--font-mono)" }}>
              WHAT THE TEAM MEASURED (EVAL-SET WEIGHTED): {measured}%
            </text>
          </svg>
        </div>

        <div className="min-w-0 space-y-3 rounded-xl border border-line bg-bg/60 p-3">
          <div
            className={clsx("rounded-lg px-3 py-2", overBar && underFourFifths ? "bg-bad-soft" : underFourFifths || !overBar ? "bg-accent-soft" : "bg-good-soft")}
            aria-live="polite"
          >
            <p className="flex items-center gap-1.5 font-display text-sm font-semibold text-ink">
              <Scale size={15} aria-hidden />
              {overBar && underFourFifths ? "Green overall, red on a group" : underFourFifths ? "Overall bar is red too" : "Bar is green and the groups agree"}
            </p>
            <p className="mt-1 text-xs text-ink-2">{verdict}</p>
          </div>

          <div className="grid grid-cols-1 gap-2 @xl:grid-cols-3">
            <Switcher<Wording> label="Prompt wording" options={WORDING} value={wording} onPick={setWording} />
            <Switcher<Corpus> label="Resume corpus" options={CORPUS} value={corpus} onPick={setCorpus} />
            <Switcher<EvalSet> label="Eval set" options={EVALSET} value={evalSet} onPick={setEvalSet} />
          </div>

          <ul className="space-y-1.5 text-xs">
            <li className="rounded-lg border border-line bg-surface px-2.5 py-2 text-ink-2">
              <b className="text-ink">Prompt:</b> “{WORDING[wording].text}”
            </li>
            <li className="rounded-lg border border-line bg-surface px-2.5 py-2 text-ink-2">
              <b className="text-ink">Corpus:</b> {CORPUS[corpus].text}
            </li>
            <li className="rounded-lg border border-line bg-surface px-2.5 py-2 text-ink-2">
              <b className="text-ink">Eval set:</b> {EVALSET[evalSet].text} At {Math.round(EVALSET[evalSet].w[2] * 100)}% of cases, a {worstName} failure barely moves the overall number.
            </li>
          </ul>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="rounded-xl border border-line bg-bg/60 p-3">
          <p className="text-xs font-semibold text-muted">Where the gap comes from</p>
          <ul className="mt-2 space-y-1.5 text-xs text-ink-2">
            <li className="rounded-lg border border-line bg-surface px-2.5 py-2">
              <b className="text-ink">Training data.</b> Group C starts {Math.round((1 - MODEL_BIAS[2]) * 100)}% below Group B before your prompt exists. You cannot prompt that away; you measure it and route around it.
            </li>
            <li className="rounded-lg border border-line bg-surface px-2.5 py-2">
              <b className="text-ink">Prompt wording.</b> “Culture fit” and “young, energetic” carry the assumptions of whoever typed them. Naming checkable criteria moves the rate back up.
            </li>
            <li className="rounded-lg border border-line bg-surface px-2.5 py-2">
              <b className="text-ink">Retrieval corpus.</b> Examples and style guides drawn from one group teach the model that group&rsquo;s idea of a good candidate.
            </li>
            <li className="rounded-lg border border-line bg-surface px-2.5 py-2">
              <b className="text-ink">Eval-set imbalance.</b> The nastiest one: too few cases for the group that fails means the headline number never moves. A biased metric is worse than no metric.
            </li>
          </ul>
        </div>

        <div className="rounded-xl border border-line bg-bg/60 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
            <ShieldAlert size={14} aria-hidden /> Mitigations, in the order worth trying
          </p>
          <ul className="mt-2 space-y-1.5">
            {mitigations.map((m, i) => (
              <motion.li
                key={m.t}
                initial={reduce ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduce ? 0 : 0.25, delay: reduce ? 0 : i * 0.05 }}
                className="flex gap-2 rounded-lg border border-line bg-surface px-2.5 py-2"
              >
                <Users size={14} className="mt-0.5 shrink-0" style={{ color: "var(--good)" }} aria-hidden />
                <p className="text-xs">
                  <b className="text-ink">
                    {i + 1}. {m.t}
                  </b>
                  <span className="text-ink-2"> — {m.d}</span>
                </p>
              </motion.li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">
            One reword will not make the disparity disappear. What it does is make the disparity visible enough to bound, gate on, and keep a person in the path of the decisions that still land wrong.
          </p>
        </div>
      </div>
    </div>
  );
}

function Switcher<K extends string>({ label, options, value, onPick }: { label: string; options: Record<K, { label: string }>; value: K; onPick: (k: K) => void }) {
  return (
    <div role="group" aria-label={`Change one variable: ${label}`}>
      <p className="text-xs font-medium text-muted">{label}</p>
      <div className="mt-1 space-y-1">
        {(Object.keys(options) as K[]).map((k) => (
          <Pill key={k} on={value === k} onClick={() => onPick(k)} label={`${label}: ${options[k].label}`}>
            {options[k].label}
          </Pill>
        ))}
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
        "block w-full rounded-lg border px-2.5 py-1.5 text-left text-xs font-medium transition-colors active:scale-[0.98]",
        on ? "border-accent-strong bg-accent-soft text-ink" : "border-line bg-surface text-ink-2 hover:border-line-strong",
      )}
    >
      {children}
    </button>
  );
}
