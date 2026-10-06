"use client";

import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useHydratedReducedMotion } from "@/lib/use-reduced-motion";
import clsx from "clsx";
import { Check, ChevronLeft, ChevronRight, Pause, Play, RotateCcw, Sparkles, X } from "lucide-react";

/* ───────────── Part 1: three ways to ask for JSON ───────────── */

type ModeId = "prompt" | "tool" | "schema";

const MODES: Record<ModeId, { label: string; short: string; request: string; reply: string; caption: string; note: string }> = {
  prompt: {
    label: "Ask nicely",
    short: "prompt only",
    request: 'system: "Reply ONLY with JSON:\n  {vendor, total, po_number}"',
    reply: "text reply, hopefully JSON:",
    caption: "Asking for JSON in plain words works most of the time. Now and then the reply has a chatty sentence first, a trailing comma or a cut-off brace, and your parser crashes.",
    note: "“Most of the time” is not good enough when a pipeline runs thousands of documents.",
  },
  tool: {
    label: "Forced tool",
    short: "tool_use + tool_choice",
    request: 'tools: [{\n  name: "extract_invoice",\n  input_schema: {...}, // the shape\n  strict: true\n}]\ntool_choice: {\n  type: "tool",\n  name: "extract_invoice"\n}',
    reply: "tool_use block → input (never executed, just read):",
    caption: "You define a tool whose input_schema is the form you want, and force Claude to call it. The reply is always a tool_use block, so there is no JSON syntax error and no preamble. You never run the tool; you just read its input.",
    note: "tool_choice auto may still answer in text; any forces some tool; a named tool forces that one. strict: true guarantees the input matches the schema exactly. The newest models return 400 for any and forced tool: there, use auto + strict: true, or structured outputs.",
  },
  schema: {
    label: "Structured outputs",
    short: "output_config.format",
    request: 'output_config: {\n  format: {\n    type: "json_schema",\n    schema: {...}  // the shape\n  }\n}',
    reply: "text reply, constrained to the schema:",
    caption: "Structured outputs constrain generation itself: a token that would break the schema can't be produced, so every reply parses and matches the schema. (The older output_format parameter is deprecated.)",
    note: "Two edge cases: stop_reason \"refusal\" or \"max_tokens\" can still leave the reply short of the schema, so check stop_reason. Can't be combined with citations.",
  },
};

const GOOD = '{"vendor": "Acme Ltd", "total": 1250, "po_number": null}';
const BAD = [
  { raw: 'Sure! Here is the JSON:\n{"vendor": "Acme Ltd", ...}', why: "Chatty sentence before the brace" },
  { raw: '{"vendor": "Bolt Co", "total": 980,}', why: "Trailing comma" },
  { raw: '```json\n{"vendor": "Cirrus", "total": 4', why: "Cut off mid-object" },
];
const DOCS = 12;
/** Which documents fail in "ask nicely" mode; shifts per run so it feels random but is identical on server and client. */
const failingFor = (run: number) => [(3 + run * 5) % DOCS, (8 + run * 3) % DOCS, (10 + run * 7) % DOCS];

/* ───────────── Part 2: validate-and-retry loop ───────────── */

type ScenarioId = "fixable" | "absent";
type EdgeId = "d2e" | "e2v" | "v2s" | "v2h" | "retry";
type NodeId = "doc" | "ext" | "val" | "store" | "human";
type Item = { d: string; a: number };

