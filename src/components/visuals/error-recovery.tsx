"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import clsx from "clsx";

/* ---------------- Part 1: one subagent fails, four ways to report it ---------------- */

type Strategy = "swallow" | "crash" | "generic" | "structured";
type SubId = "web" | "news" | "reg";
type Rect = { x: number; y: number; w: number; h: number };
type Pt = { x: number; y: number };

/** Geometry for one orientation. The wide layout is used from `sm` up, the tall one on phones. */
interface Layout {
  vb: string;
  coord: Rect;
  report: Rect;
  subs: Record<SubId, Rect>;
  arc: [Pt, Pt, Pt, Pt]; // cubic bezier, coordinator -> final report
  arcLabel: Pt & { anchor: "middle" | "start" };
  abort: Pt & { anchor: "middle" | "start" };
  chips: Pt;
  chipsLabel: Pt;
  font: { label: number; sub: number };
}

const WIDE: Layout = {
  vb: "0 0 620 310",
  coord: { x: 16, y: 148, w: 130, h: 54 },
  report: { x: 474, y: 148, w: 130, h: 54 },
  subs: { web: { x: 232, y: 60, w: 160, h: 50 }, news: { x: 232, y: 150, w: 160, h: 50 }, reg: { x: 232, y: 240, w: 160, h: 50 } },
  arc: [{ x: 81, y: 148 }, { x: 81, y: 0 }, { x: 539, y: 0 }, { x: 539, y: 148 }],
  arcLabel: { x: 310, y: 30, anchor: "middle" },
  abort: { x: 81, y: 232, anchor: "middle" },
  chips: { x: 404, y: 272 },
  chipsLabel: { x: 404, y: 302 },
  font: { label: 14, sub: 11.5 },
};

const TALL: Layout = {
  vb: "0 0 340 330",
  coord: { x: 8, y: 22, w: 132, h: 52 },
  report: { x: 8, y: 258, w: 132, h: 52 },
  subs: { web: { x: 194, y: 12, w: 134, h: 48 }, news: { x: 194, y: 102, w: 134, h: 48 }, reg: { x: 194, y: 192, w: 134, h: 48 } },
  arc: [{ x: 74, y: 74 }, { x: 74, y: 135 }, { x: 74, y: 197 }, { x: 74, y: 258 }],
  arcLabel: { x: 82, y: 170, anchor: "start" },
  abort: { x: 74, y: 326, anchor: "middle" },
  chips: { x: 194, y: 250 },
  chipsLabel: { x: 194, y: 283 },
  font: { label: 15, sub: 12.5 },
};

const SUB_IDS: SubId[] = ["web", "news", "reg"];
const SUB_TEXT: Record<SubId, { label: string; sub: string }> = {
  web: { label: "Web search", sub: "4 results" },
  news: { label: "News index", sub: "2 results" },
  reg: { label: "Regulator DB", sub: "times out" },
};
const edgeOf = (L: Layout, id: SubId) => {
  const s = L.subs[id];
  return { x1: L.coord.x + L.coord.w, y1: L.coord.y + L.coord.h / 2, x2: s.x, y2: s.y + s.h / 2 };
};
const arcPath = ([a, b, c, d]: Layout["arc"]) => `M ${a.x} ${a.y} C ${b.x} ${b.y}, ${c.x} ${c.y}, ${d.x} ${d.y}`;
/** Plain polynomial sampling of the cubic, so the packet needs no CSS motion-path support. */
const arcPoints = ([a, b, c, d]: Layout["arc"], n = 24) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n, u = 1 - t;
    const f = (p0: number, p1: number, p2: number, p3: number) => Math.round((u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3) * 10) / 10;
    return { x: f(a.x, b.x, c.x, d.x), y: f(a.y, b.y, c.y, d.y) };
  });
const ARC_PTS = { wide: arcPoints(WIDE.arc), tall: arcPoints(TALL.arc) };

