"use client";

import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useHydratedReducedMotion } from "@/lib/use-reduced-motion";
import clsx from "clsx";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, X } from "lucide-react";

/* ---------------- 1. Route: the escalation decision flow ---------------- */

type Outcome = "now" | "gap" | "ask" | "resolve";
interface Case {
  who: string;
  text: string;
  outcome: Outcome;
  sentiment: number; // -1..1
  selfConf: number; // 1..10, what the model says about itself
  why: string;
  naive: string; // what the naive rule gets wrong (or right) here
}

const CASES: Case[] = [
  { who: "Calm request", text: "Can I just talk to a person, please?", outcome: "now", sentiment: 0.1, selfConf: 9, why: "They asked for a human. Escalate right away: no investigating first, no “one more fix”.", naive: "Wrong: a calm customer asked for a person. Mood and confidence never notice an explicit request." },
  { who: "Polite, but off-policy", text: "BigMart sells it $40 cheaper. Can you match that?", outcome: "gap", sentiment: 0.5, selfConf: 9, why: "Policy only covers price changes on our own site. It says nothing about competitors, so the agent must not invent a rule. Escalate.", naive: "Wrong: the agent feels sure (9/10) precisely because it doesn't know the policy has a gap. Self-rated confidence is worst on the hard cases." },
  { who: "Same name, three accounts", text: "Refund my last order. Name's J. Smith.", outcome: "ask", sentiment: 0, selfConf: 7, why: "The account lookup found three J. Smiths. Don't guess (“most recent”, “first one”). Ask for one more identifier, such as an email or order number.", naive: "Wrong: “handle it” here means guessing which J. Smith to refund. The right move is a question." },
  { who: "Furious, but routine", text: "This is ridiculous, my package is late AGAIN!", outcome: "resolve", sentiment: -0.9, selfConf: 8, why: "Upset is not the same as asking for a person. Acknowledge the frustration and fix the delay. Escalate only if they then ask for a human.", naive: "Wrong: anger is not complexity. This is a routine late delivery the agent can fix." },
  { who: "Routine, with evidence", text: "Mug arrived smashed, photo attached. Replacement please.", outcome: "resolve", sentiment: -0.2, selfConf: 9, why: "A standard damage replacement, clearly covered by policy. The agent resolves it.", naive: "Right, but for the wrong reason: it read the mood, not the policy." },
];

type PK = "start" | "d1" | "d2" | "d3" | "res" | "o1" | "o2" | "o3";
interface Layout { vb: string; dw: number; vertical: boolean; P: Record<PK, [number, number]> }
// Wide layout when the figure is 42rem+ (@2xl); the tall layout keeps text at ~11px+ on phones.
const WIDE: Layout = { vb: "0 0 680 250", dw: 62, vertical: false, P: { start: [46, 62], d1: [168, 62], d2: [328, 62], d3: [488, 62], res: [623, 62], o1: [168, 196], o2: [328, 196], o3: [488, 196] } };
const TALL: Layout = { vb: "0 0 340 548", dw: 56, vertical: true, P: { start: [110, 28], d1: [110, 124], d2: [110, 258], d3: [110, 392], res: [110, 510], o1: [262, 124], o2: [262, 258], o3: [262, 392] } };
const ROUTE: Record<Outcome, PK[]> = {
  now: ["start", "d1", "o1"],
  gap: ["start", "d1", "d2", "o2"],
  ask: ["start", "d1", "d2", "d3", "o3"],
  resolve: ["start", "d1", "d2", "d3", "res"],
};
const EDGES: [PK, PK][] = [["start", "d1"], ["d1", "d2"], ["d2", "d3"], ["d3", "res"], ["d1", "o1"], ["d2", "o2"], ["d3", "o3"]];
const DIAMONDS: { k: PK; l1: string; l2: string; out: string; next: string }[] = [
  { k: "d1", l1: "Asked for", l2: "a human?", out: "yes", next: "no" },
  { k: "d2", l1: "Policy", l2: "covers it?", out: "no", next: "yes" },
  { k: "d3", l1: "One clear", l2: "match?", out: "no", next: "yes" },
];
const OUTS: { k: PK; label: string; sub: string; tone: string; text: string }[] = [
  { k: "o1", label: "Escalate now", sub: "honor the request", tone: "var(--bad)", text: "var(--bg)" },
  { k: "o2", label: "Escalate", sub: "don't invent policy", tone: "var(--accent-strong)", text: "var(--accent-ink)" },
  { k: "o3", label: "Ask a question", sub: "get another ID", tone: "var(--info)", text: "var(--bg)" },
];
const LABEL: Record<Outcome, string> = { now: "Escalate immediately", gap: "Escalate (policy gap)", ask: "Ask a clarifying question", resolve: "Resolve it" };
const naiveEscalates = (c: Case) => c.sentiment <= -0.5 || c.selfConf < 6;
const MONO = { font: "500 13px var(--font-mono)" };

