"use client";

import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useHydratedReducedMotion } from "@/lib/use-reduced-motion";
import { ChevronLeft, ChevronRight, FileText, Layers, Pause, Play, RotateCcw } from "lucide-react";
import clsx from "clsx";

type Mode = "brief" | "history";
type Focus = "coord" | 0 | 1 | 2;
type Tone = "hist" | "sys" | "leak" | "brief" | "work" | "result";
interface Item {
  label: string;
  tokens: number;
  tone: Tone;
  note?: string;
}

// Illustrative token counts. Every bar shares one scale so windows can be compared honestly.
const SCALE = 46000;
const SYS = 1200;
const BRIEF = 350;
const RESULT = 300;

const TONE: Record<Tone, string> = {
  hist: "var(--line-strong)",
  sys: "var(--muted)",
  leak: "var(--bad)",
  brief: "var(--accent)",
  work: "var(--info)",
  result: "var(--good)",
};

const COORD_BASE: Item[] = [
  { label: "Coordinator system prompt + tool definitions (incl. Task)", tokens: 2000, tone: "hist", note: "The parent's own instructions. Not written for a researcher role." },
  { label: 'Earlier turns, incl. a note: "we are leaning toward Vendor B"', tokens: 8800, tone: "hist", note: "This note can bias a researcher toward Vendor B." },
  { label: "Old tool results: pricing PDFs from last week", tokens: 6300, tone: "hist", note: "Irrelevant to certifications. Pure noise that crowds the window." },
  { label: "User: compare the three vendors' security certifications", tokens: 100, tone: "hist", note: "Harmless, but the brief already says this." },
];
const PLAN: Item = { label: "Plan: three briefs, one per vendor", tokens: 400, tone: "hist", note: "Each helper sees its siblings' assignments and may drift into them." };
const HISTORY = [...COORD_BASE, PLAN].reduce((a, b) => a + b.tokens, 0);

const SUBS = [
  { vendor: "Vendor A", work: 21000, result: '{"vendor":"A","certs":["SOC 2 Type II","ISO 27001"],"sources":3}' },
  { vendor: "Vendor B", work: 24000, result: '{"vendor":"B","certs":["ISO 27001"],"note":"SOC 2 in progress","sources":2}' },
  { vendor: "Vendor C", work: 18000, result: '{"vendor":"C","certs":["SOC 2 Type II","FedRAMP Moderate"],"sources":4}' },
] as const;

const briefFor = (v: string, others: string) =>
  `Objective: list ${v}'s current security certifications.\nReturn: JSON [{cert, scope, valid_until, source_url}].\nTools: WebSearch + WebFetch; prefer the vendor's trust page.\nOut of scope: ${others} (other agents cover them).`;

interface Step {
  label: string;
  plain: Record<Mode, string>;
  tech: Record<Mode, string>;
}
const same = (s: string) => ({ brief: s, history: s });

const STEPS: Step[] = [
  {
    label: "Request",
    plain: same("A user asks the coordinator to compare three vendors' security certifications. The coordinator already has a long conversation behind it."),
    tech: same(`Coordinator context: its system prompt, earlier turns, old tool results and the new request (about ${fmt(HISTORY - PLAN.tokens)} tokens).`),
  },
  {
    label: "Plan",
    plain: same("The coordinator splits the job into three assignments, one per vendor, and writes each helper a complete brief so nobody duplicates anyone else's work."),
    tech: same("A good brief states the objective, the output format, which tools to use, and what is out of scope. It must contain everything the subagent needs."),
  },
  {
    label: "Spawn",
    plain: {
      brief: "It sends out three helpers at once. Each starts with a blank notebook and receives only its own short brief.",
      history: "It sends out three helpers at once, but staples the coordinator's entire conversation to every brief. Each notebook is mostly full before work starts.",
    },
    tech: {
      brief: "Three Task tool calls (named Agent in current SDK docs) in one response, so they run in parallel. The prompt string is the only channel in.",
      history: `A normal subagent never inherits history (only a fork does); here the coordinator pasted ~${fmt(HISTORY)} tokens into each prompt. That is ${fmt(HISTORY * 3)} tokens copied three times over.`,
    },
  },
  {
    label: "Work",
    plain: {
      brief: "All three research at the same time. Their searching fills their own notebooks, not the coordinator's.",
      history: "They still research in parallel, but with less room to think, and the stray budget note quietly nudges them toward Vendor B.",
    },
    tech: same("Each subagent runs its own agent loop with WebSearch and WebFetch inside an isolated context window."),
  },
  {
    label: "Return",
    plain: same("Each helper hands back one short, structured answer. All the messy research stays behind with the helper."),
    tech: same(`Only the subagent's final message comes back, as the Task tool result (~${RESULT} tokens each).`),
  },
  {
    label: "Synthesize",
    plain: {
      brief: "The coordinator compares the three answers and replies. Its own context grew by less than a thousand tokens.",
      history: `Same final answer shape, but you paid for ${fmt(HISTORY * 3)} extra input tokens and risked biased, overlapping research.`,
    },
    tech: same("The coordinator aggregates the results; it never saw the 60k+ tokens of raw searching its helpers did."),
  },
];

