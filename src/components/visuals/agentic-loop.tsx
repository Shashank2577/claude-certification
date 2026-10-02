"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from "lucide-react";

type NodeId = "user" | "app" | "claude" | "tool";
type EdgeId = "u2a" | "a2c" | "c2a" | "a2t" | "t2a" | "a2u";

const NODES: Record<NodeId, { x: number; y: number; w: number; h: number; label: string; sub: string }> = {
  user: { x: 16, y: 112, w: 104, h: 56, label: "User", sub: "asks" },
  app: { x: 206, y: 112, w: 128, h: 56, label: "Your app", sub: "runs the loop" },
  claude: { x: 452, y: 28, w: 152, h: 56, label: "Claude", sub: "decides" },
  tool: { x: 452, y: 196, w: 152, h: 56, label: "get_weather", sub: "your tool" },
};

const EDGES: Record<EdgeId, { from: NodeId; to: NodeId; x1: number; y1: number; x2: number; y2: number }> = {
  u2a: { from: "user", to: "app", x1: 122, y1: 132, x2: 202, y2: 132 },
  a2u: { from: "app", to: "user", x1: 204, y1: 150, x2: 124, y2: 150 },
  a2c: { from: "app", to: "claude", x1: 324, y1: 112, x2: 448, y2: 62 },
  c2a: { from: "claude", to: "app", x1: 452, y1: 80, x2: 334, y2: 126 },
  a2t: { from: "app", to: "tool", x1: 334, y1: 154, x2: 452, y2: 202 },
  t2a: { from: "tool", to: "app", x1: 448, y1: 220, x2: 322, y2: 170 },
};

interface Step {
  edge: EdgeId;
  caption: string;
  msg: { role: string; text: string; tag?: string } | null;
}

const STEPS: Step[] = [
  { edge: "u2a", caption: "A request arrives. Your app starts a messages array and prepares the tools Claude may call.", msg: { role: "user", text: "What's the weather in Paris?" } },
  { edge: "a2c", caption: "Your app calls the Messages API with the conversation and the tool definitions.", msg: { role: "request", text: "messages + tools: [get_weather]" } },
  {
    edge: "c2a",
    caption: "Claude decides it needs data. The reply contains a tool_use block, and stop_reason is tool_use.",
    msg: { role: "assistant", text: 'tool_use get_weather {"city": "Paris"}', tag: "stop_reason: tool_use" },
  },
  { edge: "a2t", caption: "Your code runs the tool. Claude never executes anything itself.", msg: { role: "app", text: 'get_weather("Paris")' } },
  { edge: "t2a", caption: "The tool returns data. A failure would come back here too, marked is_error: true.", msg: { role: "tool", text: '{"temp_c": 18, "sky": "cloudy"}' } },
  {
    edge: "a2c",
    caption: "Your app appends Claude's turn, then sends a user message with a tool_result carrying the matching tool_use_id.",
    msg: { role: "user", text: 'tool_result toolu_01 {"temp_c": 18, "sky": "cloudy"}' },
  },
  {
    edge: "c2a",
    caption: "Claude has what it needs and answers. stop_reason is end_turn, so the loop stops.",
    msg: { role: "assistant", text: "It's 18 °C and cloudy in Paris.", tag: "stop_reason: end_turn" },
  },
  { edge: "a2u", caption: "Your app shows the answer. Had Claude asked for another tool, the loop would have gone round again.", msg: null },
];

const ROLE_STYLE: Record<string, string> = {
  user: "var(--info)",
  request: "var(--muted)",
  assistant: "var(--accent-text)",
  app: "var(--muted)",
  tool: "var(--good)",
};