function Flow({ L, path, label, i, reduce, className }: { L: Layout; path: PK[]; label: string; i: number; reduce: boolean; className: string }) {
  const { P, dw } = L;
  const on = (k: PK) => path.includes(k);
  const edgeOn = (a: PK, b: PK) => path.includes(a) && path.indexOf(b) === path.indexOf(a) + 1;
  return (
    <svg viewBox={L.vb} className={clsx("h-auto w-full", className)} role="img" aria-label={label}>
      {EDGES.map(([a, b]) => {
        const lit = edgeOn(a, b);
        return <line key={a + b} x1={P[a][0]} y1={P[a][1]} x2={P[b][0]} y2={P[b][1]} stroke={lit ? "var(--accent-strong)" : "var(--line-strong)"} strokeWidth={lit ? 3 : 1.25} strokeDasharray={lit ? undefined : "4 5"} style={{ transition: "stroke 250ms ease" }} />;
      })}
      <rect x={P.start[0] - 40} y={P.start[1] - 20} width={80} height={40} rx={20} fill="var(--ink)" />
      <text x={P.start[0]} y={P.start[1] + 5} textAnchor="middle" fill="var(--bg)" style={{ font: "600 13px var(--font-display)" }}>Message</text>
      {DIAMONDS.map((d) => {
        const [x, y] = P[d.k];
        const lit = on(d.k);
        const nextAt = L.vertical ? { x: x + 8, y: y + 64, a: "start" as const } : { x: x + dw + 8, y: y - 8, a: "start" as const };
        const outAt = L.vertical ? { x: x + dw + 15, y: y - 6, a: "middle" as const } : { x: x + 8, y: y + 66, a: "start" as const };
        return (
          <g key={d.k}>
            <path d={`M${x} ${y - 44} L${x + dw} ${y} L${x} ${y + 44} L${x - dw} ${y} Z`} fill="var(--surface)" stroke={lit ? "var(--accent-strong)" : "var(--line-strong)"} strokeWidth={lit ? 2.5 : 1.25} />
            <text x={x} y={y - 3} textAnchor="middle" fill="var(--ink)" style={{ font: "600 13px var(--font-display)" }}>{d.l1}</text>
            <text x={x} y={y + 13} textAnchor="middle" fill="var(--ink)" style={{ font: "600 13px var(--font-display)" }}>{d.l2}</text>
            <text x={nextAt.x} y={nextAt.y} textAnchor={nextAt.a} fill="var(--ink-2)" style={MONO}>{d.next}</text>
            <text x={outAt.x} y={outAt.y} textAnchor={outAt.a} fill="var(--ink-2)" style={MONO}>{d.out}</text>
          </g>
        );
      })}
      {OUTS.map((o) => {
        const [x, y] = P[o.k];
        const lit = on(o.k);
        return (
          <g key={o.k}>
            <rect x={x - 66} y={y - 22} width={132} height={48} rx={12} fill={lit ? o.tone : "var(--surface)"} stroke={lit ? o.tone : "var(--line-strong)"} strokeWidth={1.25} style={{ transition: "fill 250ms ease" }} />
            <text x={x} y={y - 1} textAnchor="middle" fill={lit ? o.text : "var(--ink)"} style={{ font: "600 13px var(--font-display)" }}>{o.label}</text>
            <text x={x} y={y + 16} textAnchor="middle" fill={lit ? o.text : "var(--ink-2)"} style={{ font: "400 13px var(--font-sans)" }}>{o.sub}</text>
          </g>
        );
      })}
      <rect x={P.res[0] - 51} y={P.res[1] - 24} width={102} height={48} rx={12} fill={on("res") ? "var(--good)" : "var(--surface)"} stroke={on("res") ? "var(--good)" : "var(--line-strong)"} style={{ transition: "fill 250ms ease" }} />
      <text x={P.res[0]} y={P.res[1] - 2} textAnchor="middle" fill={on("res") ? "var(--bg)" : "var(--ink)"} style={{ font: "600 13px var(--font-display)" }}>Resolve</text>
      <text x={P.res[0]} y={P.res[1] + 14} textAnchor="middle" fill={on("res") ? "var(--bg)" : "var(--ink-2)"} style={{ font: "400 13px var(--font-sans)" }}>agent handles it</text>
      <motion.circle key={i} r={8} fill="var(--accent)" stroke="var(--accent-ink)" strokeWidth={1.5}
        initial={reduce ? false : { cx: P.start[0], cy: P.start[1] }}
        animate={{ cx: path.map((k) => P[k][0]), cy: path.map((k) => P[k][1]) }}
        transition={{ duration: reduce ? 0 : 0.45 * path.length, ease: "easeInOut" }} />
    </svg>
  );
}