const STATED = 1250;
const SCENARIOS: Record<ScenarioId, { label: string; blurb: string; attempts: Item[][] }> = {
  fixable: {
    label: "Model slipped",
    blurb: "All three line items are in the document; Claude skipped one.",
    attempts: [
      [{ d: "Design", a: 600 }, { d: "Hosting", a: 550 }],
      [{ d: "Design", a: 600 }, { d: "Hosting", a: 550 }, { d: "Support", a: 100 }],
    ],
  },
  absent: {
    label: "Page missing",
    blurb: "Page 2 (with the last line item) was never attached. The answer isn't in the source.",
    attempts: [
      [{ d: "Design", a: 600 }, { d: "Hosting", a: 550 }],
      [{ d: "Design", a: 600 }, { d: "Hosting", a: 550 }, { d: "Misc", a: 40 }],
      [{ d: "Design", a: 600 }, { d: "Hosting", a: 550 }, { d: "Fees", a: 75 }],
      [{ d: "Design", a: 600 }, { d: "Hosting", a: 550 }, { d: "Other", a: 20 }],
    ],
  },
};

interface LoopStep {
  kind: "extract" | "validate" | "retry" | "store" | "escalate";
  attempt: number;
  edge: EdgeId;
  caption: string;
}

const sum = (items: Item[]) => items.reduce((t, i) => t + i.a, 0);

function buildSteps(sc: ScenarioId, maxRetries: number): LoopStep[] {
  const { attempts } = SCENARIOS[sc];
  const out: LoopStep[] = [];
  for (let k = 0; k <= maxRetries; k++) {
    const items = attempts[Math.min(k, attempts.length - 1)];
    const ok = sum(items) === STATED;
    out.push({
      kind: "extract",
      attempt: k,
      edge: "d2e",
      caption:
        k === 0
          ? "Claude reads the invoice and fills in the schema. The JSON is guaranteed to be well-formed and the right shape."
          : sc === "fixable"
            ? "Claude re-reads the document with the exact error in hand, and finds the line item it skipped."
            : "Claude tries again, but the missing line item isn't anywhere in what it was given. So it guesses a new one.",
    });
    out.push({
      kind: "validate",
      attempt: k,
      edge: "e2v",
      caption: ok
        ? `Your code checks the business rule: line items add up to ${STATED}, the stated total. Valid shape and it makes sense.`
        : `The schema check passes, but your business rule fails: line items add up to ${sum(items)}, not the stated ${STATED}. Valid shape, wrong meaning.`,
    });
    if (ok) {
      out.push({ kind: "store", attempt: k, edge: "v2s", caption: "It passes. The record is stored. One specific piece of feedback was enough." });
      return out;
    }
    if (k < maxRetries) {
      out.push({
        kind: "retry",
        attempt: k,
        edge: "retry",
        caption: `Not a blind “try again”: you send back the document, the failed JSON and the exact error (“items sum to ${sum(items)}, stated_total is ${STATED}”).`,
      });
    }
  }
  out.push({
    kind: "escalate",
    attempt: maxRetries,
    edge: "v2h",
    caption:
      sc === "absent"
        ? "Retry limit reached. Retrying can't recover information that isn't in the source; each try was a fresh guess. Flag it and send it to a human."
        : "Retry limit reached with the error still there. Stop looping and send it to a human instead.",
  });
  return out;
}

const NODE_TEXT: Record<NodeId, { label: string; sub: string }> = {
  doc: { label: "Invoice", sub: "source doc" },
  ext: { label: "Extract", sub: "Claude + schema" },
  val: { label: "Validate", sub: "your code" },
  store: { label: "Store", sub: "passed" },
  human: { label: "Human review", sub: "escalated" },
};
const EDGE_NODES: Record<EdgeId, NodeId[]> = { d2e: ["doc", "ext"], e2v: ["ext", "val"], v2s: ["val", "store"], v2h: ["val", "human"], retry: ["val", "ext"] };

type Box = { x: number; y: number; w: number; h: number };
interface Layout {
  viewBox: string;
  font: { label: number; sub: number };
  nodes: Record<NodeId, Box>;
  edges: Record<EdgeId, string>;
  /** Position of attempt pip i of n. */
  pip: (i: number, n: number) => { cx: number; cy: number };
  label: { x: number; y: number; rotate: number };
}