const STRATEGIES: Record<Strategy, { label: string; verdict: string; good: boolean; payload: string; report: string[]; captions: [string, string, string] }> = {
  swallow: {
    label: "Silent swallow",
    verdict: "Anti-pattern: a failure disguised as “nothing exists”",
    good: false,
    payload: `{ "status": "success",\n  "results": [] }`,
    report: ["EV battery costs fell sharply [3 sources]", "No regulatory actions on record."],
    captions: [
      "The Regulator subagent catches the timeout and returns an empty list marked success. It looks exactly like “I searched and found nothing”.",
      "The coordinator believes the regulator has no filings. It has no reason to retry, because nothing looks wrong.",
      "The report confidently says there are no regulatory actions. That is a wrong answer, not a gap, and nobody can see it.",
    ],
  },
  crash: {
    label: "Crash pipeline",
    verdict: "Anti-pattern: one failed branch throws away all the good work",
    good: false,
    payload: `Unhandled TimeoutError\n→ top-level handler\n→ workflow terminated`,
    report: [],
    captions: [
      "The subagent lets the exception escape. A top-level handler catches it and ends the whole workflow.",
      "The six good results from Web search and News index are discarded. The coordinator never gets to decide anything.",
      "No report at all. One slow source cost the user every finding the other agents already had.",
    ],
  },
  generic: {
    label: "Generic status",
    verdict: "Hides context: the coordinator can only guess",
    good: false,
    payload: `{ "status": "error",\n  "message": "search unavailable" }`,
    report: ["EV battery costs fell sharply [3 sources]", "Regulatory outlook: unavailable."],
    captions: [
      "The subagent retries quietly, gives up, and reports just “search unavailable”. What it tried and its partial results are thrown away.",
      "The coordinator can't tell a timeout (retry later) from an auth failure (don't bother) or a bad query (rephrase). Every choice is a guess.",
      "The report has a hole with no explanation. The reader can't tell why, or how much of the rest to trust.",
    ],
  },
  structured: {
    label: "Structured error",
    verdict: "Correct: the coordinator has what it needs to decide",
    good: true,
    payload: `{ "status": "error",\n  "error": {\n    "type": "timeout",\n    "retryable": true,\n    "attempted": "recalls site:gov 'Model X' 2024..2026",\n    "tried": "3 retries, backoff 1s→2s→4s",\n    "partial_results": [ 3 excerpts ],\n    "alternatives": ["query regulator API directly",\n                     "narrow to 2025-2026"] } }`,
    report: ["EV battery costs fell sharply [3 sources] — well supported", "Coverage gap: Regulator DB timed out after retries; EU outlook rests on 1 secondary source — provisional."],
    captions: [
      "The subagent first recovers locally: it retries with growing waits. Still failing, it reports the failure type, the query, what it tried, 3 partial results and alternatives.",
      "The coordinator can now choose: retry via the regulator API, narrow the date range, or keep the partial results and flag the gap.",
      "The report keeps every good finding and openly marks what is provisional. The reader knows exactly how far to trust each part.",
    ],
  },
};
const STRATEGY_IDS = Object.keys(STRATEGIES) as Strategy[];

const SHARED_CAPTIONS = [
  "The coordinator splits a research task across three subagents, each searching a different source.",
  "Two subagents come back with results. The Regulator DB call times out after 10 seconds.",
];

/* ---------------- Part 2: classify the error before reacting ---------------- */

type Category = "transient" | "validation" | "business" | "permission" | "empty";

const CAT_STYLE: Record<Category, { label: string; color: string; soft: string }> = {
  transient: { label: "Transient", color: "var(--info)", soft: "var(--info-soft)" },
  validation: { label: "Validation", color: "var(--accent-text)", soft: "var(--accent-soft)" },
  business: { label: "Business rule", color: "var(--bad)", soft: "var(--bad-soft)" },
  permission: { label: "Permission", color: "var(--bad)", soft: "var(--bad-soft)" },
  empty: { label: "Not an error", color: "var(--good)", soft: "var(--good-soft)" },
};

interface ErrCase {
  id: string;
  label: string;
  kind: "mcp" | "api"; // MCP tool result vs Claude API HTTP error
  cat: Category;
  retry: boolean;
  isError: boolean;
  waits?: number[];
  payload: string;
  action: string;
  plain: string;
  note?: string;
}