function Route({ reduce, onHandoff }: { reduce: boolean; onHandoff: () => void }) {
  const [i, setI] = useState(0);
  const [naive, setNaive] = useState(false);
  const c = CASES[i];
  const path = ROUTE[c.outcome];
  const nE = naiveEscalates(c);
  const naiveRight = nE === (c.outcome === "now" || c.outcome === "gap") && c.outcome !== "ask";
  const go = (d: number) => setI((v) => (v + d + CASES.length) % CASES.length);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      go(e.key === "ArrowRight" ? 1 : -1);
    }
  };
  const imgLabel = `Message: “${c.text}” Route: ${LABEL[c.outcome]}.`;

  return (
    <div className="space-y-3" onKeyDown={onKey}>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Customer messages">
        {CASES.map((x, k) => (
          <button key={x.who} type="button" aria-label={`Message ${k + 1}: ${x.who}`} aria-pressed={k === i} onClick={() => setI(k)}
            className={clsx("rounded-full border px-3 py-1 text-xs font-medium transition-colors", k === i ? "border-ink bg-ink text-bg" : "border-line-strong bg-surface text-ink-2 hover:border-ink")}>
            {x.who}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0 rounded-xl bg-surface-2/50 p-2" tabIndex={0} role="group" aria-label="Escalation decision flow. Left and right arrow keys switch messages.">
          <Flow L={WIDE} path={path} label={imgLabel} i={i} reduce={reduce} className="hidden @2xl:block" />
          <Flow L={TALL} path={path} label={imgLabel} i={i} reduce={reduce} className="mx-auto max-w-[26rem] @2xl:hidden" />
        </div>

        <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-line bg-bg/60 p-3">
          <p className="text-xs font-medium text-muted">Customer says</p>
          <AnimatePresence mode="wait" initial={false}>
            <motion.p key={i} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0 }}
              className="rounded-lg rounded-tl-sm border border-line bg-surface px-3 py-2 text-sm text-ink">
              “{c.text}”
            </motion.p>
          </AnimatePresence>
          <button type="button" aria-pressed={naive} aria-label="Compare with naive triggers: sentiment and self-rated confidence" onClick={() => setNaive((v) => !v)}
            className={clsx("flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors", naive ? "border-bad bg-bad-soft text-ink" : "border-line-strong bg-surface text-ink-2 hover:border-ink")}>
            <span>Try the naive triggers (sentiment, self-confidence)</span>
            <span className={clsx("relative h-4 w-7 shrink-0 rounded-full transition-colors", naive ? "bg-bad" : "bg-line-strong")}>
              <span className={clsx("absolute top-0.5 size-3 rounded-full bg-surface transition-all", naive ? "left-3.5" : "left-0.5")} />
            </span>
          </button>
          {naive ? (
            <div className="space-y-2 text-xs">
              <Meter label="Sentiment" value={(c.sentiment + 1) / 2} text={c.sentiment <= -0.5 ? "very negative" : c.sentiment >= 0.3 ? "positive" : "neutral"} tone={c.sentiment <= -0.5 ? "var(--bad)" : "var(--info)"} reduce={reduce} />
              <Meter label="Agent's own confidence" value={c.selfConf / 10} text={`${c.selfConf}/10`} tone="var(--accent-strong)" reduce={reduce} />
              <p className={clsx("flex gap-1.5 rounded-lg px-2.5 py-2", naiveRight ? "bg-good-soft" : "bg-bad-soft")}>
                {naiveRight ? <Check size={14} className="mt-0.5 shrink-0 text-good" /> : <AlertTriangle size={14} className="mt-0.5 shrink-0 text-bad" />}
                <span className="text-ink">Naive rule says <b>{nE ? "escalate" : "handle it"}</b>. {c.naive}</span>
              </p>
              <p className="text-muted">Exam fix: explicit escalation criteria with few-shot examples in the system prompt. Not a sentiment score, not a separate classifier.</p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-3 @lg:flex-row @lg:items-center @lg:justify-between">
        <p className="min-h-12 text-[0.95rem] text-ink-2" aria-live="polite">
          <span className="mr-2 font-display font-semibold text-ink">{LABEL[c.outcome]}.</span>
          {c.why}
          {c.outcome === "now" || c.outcome === "gap" ? (
            <button type="button" onClick={onHandoff} className="ml-2 font-medium text-accent-text underline underline-offset-2">See the handoff</button>
          ) : null}
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          <Ctrl label="Previous message" onClick={() => go(-1)}><ChevronLeft size={18} /></Ctrl>
          <Ctrl label="Next message" onClick={() => go(1)}><ChevronRight size={18} /></Ctrl>
        </div>
      </div>
      <p className="text-xs text-muted">Three triggers are shown. Two more from the lesson: the agent can&apos;t make progress, or the action is costly or hard to undo.</p>
    </div>
  );
}

function Meter({ label, value, text, tone, reduce }: { label: string; value: number; text: string; tone: string; reduce: boolean }) {
  return (
    <div>
      <div className="flex justify-between text-muted"><span>{label}</span><span className="font-mono text-ink">{text}</span></div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
        <motion.div className="h-full rounded-full" style={{ background: tone }} initial={false} animate={{ width: `${Math.round(value * 100)}%` }} transition={{ duration: reduce ? 0 : 0.4 }} />
      </div>
    </div>
  );
}

/* ---------------- 2. Calibrate: threshold vs review load vs errors ---------------- */

const SEGS = [
  { name: "Standard invoices", n: 140, k: 0.22, off: 0 },
  { name: "Credit notes", n: 40, k: 0.35, off: 0 },
  { name: "Handwritten receipts", n: 20, k: 1.5, off: 0.05 },
];
interface Item { si: number; conf: number; err: number; bad: boolean; rank: number }
// Fixed sample data (seeded, no Math.random) so server and browser render the same thing.
const ITEMS: Item[] = (() => {
  const out: Item[] = [];
  let seed = 42;
  SEGS.forEach((g, si) => {
    let acc = 0.5;
    for (let i = 0; i < g.n; i++) {
      const q = 1 - (i + 0.5) / g.n;
      const conf = Math.round((0.5 + 0.49 * (1 - q * q * q)) * 100) / 100;
      const err = Math.min(0.6, (1 - conf) * g.k + g.off);
      acc += err;
      const bad = acc >= 1;
      if (bad) acc -= 1;
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      out.push({ si, conf, err, bad, rank: seed });
    }
  });
  return out.sort((a, b) => a.conf - b.conf || a.si - b.si);
})();
const CAPACITY = 0.45;
const TARGET = 0.02;
const SAMPLE_N = 9;
function stats(t: number) {
  const auto = ITEMS.filter((x) => x.conf >= t);
  const err = (xs: Item[]) => (xs.length ? xs.reduce((s, x) => s + x.err, 0) / xs.length : 0);
  return { load: 1 - auto.length / ITEMS.length, error: err(auto), seg: SEGS.map((_, si) => err(auto.filter((x) => x.si === si))), auto };
}
const XS = Array.from({ length: 49 }, (_, k) => 0.5 + k * 0.01);
const CURVES = XS.map((t) => ({ t, ...stats(t) }));
const cx = (t: number) => 40 + ((t - 0.5) / 0.48) * 560;
const cyL = (v: number) => 150 - v * 130; // load 0..1
const cyE = (v: number) => 150 - (v / 0.06) * 130; // error 0..6%
const pct = (v: number, d = 0) => `${(v * 100).toFixed(d)}%`;

function Calibrate({ reduce }: { reduce: boolean }) {
  const [t, setT] = useState(0.8);
  const [strat, setStrat] = useState(true);
  const s = useMemo(() => stats(t), [t]);
  const okLoad = s.load <= CAPACITY;
  const okErr = s.error <= TARGET;
  const sample = useMemo(() => {
    const byRank = [...s.auto].sort((a, b) => a.rank - b.rank); // one fixed shuffle
    if (!strat) return new Set(byRank.slice(0, SAMPLE_N));
    return new Set(SEGS.flatMap((_, si) => byRank.filter((x) => x.si === si).slice(0, SAMPLE_N / SEGS.length)));
  }, [s.auto, strat]);
  const sampledHand = [...sample].filter((x) => x.si === 2).length;
  const explain = !okLoad
    ? `At ${t.toFixed(2)}, ${pct(s.load)} of cases go to people. That's more than the team can review, so reviews turn into rubber stamps.`
    : !okErr
      ? `At ${t.toFixed(2)}, too much is automated: about ${pct(s.error, 1)} of auto-approved answers are wrong, above the ${pct(TARGET)} target.`
      : `At ${t.toFixed(2)}, both goals are met: ${pct(s.load)} goes to people and about ${pct(s.error, 1)} of automated answers are wrong. But look at handwritten receipts.`;
  const lPath = CURVES.map((p, k) => `${k ? "L" : "M"}${cx(p.t)} ${cyL(p.load)}`).join(" ");
  const ePath = CURVES.map((p, k) => `${k ? "L" : "M"}${cx(p.t)} ${cyE(p.error)}`).join(" ");
  const band = CURVES.filter((p) => p.load <= CAPACITY && p.error <= TARGET);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-3 rounded-xl bg-surface-2/50 p-3">
          <svg viewBox="0 0 640 160" className="h-auto w-full" role="img" aria-label={`Threshold ${t.toFixed(2)}: ${pct(s.load)} of cases sent to people, ${pct(s.error, 1)} of automated answers wrong.`}>
            {band.length ? <rect x={cx(band[0].t)} y={18} width={cx(band[band.length - 1].t) - cx(band[0].t)} height={132} fill="var(--good-soft)" /> : null}
            <line x1={40} y1={150} x2={600} y2={150} stroke="var(--line-strong)" />
            {[0.5, 0.62, 0.74, 0.86, 0.98].map((v) => <line key={v} x1={cx(v)} y1={150} x2={cx(v)} y2={156} stroke="var(--line-strong)" />)}
            <line x1={40} y1={cyL(CAPACITY)} x2={600} y2={cyL(CAPACITY)} stroke="var(--info)" strokeDasharray="3 5" opacity={0.7} />
            <line x1={40} y1={cyE(TARGET)} x2={600} y2={cyE(TARGET)} stroke="var(--bad)" strokeDasharray="3 5" opacity={0.7} />
            <path d={lPath} fill="none" stroke="var(--info)" strokeWidth={2.5} />
            <path d={ePath} fill="none" stroke="var(--bad)" strokeWidth={2.5} />
            <motion.g initial={false} animate={{ x: cx(t) - 40 }} transition={{ duration: reduce ? 0 : 0.2 }}>
              <line x1={40} y1={14} x2={40} y2={150} stroke="var(--ink)" strokeWidth={1.5} />
              <circle cx={40} cy={cyL(s.load)} r={5} fill="var(--info)" stroke="var(--surface)" strokeWidth={2} />
              <circle cx={40} cy={cyE(s.error)} r={5} fill="var(--bad)" stroke="var(--surface)" strokeWidth={2} />
            </motion.g>
          </svg>
          <div className="-mt-2 flex justify-between font-mono text-[11px] text-muted" style={{ marginLeft: "6.25%", marginRight: "6.25%" }} aria-hidden>
            {["0.50", "0.62", "0.74", "0.86", "0.98"].map((v) => <span key={v} className="w-0 -translate-x-1/2 whitespace-nowrap">{v}</span>)}
          </div>
          <div className="flex flex-wrap items-center gap-3 px-1 text-xs">
            <label htmlFor="hitl-t" className="font-medium text-ink">Confidence threshold</label>
            <input id="hitl-t" type="range" min={0.5} max={0.98} step={0.01} value={t} onChange={(e) => setT(Number(e.target.value))}
              aria-valuetext={`${t.toFixed(2)}: ${pct(s.load)} sent to people, ${pct(s.error, 1)} of automated answers wrong`} className="min-w-40 flex-1 accent-accent-strong" />
            <span className="font-mono text-sm font-semibold text-ink tabular">{t.toFixed(2)}</span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-ink-2">
            <span><span className="mr-1 inline-block h-0.5 w-4 bg-info align-middle" />Sent to people</span>
            <span><span className="mr-1 inline-block h-0.5 w-4 bg-bad align-middle" />Errors slipping through</span>
            <span><span className="mr-1 inline-block w-4 border-t-2 border-dashed border-info align-middle" />Team capacity {pct(CAPACITY)}</span>
            <span><span className="mr-1 inline-block w-4 border-t-2 border-dashed border-bad align-middle" />Error target {pct(TARGET)}</span>
            <span><span className="mr-1 inline-block size-2.5 rounded-sm bg-good-soft align-middle" />Workable range</span>
          </div>
        </div>

        <div className="min-w-0 space-y-3 rounded-xl border border-line bg-bg/60 p-3 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Sent to people" value={pct(s.load)} ok={okLoad} />
            <Stat label="Wrong auto-answers" value={pct(s.error, 1)} ok={okErr} />
          </div>
          <div>
            <p className="mb-1.5 font-medium text-muted">Error rate per segment (auto-approved only)</p>
            {SEGS.map((g, si) => (
              <div key={g.name} className="mb-1 flex items-center gap-2">
                <span className="w-32 shrink-0 text-ink-2">{g.name}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                  <motion.span className="block h-full rounded-full" style={{ background: s.seg[si] > TARGET ? "var(--bad)" : "var(--good)" }} initial={false} animate={{ width: `${Math.min(100, (s.seg[si] / 0.15) * 100)}%` }} transition={{ duration: reduce ? 0 : 0.25 }} />
                </span>
                <span className="w-10 text-right font-mono text-ink tabular">{pct(s.seg[si], 1)}</span>
              </div>
            ))}
            <p className="mt-1 text-ink-2">The overall number hides the weak segment: handwritten receipts never get under 2% at any threshold, so keep them in full human review.</p>
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="font-medium text-muted">Audit sample of auto-approved ({SAMPLE_N} items)</p>
              <div className="flex rounded-lg border border-line-strong p-0.5" role="group" aria-label="Sampling method">
                {[["Random", false], ["Stratified", true]].map(([l, v]) => (
                  <button key={String(l)} type="button" aria-pressed={strat === v} onClick={() => setStrat(v as boolean)}
                    className={clsx("rounded-md px-2 py-0.5 font-medium", strat === v ? "bg-ink text-bg" : "text-ink-2")}>{l}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-[repeat(25,minmax(0,1fr))] gap-[3px]" aria-hidden>
              {ITEMS.map((x, k) => {
                const human = x.conf < t;
                const picked = sample.has(x);
                return (
                  <span key={k} title={`${SEGS[x.si].name}, confidence ${x.conf.toFixed(2)}`}
                    className={clsx("aspect-square", x.si === 2 ? "rounded-[2px]" : "rounded-full", picked && "ring-2 ring-accent-strong")}
                    style={{ background: human ? "var(--info)" : x.bad ? "var(--bad)" : "var(--line-strong)", opacity: human || picked ? 1 : 0.55, transition: "background 150ms" }} />
                );
              })}
            </div>
            <p className="mt-1.5 text-ink-2">
              <span className="text-info">Blue</span> = sent to people, <span className="text-bad">red</span> = hidden error, squares = handwritten, ringed = audited.{" "}
              {strat
                ? "Stratified (a fixed number from every segment): rare handwritten receipts get audited too, so their error rate is measured."
                : sampledHand === 0
                  ? "Plain random: this draw audited no handwritten receipts at all, so their errors go unmeasured."
                  : `Plain random: this draw happened to include ${sampledHand} handwritten receipt${sampledHand > 1 ? "s" : ""}, too few to measure their error rate, and another draw could catch none.`}
            </p>
          </div>
        </div>
      </div>
      <p className="min-h-12 text-[0.95rem] text-ink-2" aria-live="polite">
        <span className="mr-2 font-display font-semibold text-ink">Pick the threshold from labeled data.</span>
        {explain}
      </p>
    </div>
  );
}

function Stat({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className={clsx("rounded-lg border px-2.5 py-2", ok ? "border-good/40 bg-good-soft" : "border-bad/40 bg-bad-soft")}>
      <p className="text-muted">{label}</p>
      <p className="flex items-center gap-1 font-display text-lg font-semibold text-ink tabular">
        {value}{ok ? <Check size={14} className="text-good" /> : <X size={14} className="text-bad" />}
        <span className="sr-only">{ok ? "meets the goal" : "misses the goal"}</span>
      </p>
    </div>
  );
}

/* ---------------- 3. Handoff: what the human receives ---------------- */

// Mirrors the escalate_to_human payload in the lesson. "key" marks the four exam essentials.
const FIELDS: { k: string; v: string; key?: boolean; why: string }[] = [
  { k: "customer_id", v: '"C-48213"', key: true, why: "An ID from a tool, not a typed name. The human finds the right account in one step." },
  { k: "order_ids", v: '["O-99102"]', why: "Points straight at the order in question." },
  { k: "issue_summary", v: '"Duplicate charge for one order"', why: "One line on what the customer wants, so the human knows the topic before reading on." },
  { k: "root_cause", v: '"Payment retried after gateway timeout; both captures succeeded"', key: true, why: "The diagnosis is done. The human doesn't start over." },
  { k: "evidence", v: '["capture tx_1 at 10:02", "capture tx_2 at 10:03"]', why: "The proof behind the diagnosis, so the human can trust it without re-checking." },
  { k: "amount_in_question", v: "189.00", key: true, why: "The exact amount, so nothing gets lost to rounding or vague wording." },
  { k: "actions_taken", v: '["Verified identity", "Confirmed duplicate capture"]', why: "Stops the human repeating work the agent already did." },
  { k: "why_escalated", v: '"Account is flagged for a chargeback; policy requires human approval"', why: "Tells the human which decision is theirs to make." },
  { k: "recommended_action", v: '"Refund tx_2 in full; remove chargeback flag"', key: true, why: "A concrete next step the human can approve or change." },
];
const CAN = ["Find the customer", "Know what went wrong", "Know the amount", "Act without re-asking"];

function Handoff({ reduce }: { reduce: boolean }) {
  const [strong, setStrong] = useState(true);
  const [hover, setHover] = useState<number | null>(null);
  const explain = strong
    ? hover !== null ? `${FIELDS[hover].k}: ${FIELDS[hover].why}` : "The human never saw the chat. This summary works on its own, so they can act in seconds. Hover or tap a field to see why it's there."
    : "The human never saw the chat. With “please help”, they must re-identify the customer and re-diagnose everything, and the customer repeats their story.";
  return (
    <div className="space-y-3">
      <div className="flex rounded-lg border border-line-strong p-0.5 text-xs @lg:w-fit" role="group" aria-label="Handoff quality">
        {[["Weak handoff", false], ["Structured handoff", true]].map(([l, v]) => (
          <button key={String(l)} type="button" aria-pressed={strong === v} onClick={() => setStrong(v as boolean)}
            className={clsx("flex-1 rounded-md px-3 py-1 font-medium transition-colors", strong === v ? "bg-ink text-bg" : "text-ink-2")}>{l}</button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="rounded-xl bg-surface-2/50 p-3">
          <p className="mb-2 font-mono text-xs font-semibold text-accent-text">escalate_to_human(…)</p>
          <AnimatePresence mode="wait" initial={false}>
            {strong ? (
              <motion.ul key="s" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={reduce ? undefined : { opacity: 0 }} className="space-y-1 font-mono text-xs">
                {FIELDS.map((f, k) => (
                  <motion.li key={f.k} initial={reduce ? false : { opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: reduce ? 0 : k * 0.05 }}>
                    <button type="button" onMouseEnter={() => setHover(k)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(k)} onBlur={() => setHover(null)}
                      onClick={() => setHover((h) => (h === k ? null : k))} aria-label={`${f.k}: ${f.why}`}
                      className={clsx("flex w-full flex-wrap items-baseline gap-x-2 rounded-md border px-2 py-1 text-left transition-colors", hover === k ? "border-accent-strong bg-accent-soft" : "border-transparent hover:bg-surface")}>
                      <span className="text-info">{f.k}</span>
                      <span className="min-w-0 flex-1 break-words text-ink">{f.v}</span>
                      {f.key ? <span className="rounded bg-ink px-1 text-[10px] text-bg">essential</span> : null}
                    </button>
                  </motion.li>
                ))}
              </motion.ul>
            ) : (
              <motion.p key="w" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={reduce ? undefined : { opacity: 0 }}
                className="rounded-md border border-dashed border-line-strong px-3 py-6 text-center font-mono text-sm text-ink-2">
                &quot;Customer is upset about a refund, please help.&quot;
              </motion.p>
            )}
          </AnimatePresence>
        </div>
        <div className="rounded-xl border border-line bg-bg/60 p-3 text-xs">
          <p className="mb-2 font-medium text-muted">Can the human agent…</p>
          <ul className="space-y-1.5">
            {CAN.map((c, k) => (
              <li key={c} className="flex items-center gap-2 text-sm text-ink">
                <motion.span initial={reduce ? false : { scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} key={`${c}${strong}`} transition={{ delay: reduce ? 0 : k * 0.08 }}
                  className={clsx("grid size-5 place-items-center rounded-full", strong ? "bg-good text-bg" : "bg-bad-soft text-bad")}>
                  {strong ? <Check size={12} /> : <X size={12} />}<span className="sr-only">{strong ? "yes" : "no"}</span>
                </motion.span>
                {c}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-muted">The four exam essentials are tagged: customer ID, root cause, amount, recommended action.</p>
        </div>
      </div>
      <p className="min-h-12 text-[0.95rem] text-ink-2" aria-live="polite">{explain}</p>
    </div>
  );
}

/* ---------------- Shell ---------------- */

const TABS = [
  { id: "route", label: "1 · Should it escalate?" },
  { id: "calibrate", label: "2 · Calibrate review" },
  { id: "handoff", label: "3 · Hand off" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export default function EscalationHitl() {
  const reduce = !!useHydratedReducedMotion();
  const [tab, setTab] = useState<Tab>("route");
  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const n = TABS.findIndex((x) => x.id === tab);
    const next = TABS[(n + (e.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length];
    setTab(next.id);
    e.currentTarget.querySelector<HTMLElement>(`#hitl-tab-${next.id}`)?.focus();
  };
  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface-2/50 p-1" role="tablist" aria-label="Escalation views" onKeyDown={onTabKey}>
        {TABS.map((x) => (
          <button key={x.id} id={`hitl-tab-${x.id}`} type="button" role="tab" aria-selected={tab === x.id} aria-controls="hitl-panel" tabIndex={tab === x.id ? 0 : -1} onClick={() => setTab(x.id)}
            className={clsx("relative shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors", tab === x.id ? "text-ink" : "text-muted hover:text-ink")}>
            {tab === x.id ? <motion.span layoutId="hitl-tab" className="absolute inset-0 rounded-lg bg-surface shadow-card" transition={{ duration: reduce ? 0 : 0.25 }} /> : null}
            <span className="relative">{x.label}</span>
          </button>
        ))}
      </div>
      <div id="hitl-panel" role="tabpanel" aria-labelledby={`hitl-tab-${tab}`}>
        {tab === "route" ? <Route reduce={reduce} onHandoff={() => setTab("handoff")} /> : tab === "calibrate" ? <Calibrate reduce={reduce} /> : <Handoff reduce={reduce} />}
      </div>
    </div>
  );
}

function Ctrl({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      className="grid size-9 place-items-center rounded-xl border border-line-strong bg-surface text-ink transition-colors hover:border-ink active:scale-95">
      {children}
    </button>
  );
}