/** Wide (≥ sm) and tall (phone) arrangements of the same diagram, so text stays legible at 375px. */
const LAYOUTS: Record<"wide" | "tall", Layout> = {
  wide: {
    viewBox: "0 0 600 236",
    font: { label: 15, sub: 12 },
    nodes: {
      doc: { x: 8, y: 90, w: 96, h: 60 },
      ext: { x: 136, y: 90, w: 128, h: 60 },
      val: { x: 296, y: 90, w: 128, h: 60 },
      store: { x: 464, y: 20, w: 128, h: 54 },
      human: { x: 464, y: 166, w: 128, h: 54 },
    },
    edges: {
      d2e: "M 106 120 L 132 120",
      e2v: "M 266 120 L 292 120",
      v2s: "M 426 106 C 446 94, 448 52, 462 47",
      v2h: "M 426 134 C 446 146, 448 188, 462 193",
      retry: "M 360 154 C 360 226, 200 226, 200 156",
    },
    pip: (i, n) => ({ cx: 200 - (n - 1) * 7 + i * 14, cy: 76 }),
    label: { x: 280, y: 224, rotate: 0 },
  },
  tall: {
    viewBox: "0 0 310 384",
    font: { label: 16, sub: 13 },
    nodes: {
      doc: { x: 100, y: 10, w: 100, h: 52 },
      ext: { x: 84, y: 104, w: 132, h: 56 },
      val: { x: 84, y: 204, w: 132, h: 56 },
      store: { x: 6, y: 316, w: 136, h: 54 },
      human: { x: 158, y: 316, w: 146, h: 54 },
    },
    edges: {
      d2e: "M 150 66 L 150 100",
      e2v: "M 150 164 L 150 200",
      v2s: "M 120 264 C 120 292, 74 284, 74 312",
      v2h: "M 180 264 C 180 292, 231 284, 231 312",
      retry: "M 220 232 C 278 232, 278 132, 220 132",
    },
    pip: (i, n) => ({ cx: 70, cy: 132 - (n - 1) * 7 + i * 14 }),
    label: { x: 282, y: 182, rotate: 90 },
  },
};

/* ───────────── Component ───────────── */

export default function StructuredOutput() {
  const reduce = useHydratedReducedMotion();
  const [part, setPart] = useState<"shape" | "meaning">("shape");
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Structured output topics" className="inline-flex rounded-xl border border-line bg-surface-2/60 p-1">
        {(
          [
            ["shape", "1 · Get the shape"],
            ["meaning", "2 · Check the meaning"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={part === id}
            aria-label={label}
            onClick={() => setPart(id)}
            className={clsx("relative rounded-lg px-3 py-1.5 text-sm font-medium transition-colors", part === id ? "text-ink" : "text-muted hover:text-ink")}
          >
            {part === id ? <motion.span layoutId="so-tab" transition={{ duration: reduce ? 0 : 0.25, ease: [0.22, 1, 0.36, 1] }} className="absolute inset-0 rounded-lg bg-surface shadow-sm" /> : null}
            <span className="relative">{label}</span>
          </button>
        ))}
      </div>
      {part === "shape" ? <ShapePart onNext={() => setPart("meaning")} /> : <MeaningPart />}
    </div>
  );
}