export default function AgenticLoop() {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const last = STEPS.length - 1;
  const current = STEPS[step];
  const edge = EDGES[current.edge];
  const iteration = step >= 5 ? 2 : 1;
  const panRef = useRef<HTMLDivElement>(null);
  const focusX = (NODES[edge.from].x + NODES[edge.from].w / 2 + NODES[edge.to].x + NODES[edge.to].w / 2) / 2;

  // On narrow figures the diagram scrolls sideways; keep the active hop in view.
  useEffect(() => {
    const box = panRef.current;
    const svg = box?.querySelector("svg");
    if (!box || !svg || box.scrollWidth <= box.clientWidth + 4) return;
    const left = Math.max(0, (focusX * svg.clientWidth) / 620 - box.clientWidth / 2);
    box.scrollTo({ left, behavior: reduce ? "auto" : "smooth" });
  }, [focusX, reduce]);

  useEffect(() => {
    if (!playing) return;
    if (step >= last) {
      const t = setTimeout(() => setPlaying(false), 0);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setStep((s) => Math.min(last, s + 1)), 2200);
    return () => clearTimeout(t);
  }, [playing, step, last]);

  const next = () => setStep((s) => Math.min(last, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));
  const reset = () => {
    setPlaying(false);
    setStep(0);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      next();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      back();
    }
  };

  const messages = STEPS.slice(0, step + 1)
    .map((s, i) => ({ ...s.msg, i }))
    .filter((m): m is { role: string; text: string; tag?: string; i: number } => !!m.role);

  return (
    <div className="space-y-4" onKeyDown={onKey}>
      {/* Side by side only when the figure is 48rem+; narrower, the diagram text would drop below ~11px. */}
      <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-1">
          {/* Below ~540px the diagram keeps its width and scrolls sideways instead of shrinking its labels. */}
          <div ref={panRef} className="max-w-full min-w-0 overflow-x-auto rounded-xl bg-surface-2/50 p-2" tabIndex={0} role="group" aria-label="Agentic loop diagram. Use left and right arrow keys to step.">
            <svg viewBox="0 0 620 270" className="h-auto w-full min-w-[540px]" role="img" aria-label={`Step ${step + 1}: ${current.caption}`}>
              <defs>
                <marker id="al-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0 0 L10 5 L0 10 z" fill="var(--line-strong)" />
                </marker>
                <marker id="al-arrow-on" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0 0 L10 5 L0 10 z" fill="var(--accent-strong)" />
                </marker>
              </defs>
  
              {/* Loop hint behind the app ↔ Claude ↔ tool cycle */}
              <path d="M 390 30 A 130 110 0 0 1 390 250" fill="none" stroke="var(--line)" strokeDasharray="4 6" strokeWidth="1.5" />
              <text x="372" y="140" textAnchor="middle" fill="var(--ink-2)" style={{ font: "500 13px var(--font-mono)" }}>
                loop {iteration}
              </text>
  
              {(Object.keys(EDGES) as EdgeId[]).map((id) => {
                const e = EDGES[id];
                const on = id === current.edge;
                return (
                  <line
                    key={id}
                    x1={e.x1}
                    y1={e.y1}
                    x2={e.x2}
                    y2={e.y2}
                    stroke={on ? "var(--accent-strong)" : "var(--line-strong)"}
                    strokeWidth={on ? 2.5 : 1.25}
                    markerEnd={on ? "url(#al-arrow-on)" : "url(#al-arrow)"}
                    style={{ transition: "stroke 200ms ease, stroke-width 200ms ease" }}
                  />
                );
              })}
  
              {(Object.keys(NODES) as NodeId[]).map((id) => {
                const n = NODES[id];
                const on = id === edge.from || id === edge.to;
                const isClaude = id === "claude";
                return (
                  <g key={id}>
                    <rect
                      x={n.x}
                      y={n.y}
                      width={n.w}
                      height={n.h}
                      rx={14}
                      fill={isClaude ? "var(--ink)" : "var(--surface)"}
                      stroke={on ? "var(--accent-strong)" : "var(--line-strong)"}
                      strokeWidth={on ? 2.5 : 1.25}
                      style={{ transition: "stroke 200ms ease" }}
                    />
                    <text x={n.x + n.w / 2} y={n.y + 25} textAnchor="middle" fill={isClaude ? "var(--bg)" : "var(--ink)"} style={{ font: "600 16px var(--font-display)" }}>
                      {n.label}
                    </text>
                    {/* On the ink-filled node, --bg (not --accent) keeps AA contrast in both themes: in dark mode --ink is light. */}
                    <text x={n.x + n.w / 2} y={n.y + 44} textAnchor="middle" fill={isClaude ? "var(--bg)" : "var(--ink-2)"} fillOpacity={isClaude ? 0.8 : 1} style={{ font: "400 13px var(--font-sans)" }}>
                      {n.sub}
                    </text>
                  </g>
                );
              })}
  
              <motion.circle
                key={step}
                r={7}
                fill="var(--accent)"
                stroke="var(--accent-ink)"
                strokeWidth={1.5}
                initial={reduce ? { cx: edge.x2, cy: edge.y2 } : { cx: edge.x1, cy: edge.y1, opacity: 0 }}
                animate={{ cx: edge.x2, cy: edge.y2, opacity: 1 }}
                transition={{ duration: reduce ? 0 : 0.8, ease: [0.22, 1, 0.36, 1] }}
              />
            </svg>
          </div>
          <p className="px-1 text-xs text-muted @xl:hidden">Scroll the diagram sideways; it follows each step.</p>
        </div>

        <div className="flex min-h-56 min-w-0 flex-col rounded-xl border border-line bg-bg/60 p-3">
          <p className="px-1 text-xs font-medium text-muted">Transcript</p>
          <ol className="mt-2 flex-1 space-y-2 overflow-y-auto" aria-label="Messages so far">
            <AnimatePresence initial={false}>
              {messages.map((m) => (
                <motion.li
                  key={m.i}
                  layout={!reduce}
                  initial={reduce ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="rounded-lg border border-line bg-surface px-2.5 py-2"
                >
                  <span className="font-mono text-[11px] font-semibold" style={{ color: ROLE_STYLE[m.role] ?? "var(--muted)" }}>
                    {m.role}
                  </span>
                  <p className="mt-0.5 font-mono text-xs break-words text-ink">{m.text}</p>
                  {m.tag ? <p className="mt-1 font-mono text-[11px] text-accent-text">{m.tag}</p> : null}
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
        </div>
      </div>

      <div className="flex flex-col gap-3 @lg:flex-row @lg:items-center @lg:justify-between">
        <p className="min-h-12 min-w-0 text-[0.95rem] text-ink-2" aria-live="polite">
          <span className="mr-2 font-display font-semibold text-ink tabular">
            {step + 1}/{STEPS.length}
          </span>
          {current.caption}
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          <CtrlButton label="Previous step" onClick={back} disabled={step === 0}>
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
          <CtrlButton label="Next step" onClick={next} disabled={step === last}>
            <ChevronRight size={18} />
          </CtrlButton>
          <CtrlButton label="Reset" onClick={reset}>
            <RotateCcw size={16} />
          </CtrlButton>
        </div>
      </div>
    </div>
  );
}

function CtrlButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
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