const ERRORS: ErrCase[] = [
  {
    id: "timeout", label: "Tool timed out after 10s", kind: "mcp", cat: "transient", retry: true, isError: true, waits: [1, 2, 4],
    payload: `"isError": true\n{ "errorCategory": "transient", "isRetryable": true,\n  "message": "Inventory service timed out after 10s.\n   Retrying in a few seconds is likely to succeed." }`,
    action: "Retry locally with exponential backoff, then try an alternative source. If it still fails, propagate a structured error with what you tried.",
    plain: "The service was slow for a moment. Waiting a little and trying again will probably work.",
    note: "Wrong: returning results: [] marked success. The agent would conclude there is nothing to find.",
  },
  {
    id: "429", label: "429 rate_limit_error", kind: "api", cat: "transient", retry: true, isError: true, waits: [30],
    payload: `HTTP 429 rate_limit_error\nretry-after: 30`,
    action: "Your org, key or project hit its limit. Honour retry-after, back off, and reduce concurrency (fewer parallel subagents).",
    plain: "You are sending too much too fast. Slow down and try again after the wait the server asks for.",
    note: "Exception: a spend-limit or exhausted-credits 429 has no retry-after and won't clear by waiting. Claude Code fails at once on those instead of retrying.",
  },
  {
    id: "529", label: "529 overloaded_error", kind: "api", cat: "transient", retry: true, isError: true, waits: [2, 4, 8],
    payload: `HTTP 529 overloaded_error`,
    action: "The API is at capacity across all users. Back off and retry, check status.claude.com, or switch model.",
    plain: "It's not you: the service is busy for everyone. Wait and try again.",
    note: "429 is about your limit; 529 is everyone's. Both are transient, but only a 429 is something you can fix on your side.",
  },
  {
    id: "validation", label: "Order ID “4821” (needs ORD-)", kind: "mcp", cat: "validation", retry: false, isError: true,
    payload: `"isError": true\n{ "errorCategory": "validation", "isRetryable": false,\n  "message": "order_id must look like ORD-NNNN;\n   ask the user for the full ID." }`,
    action: "Fix the input or ask the user for the right value. The same call fails the same way.",
    plain: "The request itself was wrong. Repeating it unchanged can never work.",
  },
  {
    id: "business", label: "Refund $640 > $500 limit", kind: "mcp", cat: "business", retry: false, isError: true,
    payload: `"isError": true\n{ "errorCategory": "business", "isRetryable": false,\n  "message": "Refund of $640 exceeds the $500 self-service limit.",\n  "customerMessage": "Refunds above $500 need a quick\n   review by our billing team. I can open that request now." }`,
    action: "Explain the rule using customerMessage; escalate if appropriate. Never retry a policy block.",
    plain: "A policy said no. The agent should explain it kindly and offer the next step, not keep pushing.",
  },
  {
    id: "permission", label: "Access denied: HR records", kind: "mcp", cat: "permission", retry: false, isError: true,
    payload: `"isError": true\n{ "errorCategory": "permission", "isRetryable": false,\n  "message": "Caller lacks access to hr/records." }`,
    action: "Stop, report, or escalate to someone with access. Retrying needs new rights, not time.",
    plain: "The agent isn't allowed in. Only a person with the right access can fix that.",
  },
  {
    id: "empty", label: "Search ran, 0 matches", kind: "mcp", cat: "empty", retry: false, isError: false,
    payload: `"isError": false\n{ "status": "ok", "results": [],\n  "note": "query completed; zero matches" }`,
    action: "Report “no matches” as a real answer. Retrying won't change it.",
    plain: "The search worked and there really is nothing. That is an answer, not a failure.",
    note: "Empty list = “I looked and found nothing”. Error = “I could not look”. Never let the second pretend to be the first.",
  },
];

/* ---------------- Component ---------------- */

export default function ErrorRecovery() {
  const [mode, setMode] = useState<"run" | "classify">("run");
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="View" className="inline-flex rounded-xl border border-line bg-surface-2/60 p-1">
        {([["run", "Multi-agent failure"], ["classify", "Classify the error"]] as const).map(([id, label]) => (
          <button key={id} role="tab" type="button" aria-selected={mode === id} aria-label={label} onClick={() => setMode(id)}
            className={clsx("relative rounded-lg px-3 py-1.5 text-sm font-medium transition-colors", mode === id ? "text-ink" : "text-muted hover:text-ink")}>
            {mode === id ? <motion.span layoutId="er-tab" className="absolute inset-0 rounded-lg bg-surface shadow-card" transition={{ duration: 0.25 }} /> : null}
            <span className="relative">{label}</span>
          </button>
        ))}
      </div>
      {mode === "run" ? <PipelineView /> : <ClassifyView />}
    </div>
  );
}