const DEF_FIELDS = [
  { k: "description", v: '"Finds recent, citable sources on a vendor."', why: "Required. Tells the coordinator WHEN to pick this subagent." },
  { k: "prompt", v: '"You are a research specialist. Return JSON…"', why: "Required. Becomes the subagent's own system prompt." },
  { k: "tools", v: '["WebSearch", "WebFetch"]', why: "Only the tools this role needs. Omit it and the subagent inherits all available tools." },
  { k: "model", v: '"sonnet"', why: "A cheaper model is often fine for focused research; the lead can stay on a stronger one." },
];
const COORD_FIELDS = [
  { k: "allowed_tools", v: '["Read", "Grep", "Task"]', why: 'Exam guide: this list must include the spawning tool, "Task", or the coordinator cannot delegate. Current SDK docs name the same tool "Agent".' },
  { k: "agents", v: '{"web-researcher": AgentDefinition(…)}', why: "Registers the subagent types the coordinator may spawn (or define them as .claude/agents/*.md files)." },
];

interface XY {
  x: number;
  y: number;
}
interface Layout {
  id: string;
  vb: string;
  cls: string;
  coord: { x: number; y: number; w: number; h: number; bar: { x: number; w: number }; rows: number[] };
  subs: XY[];
  subW: number;
  subH: number;
  barW: number;
  rows: number[];
  link: (c: XY) => string;
  /** Packet endpoints: briefs travel down to subagent i; results travel up to a distinct spot under the coordinator. */
  pkt: (c: XY, i: number, down: boolean) => { from: XY; to: XY };
  note: { x: number; y: number; anchor: "middle" | "start" };
  bracket: { x1: number; x2: number; y: number };
  f: { title: number; body: number; mono: number };
}
// Three subagents side by side: used when the figure is 42rem-48rem wide (@2xl), where the SVG spans the full width.
const WIDE: Layout = {
  id: "w",
  vb: "0 0 640 372",
  cls: "hidden @2xl:block @3xl:hidden",
  coord: { x: 196, y: 14, w: 248, h: 110, bar: { x: 244, w: 152 }, rows: [28, 46, 60, 92] },
  // 196 wide so the title and the right-aligned status ("researching…") never touch.
  subs: [8, 222, 436].map((x) => ({ x, y: 236 })),
  subW: 196,
  subH: 104,
  barW: 152,
  rows: [24, 42, 56, 88],
  link: (c) => `M320 124 L${c.x} 236`,
  pkt: (c, i, down) => (down ? { from: { x: 320, y: 130 }, to: { x: c.x, y: 224 } } : { from: { x: c.x, y: 224 }, to: { x: 264 + i * 56, y: 140 } }),
  note: { x: 320, y: 178, anchor: "middle" },
  bracket: { x1: 24, x2: 616, y: 354 },
  f: { title: 16, body: 12, mono: 12 },
};
// Stacked rows: used below @2xl and beside the inspector at @3xl+, where the column is narrow.
const COMPACT: Layout = {
  id: "c",
  vb: "0 0 340 500",
  cls: "@2xl:hidden @3xl:block",
  // Bottom row sits 16 units above the box edge so the "context" line never touches the border.
  coord: { x: 12, y: 10, w: 316, h: 108, bar: { x: 52, w: 236 }, rows: [30, 50, 66, 92] },
  subs: [164, 268, 372].map((y) => ({ x: 70, y })),
  subW: 258,
  subH: 92,
  barW: 230,
  rows: [24, 42, 54, 82],
  link: (c) => `M28 118 V${c.y} H70`,
  pkt: (c, i, down) => (down ? { from: { x: 28, y: 124 }, to: { x: 42, y: c.y } } : { from: { x: 42, y: c.y }, to: { x: 100 + i * 70, y: 130 } }),
  note: { x: 70, y: 155, anchor: "start" },
  bracket: { x1: 70, x2: 328, y: 484 },
  f: { title: 17, body: 13.5, mono: 13 },
};