function ShapePart({ onNext }: { onNext: () => void }) {
  const reduce = useHydratedReducedMotion();
  const [mode, setMode] = useState<ModeId>("prompt");
  const [run, setRun] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const m = MODES[mode];
  const fails = mode === "prompt" ? failingFor(run) : [];
  const parsed = DOCS - fails.length;
  const pickedFail = picked !== null ? fails.indexOf(picked) : -1;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2 @lg:grid-cols-3" role="radiogroup" aria-label="How you ask for JSON">
        {(Object.keys(MODES) as ModeId[]).map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={mode === id}
            aria-label={`${MODES[id].label}: ${MODES[id].short}`}
            onClick={() => {
              setMode(id);
              setPicked(null);
              setRun((r) => r + 1);
            }}
            className={clsx("rounded-xl border px-3 py-2.5 text-left transition-colors", mode === id ? "border-accent-strong bg-accent-soft/50" : "border-line bg-surface hover:border-line-strong")}
          >
            <span className="block font-display text-[0.95rem] font-semibold text-ink">{MODES[id].label}</span>
            <span className="block font-mono text-xs text-muted">{MODES[id].short}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="rounded-xl bg-surface-2/50 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted">12 invoices through the pipeline</p>
            <button
              type="button"
              aria-label="Run the 12 invoices again"
              onClick={() => {
                setRun((r) => r + 1);
                setPicked(null);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-2.5 py-1 text-xs font-medium text-ink hover:border-ink active:scale-95"
            >
              <Sparkles size={13} /> Run again
            </button>
          </div>
          <div className="mt-3 grid grid-cols-6 gap-2" role="group" aria-label={`${parsed} of ${DOCS} replies parsed`}>
            {Array.from({ length: DOCS }, (_, i) => {
              const bad = fails.includes(i);
              return (
                <motion.button
                  key={`${run}-${i}`}
                  type="button"
                  aria-label={`Invoice ${i + 1}: ${bad ? "malformed JSON" : "parsed"}. Show raw reply.`}
                  onClick={() => setPicked(i)}
                  onMouseEnter={() => setPicked(i)}
                  onFocus={() => setPicked(i)}
                  initial={reduce ? false : { opacity: 0, scale: 0.6, y: 6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ delay: reduce ? 0 : i * 0.05, type: "spring", stiffness: 420, damping: 26 }}
                  className={clsx(
                    "grid aspect-square place-items-center rounded-lg border transition-shadow",
                    bad ? "border-bad bg-bad-soft text-bad" : "border-good/50 bg-good-soft text-good",
                    picked === i && "ring-2 ring-accent-strong ring-offset-1 ring-offset-surface",
                  )}
                >
                  {bad ? <X size={16} /> : <Check size={16} />}
                </motion.button>
              );
            })}
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <motion.span key={`${mode}-${parsed}`} initial={reduce ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="font-display text-2xl font-semibold text-ink tabular">
              {parsed}/{DOCS}
            </motion.span>
            <span className="text-sm text-muted">replies your code could parse</span>
          </div>
          <pre className="mt-2 min-h-16 overflow-x-auto rounded-lg border border-line bg-bg/70 p-2.5 font-mono text-xs leading-relaxed whitespace-pre-wrap text-ink" aria-live="polite">
            {picked === null ? (
              "Hover or tap a square to see the raw reply."
            ) : pickedFail >= 0 ? (
              <>
                {BAD[pickedFail].raw}
                {"\n\n"}
                <span className="text-bad">✗ {BAD[pickedFail].why}. Parser crashes.</span>
              </>
            ) : (
              <>
                <span className="text-muted">{m.reply}</span>
                {"\n"}
                {GOOD}
              </>
            )}
          </pre>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-line bg-bg/60 p-3">
          <p className="text-xs font-medium text-muted">Request</p>
          <AnimatePresence mode="wait" initial={false}>
            <motion.pre
              key={mode}
              initial={reduce ? false : { opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, x: -8 }}
              transition={{ duration: reduce ? 0 : 0.2 }}
              className="overflow-x-auto rounded-lg border border-line bg-surface p-2.5 font-mono text-xs leading-relaxed whitespace-pre text-ink"
            >
              {m.request}
            </motion.pre>
          </AnimatePresence>
          <p className="text-xs leading-relaxed text-ink-2">{m.note}</p>
        </div>
      </div>

      <p className="min-h-12 text-[0.95rem] text-ink-2" aria-live="polite">
        {m.caption}
      </p>
      <div className="flex flex-col gap-2 rounded-xl border border-dashed border-line-strong px-3 py-2.5 @lg:flex-row @lg:items-center @lg:justify-between">
        <p className="text-sm text-ink-2">
          <span className="font-semibold text-ink">But:</span> a perfect shape can still hold a wrong total. Schemas guarantee syntax, not truth.
        </p>
        <button type="button" onClick={onNext} aria-label="Go to part 2, check the meaning" className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-accent-text hover:underline">
          Check the meaning <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

function MeaningPart() {
  const reduce = useHydratedReducedMotion();
  const [scenario, setScenario] = useState<ScenarioId>("fixable");
  const [maxRetries, setMaxRetries] = useState(2);
  const [nullable, setNullable] = useState(true);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const steps = useMemo(() => buildSteps(scenario, maxRetries), [scenario, maxRetries]);
  const last = steps.length - 1;
  const cur = steps[Math.min(step, last)];
  const items = SCENARIOS[scenario].attempts[Math.min(cur.attempt, SCENARIOS[scenario].attempts.length - 1)];
  const total = sum(items);
  const validated = cur.kind !== "extract";

  useEffect(() => {
    if (!playing) return;
    if (step >= last) {
      const t = setTimeout(() => setPlaying(false), 0);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setStep((s) => Math.min(last, s + 1)), 2300);
    return () => clearTimeout(t);
  }, [playing, step, last]);

  const restart = () => {
    setPlaying(false);
    setStep(0);
  };
  const next = () => setStep((s) => Math.min(last, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));
  const onKey = (e: KeyboardEvent) => {
    // Leave arrow keys alone inside the slider; it needs them.
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      next();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      back();
    }
  };
  const svgLabel = `Step ${step + 1} of ${steps.length}, attempt ${cur.attempt + 1}: ${cur.caption}`;
  const diagram = { cur, step, maxRetries, scenario, reduce: !!reduce, label: svgLabel };

  return (
    <div className="space-y-4" onKeyDown={onKey}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="inline-flex rounded-xl border border-line bg-surface-2/60 p-1" role="radiogroup" aria-label="Scenario">
          {(Object.keys(SCENARIOS) as ScenarioId[]).map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={scenario === id}
              aria-label={`Scenario: ${SCENARIOS[id].label}`}
              onClick={() => {
                setScenario(id);
                restart();
              }}
              className={clsx("rounded-lg px-3 py-1.5 text-sm font-medium transition-colors", scenario === id ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink")}
            >
              {SCENARIOS[id].label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-2">
          Max retries
          <input
            type="range"
            min={0}
            max={3}
            value={maxRetries}
            aria-label="Maximum retries before escalating"
            onChange={(e) => {
              setMaxRetries(Number(e.target.value));
              restart();
            }}
            className="w-24 accent-[var(--accent-strong)]"
          />
          <span className="w-3 font-display font-semibold text-ink tabular">{maxRetries}</span>
        </label>
        <button type="button" role="switch" aria-checked={nullable} aria-label="Make po_number nullable" onClick={() => setNullable((n) => !n)} className="flex items-center gap-2 text-sm text-ink-2">
          <span className={clsx("relative h-5 w-9 rounded-full transition-colors", nullable ? "bg-good" : "bg-line-strong")}>
            <motion.span layout={!reduce} className={clsx("absolute top-0.5 size-4 rounded-full bg-surface shadow", nullable ? "right-0.5" : "left-0.5")} />
          </span>
          <span className="font-mono text-xs">po_number nullable</span>
        </button>
      </div>
      <p className="text-xs text-muted">{SCENARIOS[scenario].blurb} The invoice has no PO number printed on it at all.</p>

      <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="rounded-xl bg-surface-2/50 p-2" tabIndex={0} role="group" aria-label="Validation loop diagram. Use left and right arrow keys to step.">
          <Diagram id="w" layout={LAYOUTS.wide} className="hidden @lg:block" {...diagram} />
          <Diagram id="t" layout={LAYOUTS.tall} className="@lg:hidden" {...diagram} />
        </div>

        <div className="flex min-h-56 flex-col gap-2 rounded-xl border border-line bg-bg/60 p-3">
          <p className="text-xs font-medium text-muted">Attempt {cur.attempt + 1} · extracted JSON</p>
          <pre className="overflow-x-auto rounded-lg border border-line bg-surface p-2.5 font-mono text-xs leading-relaxed text-ink">
            {"{\n"}
            {"  \"line_items\": [\n"}
            {items.map((it, i) => (
              <motion.span
                key={`${cur.attempt}-${i}`}
                initial={reduce || i < 2 ? false : { backgroundColor: "var(--accent-soft)" }}
                animate={{ backgroundColor: "rgba(0,0,0,0)" }}
                transition={{ duration: 1.2 }}
                className="block rounded"
              >
                {`    {"description": "${it.d}",\n     "amount": ${it.a}}${i < items.length - 1 ? "," : ""}`}
              </motion.span>
            ))}
            {"  ],\n"}
            {`  "stated_total": ${STATED},\n`}
            <span className={clsx("block rounded", nullable ? "text-good" : "bg-bad-soft text-bad")}>{`  "po_number": ${nullable ? "null" : '"PO-2024-0117"'}`}</span>
            {"}"}
          </pre>
          <ul className="space-y-1 text-xs" aria-label="Checks">
            <Check2 ok label="Schema: valid JSON, right fields and types" />
            <Check2 ok={!validated ? null : total === STATED} label={`Your rule: line items sum ${validated ? total : "…"} = stated ${STATED}`} />
            <Check2 ok={nullable} label={nullable ? "po_number is null: honest “looked, not found”" : "po_number invented: passes the schema, and no check can tell"} />
          </ul>
        </div>
      </div>

      <div className="flex flex-col gap-3 @lg:flex-row @lg:items-center @lg:justify-between">
        <p className="min-h-12 text-[0.95rem] text-ink-2" aria-live="polite">
          <span className="mr-2 font-display font-semibold text-ink tabular">
            {step + 1}/{steps.length}
          </span>
          {cur.caption}
          {!nullable && step === 0 ? " Look at po_number: the field was required and not nullable, so Claude made one up." : ""}
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          <Ctrl label="Previous step" onClick={back} disabled={step === 0}>
            <ChevronLeft size={18} />
          </Ctrl>
          <Ctrl
            label={playing ? "Pause" : "Play"}
            onClick={() => {
              if (step >= last) setStep(0);
              setPlaying((p) => !p);
            }}
          >
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </Ctrl>
          <Ctrl label="Next step" onClick={next} disabled={step === last}>
            <ChevronRight size={18} />
          </Ctrl>
          <Ctrl label="Reset" onClick={restart}>
            <RotateCcw size={16} />
          </Ctrl>
        </div>
      </div>
    </div>
  );
}

function Diagram({
  id,
  layout: L,
  className,
  cur,
  step,
  maxRetries,
  scenario,
  reduce,
  label,
}: {
  id: string;
  layout: Layout;
  className: string;
  cur: LoopStep;
  step: number;
  maxRetries: number;
  scenario: ScenarioId;
  reduce: boolean;
  label: string;
}) {
  const active = new Set<NodeId>(EDGE_NODES[cur.edge]);
  const path = L.edges[cur.edge];
  // Under reduced motion the dot cannot travel along the path, so park it on the node the
  // current edge is heading for. Hiding it instead would lose the position indicator.
  const dest = L.nodes[EDGE_NODES[cur.edge][1]];
  return (
    <svg viewBox={L.viewBox} className={clsx("h-auto w-full", className)} role="img" aria-label={label}>
      <defs>
        <marker id={`so-${id}-arrow`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="var(--line-strong)" />
        </marker>
        <marker id={`so-${id}-arrow-on`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="var(--accent-strong)" />
        </marker>
      </defs>
      {(Object.keys(L.edges) as EdgeId[]).map((e) => {
        const on = e === cur.edge;
        return (
          <path
            key={e}
            d={L.edges[e]}
            fill="none"
            stroke={on ? "var(--accent-strong)" : "var(--line-strong)"}
            strokeWidth={on ? 2.5 : 1.25}
            strokeDasharray={e === "retry" && !on ? "4 5" : undefined}
            markerEnd={on ? `url(#so-${id}-arrow-on)` : `url(#so-${id}-arrow)`}
            style={{ transition: "stroke 200ms ease" }}
          />
        );
      })}
      <text
        x={L.label.x}
        y={L.label.y}
        transform={L.label.rotate ? `rotate(${L.label.rotate} ${L.label.x} ${L.label.y})` : undefined}
        textAnchor="middle"
        fill={cur.edge === "retry" ? "var(--accent-text)" : "var(--muted)"}
        style={{ font: "500 12px var(--font-mono)" }}
      >
        retry + specific error
      </text>
      {(Object.keys(L.nodes) as NodeId[]).map((n) => {
        const b = L.nodes[n];
        const on = active.has(n);
        const dark = n === "ext";
        const tone = n === "store" ? "var(--good)" : n === "human" ? "var(--bad)" : "var(--accent-strong)";
        return (
          <g key={n}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={14} fill={dark ? "var(--ink)" : "var(--surface)"} stroke={on ? tone : "var(--line-strong)"} strokeWidth={on ? 2.5 : 1.25} style={{ transition: "stroke 200ms ease" }} />
            <text x={b.x + b.w / 2} y={b.y + b.h / 2 - 3} textAnchor="middle" fill={dark ? "var(--bg)" : "var(--ink)"} style={{ font: `600 ${L.font.label}px var(--font-display)` }}>
              {NODE_TEXT[n].label}
            </text>
            <text x={b.x + b.w / 2} y={b.y + b.h / 2 + 15} textAnchor="middle" fill={dark ? "var(--line)" : "var(--muted)"} style={{ font: `400 ${L.font.sub}px var(--font-sans)` }}>
              {NODE_TEXT[n].sub}
            </text>
          </g>
        );
      })}
      {/* attempt pips beside Extract */}
      {Array.from({ length: maxRetries + 1 }, (_, i) => {
        const p = L.pip(i, maxRetries + 1);
        return <circle key={i} cx={p.cx} cy={p.cy} r={4.5} fill={i <= cur.attempt ? "var(--accent-strong)" : "var(--surface)"} stroke="var(--line-strong)" strokeWidth={1} />;
      })}
      {reduce ? (
        <circle cx={dest.x + dest.w / 2} cy={dest.y + dest.h / 2} r={7} fill="var(--accent)" stroke="var(--accent-ink)" strokeWidth={1.5} />
      ) : (
        <motion.circle
          key={`${scenario}-${maxRetries}-${step}`}
          r={7}
          fill="var(--accent)"
          stroke="var(--accent-ink)"
          strokeWidth={1.5}
          style={{ offsetPath: `path("${path}")` }}
          initial={{ offsetDistance: "0%", opacity: 0 }}
          animate={{ offsetDistance: "100%", opacity: 1 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
      )}
    </svg>
  );
}

function Check2({ ok, label }: { ok: boolean | null; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className={clsx("grid size-4 shrink-0 place-items-center rounded-full", ok === null ? "bg-surface-2 text-muted" : ok ? "bg-good-soft text-good" : "bg-bad-soft text-bad")}>
        {ok === null ? "·" : ok ? <Check size={11} strokeWidth={3} /> : <X size={11} strokeWidth={3} />}
      </span>
      <span className="text-ink-2">{label}</span>
    </li>
  );
}

function Ctrl({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
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