/** Arrow-key roving inside a radiogroup: moves selection and focus, and keeps the event from stepping the diagram. */
function rove(e: KeyboardEvent<HTMLDivElement>, count: number, index: number, go: (i: number) => void) {
  const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
  if (!d) return;
  e.preventDefault();
  e.stopPropagation();
  const n = (index + d + count) % count;
  go(n);
  e.currentTarget.querySelectorAll<HTMLButtonElement>("button")[n]?.focus();
}

function PipelineView() {
  const reduce = !!useReducedMotion();
  const [strategy, setStrategy] = useState<Strategy>("swallow");
  const [phase, setPhase] = useState(0);
  const last = 4;
  const s = STRATEGIES[strategy];
  const caption = phase < 2 ? SHARED_CAPTIONS[phase] : s.captions[phase - 2];
  const crashed = strategy === "crash" && phase >= 2;

  const next = () => setPhase((p) => Math.min(last, p + 1));
  const back = () => setPhase((p) => Math.max(0, p - 1));
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") { e.preventDefault(); next(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); back(); }
  };
  const pick = (id: Strategy) => { setStrategy(id); setPhase((p) => (p < 2 ? 2 : p)); };
  const diagram = { phase, strategy, reduce, crashed, label: `Step ${phase + 1} of ${last + 1}, ${s.label}: ${caption}` };

  return (
    <div className="space-y-4" onKeyDown={onKey}>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="How the failing subagent reports" onKeyDown={(e) => rove(e, STRATEGY_IDS.length, STRATEGY_IDS.indexOf(strategy), (i) => pick(STRATEGY_IDS[i]))}>
        {STRATEGY_IDS.map((id) => (
          <button key={id} type="button" role="radio" aria-checked={strategy === id} tabIndex={strategy === id ? 0 : -1} aria-label={`Strategy: ${STRATEGIES[id].label}`} onClick={() => pick(id)}
            className={clsx("rounded-full border px-3 py-1 text-sm transition-colors active:scale-95", strategy === id ? "border-ink bg-ink text-bg" : "border-line-strong bg-surface text-ink-2 hover:border-ink")}>
            <span className="mr-1.5 inline-block size-2 rounded-full align-middle" style={{ background: STRATEGIES[id].good ? "var(--good)" : "var(--bad)" }} />
            {STRATEGIES[id].label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="rounded-xl bg-surface-2/50 p-2" tabIndex={0} role="group" aria-label="Multi-agent run diagram. Use left and right arrow keys to step.">
          <Diagram L={WIDE} pts={ARC_PTS.wide} className="hidden sm:block" {...diagram} />
          <Diagram L={TALL} pts={ARC_PTS.tall} className="sm:hidden" {...diagram} />
        </div>

        <div className="flex min-h-56 flex-col gap-3 rounded-xl border border-line bg-bg/60 p-3">
          <div>
            <p className="px-1 text-xs font-medium text-muted">What the coordinator receives from Regulator DB</p>
            <AnimatePresence mode="wait" initial={false}>
              <motion.pre key={phase < 2 ? "none" : strategy} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.2 }}
                className="mt-1.5 overflow-x-auto rounded-lg border border-line bg-surface px-2.5 py-2 font-mono text-xs leading-relaxed whitespace-pre text-ink">
                {phase < 2 ? (phase === 0 ? "…waiting" : "TimeoutError after 10s (inside the subagent)") : s.payload}
              </motion.pre>
            </AnimatePresence>
          </div>
          {phase >= 2 ? (
            <p className="rounded-lg px-2.5 py-1.5 text-xs font-medium" style={{ background: s.good ? "var(--good-soft)" : "var(--bad-soft)", color: s.good ? "var(--good)" : "var(--bad)" }}>{s.verdict}</p>
          ) : null}
          {phase === 4 ? (
            <motion.div initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border border-line bg-surface px-2.5 py-2">
              <p className="text-xs font-semibold text-muted">Final report</p>
              {s.report.length ? (
                <ul className="mt-1 space-y-1 text-xs text-ink">
                  {s.report.map((r) => <li key={r} className={clsx(r.startsWith("Coverage") && "text-accent-text")}>• {r}</li>)}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-bad">Nothing. 6 good results were discarded.</p>
              )}
            </motion.div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="min-h-12 text-[0.95rem] text-ink-2" aria-live="polite">
          <span className="mr-2 font-display font-semibold text-ink tabular">{phase + 1}/{last + 1}</span>
          {caption}
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          <CtrlButton label="Previous step" onClick={back} disabled={phase === 0}><ChevronLeft size={18} /></CtrlButton>
          <CtrlButton label="Next step" onClick={next} disabled={phase === last}><ChevronRight size={18} /></CtrlButton>
          <CtrlButton label="Reset" onClick={() => setPhase(0)}><RotateCcw size={16} /></CtrlButton>
        </div>
      </div>
    </div>
  );
}

function Diagram({ L, pts, className, phase, strategy, reduce, crashed, label }: { L: Layout; pts: Pt[]; className: string; phase: number; strategy: Strategy; reduce: boolean; crashed: boolean; label: string }) {
  const dur = reduce ? 0 : 0.75;
  const ease = [0.22, 1, 0.36, 1] as const;
  const s = STRATEGIES[strategy];
  const synth = phase === 4 && !crashed;
  const regReturnColor = strategy === "swallow" ? "var(--good)" : strategy === "structured" ? "var(--info)" : strategy === "generic" ? "var(--muted)" : "var(--bad)";
  const reportTone = phase < 4 ? "idle" : crashed ? "dead" : s.good ? "good" : "bad";
  const end = pts[pts.length - 1];

  return (
    <svg viewBox={L.vb} className={clsx("h-auto w-full", className)} role="img" aria-label={label}>
      <path d={arcPath(L.arc)} fill="none" stroke={synth ? "var(--accent-strong)" : "var(--line-strong)"} strokeWidth={synth ? 2.5 : 1.25} strokeDasharray={crashed ? "4 6" : undefined} style={{ transition: "stroke 200ms ease" }} />
      <text x={L.arcLabel.x} y={L.arcLabel.y} textAnchor={L.arcLabel.anchor} fill="var(--muted)" style={{ font: `500 ${L.font.sub}px var(--font-mono)` }}>synthesis</text>

      {SUB_IDS.map((id) => {
        const failing = id === "reg" && phase >= 1;
        return <line key={id} {...edgeOf(L, id)} stroke={failing ? "var(--bad)" : "var(--line-strong)"} strokeWidth={failing ? 2 : 1.25} strokeDasharray={failing ? "5 5" : undefined} />;
      })}

      <Box r={L.coord} font={L.font} label="Coordinator" sub={crashed ? "terminated" : phase === 3 ? "deciding…" : "plans & routes"} dark stroke={crashed ? "var(--bad)" : phase === 3 ? "var(--accent-strong)" : undefined} />

      {SUB_IDS.map((id) => {
        const r = L.subs[id];
        const failed = id === "reg" && phase >= 1;
        return (
          <motion.g key={id} animate={{ opacity: crashed && id !== "reg" ? 0.35 : 1 }} transition={{ duration: dur }}>
            <Box r={r} font={L.font} label={SUB_TEXT[id].label} sub={phase >= 1 ? SUB_TEXT[id].sub : "searching…"} stroke={failed ? "var(--bad)" : phase >= 1 ? "var(--good)" : undefined} />
            {failed ? (
              <motion.g initial={reduce ? false : { scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: dur, ease }} style={{ transformOrigin: `${r.x + r.w}px ${r.y}px` }}>
                <circle cx={r.x + r.w} cy={r.y} r={10} fill="var(--bad)" />
                <path d={`M ${r.x + r.w - 4} ${r.y - 4} l 8 8 M ${r.x + r.w + 4} ${r.y - 4} l -8 8`} stroke="var(--surface)" strokeWidth={2} />
              </motion.g>
            ) : null}
          </motion.g>
        );
      })}

      {strategy === "structured" && phase === 2 ? (
        <>
          {["1s", "2s", "4s"].map((t, i) => (
            <motion.g key={t} initial={reduce ? false : { opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: reduce ? 0 : 0.25 * i, duration: dur }}>
              <rect x={L.chips.x + i * 23} y={L.chips.y} width={21} height={17} rx={5} fill="var(--info-soft)" stroke="var(--info)" />
              <text x={L.chips.x + 10.5 + i * 23} y={L.chips.y + 12.5} textAnchor="middle" fill="var(--info)" style={{ font: "600 10px var(--font-mono)" }}>{t}</text>
            </motion.g>
          ))}
          <text x={L.chipsLabel.x} y={L.chipsLabel.y} fill="var(--muted)" style={{ font: `500 ${L.font.sub - 1}px var(--font-mono)` }}>local retries</text>
        </>
      ) : null}

      <Box r={L.report} font={L.font} label="Final report"
        sub={reportTone === "idle" ? "waiting" : reportTone === "dead" ? "never written" : reportTone === "good" ? "gaps flagged" : strategy === "swallow" ? "confidently wrong" : "unexplained hole"}
        stroke={reportTone === "good" ? "var(--good)" : reportTone === "idle" ? undefined : "var(--bad)"} />

      {crashed ? (
        <motion.text x={L.abort.x} y={L.abort.y} textAnchor={L.abort.anchor} fill="var(--bad)" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} style={{ font: `700 ${L.font.sub}px var(--font-mono)` }}>
          WORKFLOW ABORTED
        </motion.text>
      ) : null}

      {/* Travelling packets */}
      {phase === 0 && SUB_IDS.map((id) => <Packet key={`${strategy}-0-${id}`} {...edgeOf(L, id)} color="var(--accent)" reduce={reduce} />)}
      {phase === 1 && (["web", "news"] as SubId[]).map((id) => { const e = edgeOf(L, id); return <Packet key={`${strategy}-1-${id}`} x1={e.x2} y1={e.y2} x2={e.x1} y2={e.y1} color="var(--good)" reduce={reduce} />; })}
      {phase === 2 && (() => { const e = edgeOf(L, "reg"); return <Packet key={`${strategy}-2`} x1={e.x2} y1={e.y2} x2={e.x1} y2={e.y1} color={regReturnColor} reduce={reduce} delay={strategy === "structured" ? 0.8 : 0} />; })()}
      {synth ? (
        <motion.circle key={`${strategy}-4`} r={7} fill="var(--accent)" stroke="var(--accent-ink)" strokeWidth={1.5}
          initial={reduce ? { cx: end.x, cy: end.y } : { cx: pts[0].x, cy: pts[0].y }}
          animate={reduce ? { cx: end.x, cy: end.y } : { cx: pts.map((p) => p.x), cy: pts.map((p) => p.y) }}
          transition={{ duration: reduce ? 0 : 1.1, ease: "easeInOut" }} />
      ) : null}
    </svg>
  );
}

function ClassifyView() {
  const reduce = useReducedMotion();
  const [sel, setSel] = useState("timeout");
  const idx = Math.max(0, ERRORS.findIndex((x) => x.id === sel));
  const e = ERRORS[idx];
  const c = CAT_STYLE[e.cat];
  const waits = e.waits ?? [];
  const totalWait = waits.reduce((a, b) => a + b, 0) || 1;
  const flagA = e.kind === "api" ? `HTTP ${e.id}` : `isError: ${e.isError}`;
  const flagB = e.kind === "api" ? "retry: yes, with backoff" : e.cat === "empty" ? "retry: not needed" : `isRetryable: ${e.retry}`;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
      <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Pick a failure to classify" onKeyDown={(ev) => rove(ev, ERRORS.length, idx, (i) => setSel(ERRORS[i].id))}>
        {ERRORS.map((x) => (
          <button key={x.id} type="button" role="radio" aria-checked={sel === x.id} tabIndex={sel === x.id ? 0 : -1} aria-label={x.label} onClick={() => setSel(x.id)}
            className={clsx("flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition-colors active:scale-[0.98]",
              sel === x.id ? "border-ink bg-surface text-ink" : "border-line bg-surface/60 text-ink-2 hover:border-line-strong")}>
            <span className="font-mono text-xs">{x.label}</span>
            <span className="size-2 shrink-0 rounded-full" style={{ background: CAT_STYLE[x.cat].color }} />
          </button>
        ))}
      </div>

      {/* Stable live region: the animated card below is re-mounted on change, so announce from here. */}
      <p className="sr-only" aria-live="polite">{`${e.label}. ${c.label}. ${e.plain}`}</p>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={e.id} initial={reduce ? false : { opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: reduce ? 0 : 0.22 }}
          className="flex flex-col gap-3 rounded-xl border border-line bg-bg/60 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: c.soft, color: c.color }}>{c.label}</span>
            <span className="rounded-full border border-line-strong px-2.5 py-0.5 font-mono text-xs text-muted">{flagA}</span>
            <span className={clsx("rounded-full border px-2.5 py-0.5 font-mono text-xs", e.retry ? "border-info text-info" : "border-line-strong text-muted")}>{flagB}</span>
          </div>
          <p className="text-[0.95rem] text-ink">{e.plain}</p>
          <div>
            <p className="px-1 text-xs font-medium text-muted">{e.kind === "api" ? "What the API returns" : "What the tool returns (MCP result)"}</p>
            <pre className="mt-1.5 overflow-x-auto rounded-lg border border-line bg-surface px-2.5 py-2 font-mono text-xs leading-relaxed whitespace-pre text-ink">{e.payload}</pre>
          </div>

          {waits.length ? (
            <div>
              <p className="text-xs font-medium text-muted">{e.id === "429" ? "Wait what retry-after says, then retry" : "Retry with exponential backoff"}</p>
              <div className="mt-1.5 flex h-8 items-stretch gap-1">
                {waits.map((w, i) => {
                  const lastTry = i === waits.length - 1;
                  return (
                    <div key={i} className="flex items-stretch gap-1" style={{ flex: w / totalWait + 0.25 }}>
                      <motion.div className="rounded-md bg-info-soft" style={{ flex: 1, transformOrigin: "left" }} initial={reduce ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: reduce ? 0 : 0.35 * i, duration: reduce ? 0 : 0.35 }}>
                        <span className="block px-1.5 py-1.5 font-mono text-xs text-info">wait {w}s</span>
                      </motion.div>
                      <motion.span className="grid w-7 place-items-center rounded-md text-xs font-bold text-surface" style={{ background: lastTry ? "var(--good)" : "var(--bad)" }} aria-label={lastTry ? "retry succeeds" : "retry fails"}
                        initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: reduce ? 0 : 0.35 * i + 0.3 }}>
                        {lastTry ? "✓" : "✕"}
                      </motion.span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : e.cat !== "empty" ? (
            <p className="rounded-lg bg-surface-2 px-2.5 py-1.5 font-mono text-xs text-muted"><span className="line-through">retry</span> → same input, same failure</p>
          ) : null}

          <p className="text-sm text-ink-2"><span className="font-semibold text-ink">Agent should: </span>{e.action}</p>
          {e.note ? <p className="border-l-2 border-accent pl-2 text-xs text-accent-text">{e.note}</p> : null}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function Box({ r, font, label, sub, dark, stroke }: { r: Rect; font: Layout["font"]; label: string; sub: string; dark?: boolean; stroke?: string }) {
  return (
    <g>
      <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={14} fill={dark ? "var(--ink)" : "var(--surface)"} stroke={stroke ?? "var(--line-strong)"} strokeWidth={stroke ? 2.5 : 1.25} style={{ transition: "stroke 200ms ease" }} />
      <text x={r.x + r.w / 2} y={r.y + r.h / 2 - 2} textAnchor="middle" fill={dark ? "var(--bg)" : "var(--ink)"} style={{ font: `600 ${font.label}px var(--font-display)` }}>{label}</text>
      {/* On the dark box, --bg (not --accent) keeps contrast in both themes: in dark mode --ink is light. */}
      <text x={r.x + r.w / 2} y={r.y + r.h / 2 + 14} textAnchor="middle" fill={dark ? "var(--bg)" : "var(--muted)"} fillOpacity={dark ? 0.8 : 1} style={{ font: `400 ${font.sub}px var(--font-sans)` }}>{sub}</text>
    </g>
  );
}

function Packet({ x1, y1, x2, y2, color, reduce, delay = 0 }: { x1: number; y1: number; x2: number; y2: number; color: string; reduce: boolean; delay?: number }) {
  return (
    <motion.circle r={6.5} fill={color} stroke="var(--surface)" strokeWidth={1.5}
      initial={reduce ? { cx: x2, cy: y2 } : { cx: x1, cy: y1, opacity: 0 }} animate={{ cx: x2, cy: y2, opacity: 1 }}
      transition={{ duration: reduce ? 0 : 0.8, delay: reduce ? 0 : delay, ease: [0.22, 1, 0.36, 1] }} />
  );
}

function CtrlButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label}
      className="grid size-9 place-items-center rounded-xl border border-line-strong bg-surface text-ink transition-colors hover:border-ink active:scale-95 disabled:opacity-40">
      {children}
    </button>
  );
}