function fmt(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}
const sum = (items: Item[]) => items.reduce((a, b) => a + b.tokens, 0);

function coordItems(step: number): Item[] {
  const items = [...COORD_BASE];
  if (step >= 1) items.push(PLAN);
  if (step >= 4) items.push({ label: "Three returned results (structured JSON)", tokens: RESULT * 3, tone: "result" });
  return items;
}

function subItems(i: number, step: number, mode: Mode): Item[] {
  if (step < 2) return [];
  const s = SUBS[i];
  const items: Item[] = [{ label: "Its own system prompt (AgentDefinition.prompt), tool definitions, project CLAUDE.md", tokens: SYS, tone: "sys" }];
  if (mode === "history") items.push(...[...COORD_BASE, PLAN].map((it) => ({ ...it, tone: "leak" as Tone })));
  items.push({ label: `Task prompt: the brief for ${s.vendor}`, tokens: BRIEF, tone: "brief" });
  if (step >= 3) items.push({ label: "Its own searches and fetched pages", tokens: s.work, tone: "work" });
  if (step >= 4) items.push({ label: "Final message, returned to the coordinator", tokens: RESULT, tone: "result" });
  return items;
}

export default function OrchestratorSubagents() {
  const reduce = !!useHydratedReducedMotion();
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<Mode>("brief");
  const [focus, setFocus] = useState<Focus>("coord");
  const [field, setField] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const last = STEPS.length - 1;
  const cur = STEPS[step];

  useEffect(() => {
    if (!playing) return;
    if (step >= last) {
      const t = setTimeout(() => setPlaying(false), 0);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => go(step + 1), 2600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, step, last]);

  function go(n: number) {
    const s = Math.max(0, Math.min(last, n));
    if (s === 2 && step < 2 && focus === "coord") setFocus(0);
    setStep(s);
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      go(step + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(step - 1);
    }
  };

  const items = focus === "coord" ? coordItems(step) : subItems(focus, step, mode);
  const sentIn = mode === "brief" ? BRIEF * 3 : (HISTORY + BRIEF) * 3;
  const leaky = mode === "history";
  const fields = focus === "coord" ? COORD_FIELDS : DEF_FIELDS;
  const activeField = fields.find((f) => f.k === field);
  const diagram = { step, mode, focus, setFocus, reduce };

  return (
    <div className="space-y-4" onKeyDown={onKey}>
      <div className="flex flex-col gap-2 @xl:flex-row @xl:items-center @xl:justify-between">
        <div role="group" aria-label="What the coordinator passes to each subagent" className="inline-flex max-w-full self-start rounded-xl border border-line-strong bg-surface p-1">
          {(
            [
              ["brief", "Brief only", FileText],
              ["history", "Brief + full history", Layers],
            ] as const
          ).map(([m, label, Icon]) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              aria-label={m === "brief" ? "Pass each subagent an explicit brief only" : "Pass each subagent the brief plus the coordinator's full history"}
              onClick={() => setMode(m)}
              className={clsx("relative flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium whitespace-nowrap transition-colors @sm:px-3", mode === m ? "text-accent-ink" : "text-ink-2 hover:text-ink")}
            >
              {mode === m && <motion.span layoutId="os-mode" className={clsx("absolute inset-0 rounded-lg", m === "brief" ? "bg-accent" : "bg-bad-soft ring-1 ring-bad")} transition={{ duration: reduce ? 0 : 0.3 }} />}
              <Icon size={15} className={clsx("relative", m === "history" && mode === m && "text-bad")} />
              <span className={clsx("relative", m === "history" && mode === m && "text-ink")}>{label}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Steps">
          {STEPS.map((s, i) => (
            <button
              key={s.label}
              type="button"
              aria-label={`Go to step ${i + 1}: ${s.label}`}
              aria-current={i === step ? "step" : undefined}
              onClick={() => go(i)}
              className={clsx(
                "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                i === step ? "border-accent-strong bg-accent-soft text-ink" : i < step ? "border-line-strong text-ink-2" : "border-line text-muted hover:text-ink",
              )}
            >
              {i + 1}. {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="min-w-0 rounded-xl bg-surface-2/50 p-2" tabIndex={0} role="group" aria-label="Orchestrator and subagents diagram. Use left and right arrow keys to step.">
          <Diagram L={WIDE} {...diagram} />
          <Diagram L={COMPACT} {...diagram} />
          <div className="flex flex-wrap gap-x-3 gap-y-1 px-2 pt-1 pb-1 text-xs text-ink-2">
            {(
              [
                ["sys", "Own prompt + tools"],
                ["brief", "Task brief"],
                ["leak", "Copied parent history"],
                ["work", "Own research"],
                ["result", "Returned result"],
              ] as const
            ).map(([t, l]) => (
              <span key={t} className={clsx("flex items-center gap-1.5", t === "leak" && !leaky && "opacity-40")}>
                <span className="inline-block size-2.5 rounded-sm" style={{ background: TONE[t] }} />
                {l}
              </span>
            ))}
            <span className="text-muted">Token counts are illustrative.</span>
          </div>
        </div>

        <div className="flex min-h-72 min-w-0 flex-col rounded-xl border border-line bg-bg/60 p-3">
          {/* Label and chips on separate rows so the label never wraps into a cramped column. */}
          <div className="flex flex-col items-start gap-1.5">
            <p className="px-1 text-xs font-medium text-muted">Inside the context window of</p>
            <div className="flex flex-wrap gap-1" role="group" aria-label="Choose whose context to inspect">
              {(["coord", 0, 1, 2] as Focus[]).map((f) => (
                <button
                  key={String(f)}
                  type="button"
                  aria-pressed={focus === f}
                  aria-label={f === "coord" ? "Inspect coordinator" : `Inspect subagent ${f + 1}`}
                  onClick={() => setFocus(f)}
                  className={clsx("rounded-md border px-2 py-0.5 font-mono text-xs transition-colors", focus === f ? "border-accent-strong bg-accent-soft text-ink" : "border-line text-ink-2 hover:text-ink")}
                >
                  {f === "coord" ? "lead" : `#${f + 1}`}
                </button>
              ))}
            </div>
          </div>

          <ul className="mt-2 space-y-1.5" aria-label="Context window contents">
            {items.length === 0 ? (
              <li className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-xs text-muted">Not spawned yet. A subagent has no context until the coordinator calls Task.</li>
            ) : (
              <AnimatePresence initial={false}>
                {items.map((it) => (
                  <motion.li
                    key={it.label + it.tone}
                    layout={!reduce}
                    initial={reduce ? false : { opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    className={clsx("rounded-lg border px-2.5 py-1.5", it.tone === "leak" ? "border-bad/50 bg-bad-soft" : "border-line bg-surface")}
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-1 inline-block size-2 shrink-0 rounded-sm" style={{ background: TONE[it.tone] }} />
                      <span className="flex-1 text-xs text-ink">{it.label}</span>
                      <span className="font-mono text-xs text-ink-2 tabular">{fmt(it.tokens)}</span>
                    </div>
                    {it.tone === "leak" && it.note ? <p className="mt-0.5 pl-4 text-xs text-ink-2">Leak: {it.note}</p> : null}
                  </motion.li>
                ))}
              </AnimatePresence>
            )}
          </ul>
          {items.length > 0 && <p className="mt-1.5 px-1 text-right font-mono text-xs text-ink-2">total {fmt(sum(items))}</p>}

          {focus !== "coord" && step >= 2 && (
            <pre className="mt-2 rounded-lg border border-line bg-surface px-2.5 py-2 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap text-ink-2">
              <span className="text-accent-text">{step >= 4 ? "returns → " : "Task prompt → "}</span>
              {step >= 4 ? SUBS[focus].result : briefFor(SUBS[focus].vendor, SUBS.filter((_, j) => j !== focus).map((x) => x.vendor).join(" and "))}
            </pre>
          )}

          <div className="mt-auto pt-3">
            <p className="px-1 text-xs font-medium text-muted">{focus === "coord" ? "ClaudeAgentOptions (coordinator)" : "AgentDefinition: web-researcher"}</p>
            <div className="mt-1 rounded-lg border border-line bg-surface p-1.5 font-mono text-xs">
              {fields.map((f) => (
                <button
                  key={f.k}
                  type="button"
                  aria-label={`${f.k}: ${f.why}`}
                  onMouseEnter={() => setField(f.k)}
                  onMouseLeave={() => setField(null)}
                  onFocus={() => setField(f.k)}
                  onBlur={() => setField(null)}
                  onClick={() => setField(f.k)}
                  className={clsx("block w-full rounded px-1.5 py-0.5 text-left break-words transition-colors", field === f.k ? "bg-accent-soft" : "hover:bg-surface-2")}
                >
                  <span className="text-accent-text">{f.k}</span>
                  <span className="text-muted">=</span> <span className="text-ink">{f.v}</span>
                </button>
              ))}
            </div>
            <p className="mt-1.5 min-h-8 px-1 text-xs text-ink-2">{activeField ? activeField.why : "Hover or focus a field to see what it does."}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Sent into subagents" value={step >= 2 ? fmt(sentIn) : "—"} bad={leaky && step >= 2} reduce={reduce} />
        <Stat label="Lead's context growth from results" value={step >= 4 ? `+${fmt(RESULT * 3)}` : "—"} reduce={reduce} />
        <Stat label="Parent history items copied into each subagent" value={step >= 2 ? (leaky ? "5" : "0") : "—"} bad={leaky && step >= 2} reduce={reduce} />
      </div>

      <div className="flex flex-col gap-3 @xl:flex-row @xl:items-start @xl:justify-between">
        <div className="min-h-16" aria-live="polite">
          <p className="text-[0.95rem] text-ink-2">
            <span className="mr-2 font-display font-semibold text-ink tabular">
              {step + 1}/{STEPS.length}
            </span>
            {cur.plain[mode]}
          </p>
          <p className={clsx("mt-1 font-mono text-xs", leaky && step >= 2 ? "text-bad" : "text-muted")}>{cur.tech[mode]}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <CtrlButton label="Previous step" onClick={() => go(step - 1)} disabled={step === 0}>
            <ChevronLeft size={18} />
          </CtrlButton>
          <CtrlButton
            label={playing ? "Pause" : "Play"}
            onClick={() => {
              if (step >= last) setStep(0);
              setPlaying((p) => !p);
            }}
          >
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </CtrlButton>
          <CtrlButton label="Next step" onClick={() => go(step + 1)} disabled={step === last}>
            <ChevronRight size={18} />
          </CtrlButton>
          <CtrlButton
            label="Reset"
            onClick={() => {
              setPlaying(false);
              setStep(0);
              setFocus("coord");
            }}
          >
            <RotateCcw size={16} />
          </CtrlButton>
        </div>
      </div>
    </div>
  );
}

function Diagram({ L, step, mode, focus, setFocus, reduce }: { L: Layout; step: number; mode: Mode; focus: Focus; setFocus: (f: Focus) => void; reduce: boolean }) {
  const cur = STEPS[step];
  const leaky = mode === "history";
  const dur = reduce ? 0 : 0.9;
  const flowing = step === 2 || step === 4;
  const spawned = step >= 2;
  const C = L.coord;
  const cx = C.x + C.w / 2;
  const coord = coordItems(step);
  const centre = (s: XY): XY => ({ x: s.x + L.subW / 2, y: s.y + L.subH / 2 });
  const mono = (size: number, weight = 500) => ({ font: `${weight} ${size}px var(--font-mono)` });
  // Background pill behind the flow label so it stays legible over the connector lines.
  const noteW = (step === 2 ? 29 : 18) * L.f.mono * 0.62 + 16;

  return (
    <svg viewBox={L.vb} className={clsx("h-auto w-full", L.cls)} role="img" aria-label={`Step ${step + 1} of ${STEPS.length}, ${leaky ? "full history" : "explicit brief"} mode: ${cur.plain[mode]}`}>
      {L.subs.map((s, i) => (
        <path key={i} d={L.link(centre(s))} fill="none" stroke={flowing ? "var(--accent-strong)" : "var(--line-strong)"} strokeWidth={flowing ? 2 : 1.25} strokeDasharray={spawned ? undefined : "4 6"} style={{ transition: "stroke 200ms ease" }} />
      ))}
      {flowing && (
        <g>
          <rect x={L.note.anchor === "middle" ? L.note.x - noteW / 2 : L.note.x - 8} y={L.note.y - 14} width={noteW} height={20} rx={10} fill="var(--bg)" />
          <text x={L.note.x} y={L.note.y} textAnchor={L.note.anchor} fill="var(--ink)" style={mono(L.f.mono, 600)}>
            {step === 2 ? "3 × Task calls · one response" : "final message only"}
          </text>
        </g>
      )}

      {/* Coordinator */}
      <g onClick={() => setFocus("coord")} onMouseEnter={() => setFocus("coord")} style={{ cursor: "pointer" }}>
        <rect x={C.x} y={C.y} width={C.w} height={C.h} rx={16} fill="var(--ink)" stroke={focus === "coord" ? "var(--accent-strong)" : "transparent"} strokeWidth={3} />
        <text x={cx} y={C.y + C.rows[0]} textAnchor="middle" fill="var(--bg)" style={{ font: `600 ${L.f.title}px var(--font-display)` }}>
          Coordinator
        </text>
        {/* --bg (not --accent) on the ink fill keeps AA contrast in both themes: in dark mode --ink is light. */}
        <text x={cx} y={C.y + C.rows[1]} textAnchor="middle" fill="var(--bg)" fillOpacity={0.8} style={{ font: `400 ${L.f.body}px var(--font-sans)` }}>
          lead agent · plans, delegates, aggregates
        </text>
        <Bar id={`${L.id}-coord`} x={C.bar.x} y={C.y + C.rows[2]} w={C.bar.w} segs={coord} dur={dur} dark />
        <text x={cx} y={C.y + C.rows[3]} textAnchor="middle" fill="var(--bg)" opacity={0.85} style={mono(L.f.mono)}>
          context: {fmt(sum(coord))} tokens
        </text>
      </g>

      {/* Subagents */}
      {L.subs.map((s, i) => {
        const segs = subItems(i, step, mode);
        const status = !spawned ? "not spawned" : step === 2 ? "briefed" : step === 3 ? "researching…" : "returned";
        const sel = focus === i;
        return (
          <g key={i} onClick={() => setFocus(i as Focus)} onMouseEnter={() => setFocus(i as Focus)} style={{ cursor: "pointer" }} opacity={spawned ? 1 : 0.55}>
            <rect
              x={s.x}
              y={s.y}
              width={L.subW}
              height={L.subH}
              rx={14}
              fill="var(--surface)"
              stroke={sel ? "var(--accent-strong)" : leaky && spawned ? "var(--bad)" : "var(--line-strong)"}
              strokeWidth={sel ? 2.5 : 1.25}
              strokeDasharray={spawned ? undefined : "4 5"}
            />
            <text x={s.x + 14} y={s.y + L.rows[0]} fill="var(--ink)" style={{ font: `600 ${L.f.title - 2}px var(--font-display)` }}>
              Subagent {i + 1}
            </text>
            <text x={s.x + L.subW - 12} y={s.y + L.rows[0]} textAnchor="end" fill={step === 3 ? "var(--info)" : step >= 4 ? "var(--good)" : "var(--muted)"} style={mono(L.f.mono)}>
              {status}
            </text>
            <text x={s.x + 14} y={s.y + L.rows[1]} fill="var(--ink-2)" style={{ font: `400 ${L.f.body}px var(--font-sans)` }}>
              web-researcher · {SUBS[i].vendor}
            </text>
            <Bar id={`${L.id}-sub${i}`} x={s.x + 14} y={s.y + L.rows[2]} w={L.barW} segs={segs} dur={dur} />
            <text x={s.x + 14} y={s.y + L.rows[3]} fill="var(--ink-2)" style={mono(L.f.mono)}>
              {spawned ? `own window: ${fmt(sum(segs))}` : "no context yet"}
            </text>
          </g>
        );
      })}

      {step === 3 && (
        <g>
          <line x1={L.bracket.x1} y1={L.bracket.y} x2={L.bracket.x2} y2={L.bracket.y} stroke="var(--info)" strokeWidth={1.5} />
          <line x1={L.bracket.x1} y1={L.bracket.y - 6} x2={L.bracket.x1} y2={L.bracket.y + 6} stroke="var(--info)" strokeWidth={1.5} />
          <line x1={L.bracket.x2} y1={L.bracket.y - 6} x2={L.bracket.x2} y2={L.bracket.y + 6} stroke="var(--info)" strokeWidth={1.5} />
          <rect x={(L.bracket.x1 + L.bracket.x2) / 2 - 82} y={L.bracket.y - 10} width={164} height={20} rx={10} fill="var(--bg)" />
          <text x={(L.bracket.x1 + L.bracket.x2) / 2} y={L.bracket.y + 4} textAnchor="middle" fill="var(--info)" style={mono(L.f.mono, 600)}>
            running in parallel
          </text>
        </g>
      )}

      {/* Packets: briefs (or bloated history) travel down; results travel up */}
      <AnimatePresence>
        {flowing &&
          L.subs.map((s, i) => {
            const down = step === 2;
            const { from, to } = L.pkt(centre(s), i, down);
            const big = down && leaky;
            const w = big ? 52 : 40;
            const fill = down ? (big ? "var(--bad)" : "var(--accent)") : "var(--good)";
            return (
              <motion.g
                key={`${step}-${mode}-${i}`}
                initial={reduce ? { x: to.x, y: to.y } : { x: from.x, y: from.y, opacity: 0 }}
                animate={{ x: to.x, y: to.y, opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduce ? 0 : 1, ease: [0.22, 1, 0.36, 1] }}
              >
                <rect x={-w / 2} y={-10} width={w} height={20} rx={6} fill={fill} />
                <text y={4} textAnchor="middle" fill={down && !big ? "var(--accent-ink)" : "var(--bg)"} style={mono(11.5, 600)}>
                  {down ? (big ? `+${fmt(HISTORY)}` : "brief") : "JSON"}
                </text>
              </motion.g>
            );
          })}
      </AnimatePresence>
    </svg>
  );
}

function Bar({ id, x, y, w, segs, dur, dark }: { id: string; x: number; y: number; w: number; segs: Item[]; dur: number; dark?: boolean }) {
  const clip = `os-clip-${id}`;
  const starts = segs.map((_, i) => sum(segs.slice(0, i)));
  return (
    <g>
      <rect x={x} y={y} width={w} height={12} rx={4} fill={dark ? "var(--bg)" : "var(--surface-2)"} opacity={dark ? 0.18 : 1} stroke={dark ? undefined : "var(--line)"} />
      <clipPath id={clip}>
        <rect x={x} y={y} width={w} height={12} rx={4} />
      </clipPath>
      <g clipPath={`url(#${clip})`}>
        {segs.map((s, i) => {
          const sx = x + (starts[i] / SCALE) * w;
          return (
            <motion.rect
              key={s.label + s.tone + i}
              y={y}
              height={12}
              fill={dark && s.tone === "hist" ? "var(--muted)" : TONE[s.tone]}
              initial={false}
              animate={{ x: sx, width: Math.max((s.tokens / SCALE) * w, 1.5) }}
              transition={{ duration: dur, ease: [0.22, 1, 0.36, 1] }}
            />
          );
        })}
      </g>
    </g>
  );
}

function Stat({ label, value, bad, reduce }: { label: string; value: string; bad?: boolean; reduce: boolean }) {
  return (
    <div className={clsx("rounded-xl border px-3 py-2 transition-colors", bad ? "border-bad/60 bg-bad-soft" : "border-line bg-surface")}>
      <p className="text-xs leading-tight text-ink-2">{label}</p>
      <motion.p key={value} initial={reduce ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className={clsx("mt-0.5 font-display text-lg font-semibold tabular", bad ? "text-bad" : "text-ink")}>
        {value}
      </motion.p>
    </div>
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
      className="hit-44 grid size-9 place-items-center rounded-xl border border-line-strong bg-surface text-ink transition-colors hover:border-ink active:scale-95 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
