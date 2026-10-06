"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useHydratedReducedMotion } from "@/lib/use-reduced-motion";
import { ChevronLeft, ChevronRight, RotateCcw, Undo2 } from "lucide-react";
import clsx from "clsx";

const EASE = [0.22, 1, 0.36, 1] as const;
const BASE_TOKENS = 400; // system prompt + one tool-free turn, always in the budget

const RUNGS = [
  {
    name: "Prompt instruction",
    note: "nothing to build",
    what: 'A line in the system prompt: "Answer in the customer\'s language."',
    when: "The default. If plain instructions already get you most of the way, stop here — every rung below is something extra to build, host, secure, version and document.",
  },
  {
    name: "Skill",
    note: "one markdown file",
    what: "A SKILL.md of procedures and references, loaded only when its description matches.",
    when: "The capability is knowledge or a procedure, not an action: house style, a migration runbook, how to triage a refund. Prose, not code, so there is no runtime to operate.",
  },
  {
    name: "Built-in tool",
    note: "already shipped",
    what: "Bash, Read, Write, WebFetch, Glob, Grep and friends.",
    when: "Someone already wrote, hardened and documented it. Never rebuild a file reader because it is three lines of code in your own repo.",
  },
  {
    name: "Custom tool",
    note: "your code + a schema",
    what: "A function you own, wrapped in a name, a description and an input schema.",
    when: "You need one narrow action against a system you already integrate with, and the schema can be stated precisely: create_refund(order_id, amount).",
  },
  {
    name: "MCP server",
    note: "a process to run",
    what: "A server exposing many tools over stdio or HTTP, shared across clients.",
    when: "You have a whole system to expose, or other clients need it too. The cost becomes operational: auth, versions, transport, and who restarts it at 3am.",
  },
  {
    name: "Subagent",
    note: "a model call + context",
    what: "A separate context window that returns one result to its parent.",
    when: "The work needs a lot of reading that would drown the caller's context, or it should happen in parallel. You pay a second model call to buy context isolation.",
  },
];

// Candidate toolset for a support agent. `sib` is the index of the tool it collides with when
// descriptions are vague; with sharp descriptions each pair names its boundary, so it stops colliding.
const TOOLS = [
  { name: "get_order", tokens: 180, sib: -1, loose: "Gets order information.", sharp: "One order by ID: status, items, payment, shipping. Use for ORD- ids. Not for account details — use get_customer." },
  { name: "search_orders", tokens: 165, sib: 0, loose: "Retrieves order data.", sharp: "Many orders for one customer over a date range. Use when there is no order ID. Not for one order — use get_order." },
  { name: "get_customer", tokens: 170, sib: -1, loose: "Gets user information.", sharp: "One customer's profile: name, email, address, order ids. Use for account questions. Not for order status — use get_order." },
  { name: "find_user", tokens: 150, sib: 2, loose: "Retrieves user records.", sharp: "Search people by name or email when the id is unknown; returns ids only. Not for full profiles — use get_customer." },
  { name: "refund_order", tokens: 200, sib: -1, loose: "Handles refunds.", sharp: "Refund one order in full or in part, up to $500. Use after confirming the order. Not for order status — use get_order." },
  { name: "issue_refund", tokens: 190, sib: 4, loose: "Processes refunds.", sharp: "Refund any amount, requires an approval token first. Use above $500. Not for routine refunds — use refund_order." },
  { name: "get_product", tokens: 140, sib: -1, loose: "Gets product information.", sharp: "One product by SKU: spec, price, stock. Use for a known SKU. Not for catalogue search — use lookup_product." },
  { name: "lookup_product", tokens: 135, sib: 6, loose: "Looks up products.", sharp: "Search the catalogue by description when no SKU is known. Not for a known SKU — use get_product." },
  { name: "send_email", tokens: 155, sib: -1, loose: "Sends an email.", sharp: "Send one templated email to one address. Requires an approved template id; cannot compose free text." },
];

const collisions = (n: number) => TOOLS.slice(0, n).filter((t) => t.sib >= 0 && t.sib < n).length;
const tokensFor = (n: number) => BASE_TOKENS + TOOLS.slice(0, n).reduce((s, t) => s + t.tokens, 0);
const accFor = (n: number, sharp: boolean) => Math.round(Math.max(38, 97 - Math.max(0, n - 6) * 0.9 - (sharp ? 0 : collisions(n) * 6)));

const NEEDS = [
  { need: "Tone, format, refusals", rung: 0 },
  { need: "House procedures, runbooks", rung: 1 },
  { need: "Read a file, run a grep", rung: 2 },
  { need: "Charge a card", rung: 3 },
  { need: "The whole warehouse system", rung: 4 },
  { need: "50 documents of research", rung: 5 },
];

const STAGES = [
  { id: "ladder", short: "Ladder", caption: "Climb the cheapest rung that actually works. Each rung up buys capability and pays for it in something you must now build, host or keep running." },
  { id: "toolset", short: "Load tools", caption: "Load tools one at a time and watch both numbers move. Context cost only ever goes up; selection accuracy starts falling the moment two descriptions could both be right." },
  { id: "before", short: "Before / after", caption: "Six focused tools beat thirty overlapping ones. The toolset that shipped is smaller, cheaper and more accurate than the toolset we started with." },
];

const LADDER = { x: 14, w: 332, row: 44, top: 12 };
// Curve plot box. Kept tight so 12px axis labels stay legible when the figure is ~300px wide.
const PLOT = { x: 26, w: 300, top: 20, h: 104, accMin: 40, accMax: 100, costMax: 2400 };
const xFor = (n: number) => PLOT.x + (n / TOOLS.length) * PLOT.w;
const yAcc = (a: number) => PLOT.top + PLOT.h - ((a - PLOT.accMin) / (PLOT.accMax - PLOT.accMin)) * PLOT.h;
const yCost = (c: number) => PLOT.top + PLOT.h - (c / PLOT.costMax) * PLOT.h;
const line = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? "L" : "M"} ${x} ${y}`).join(" ");

export default function CapabilityLadder() {
  const reduce = !!useHydratedReducedMotion();
  const [stage, setStage] = useState(0);
  const [rung, setRung] = useState(2);
  const [n, setN] = useState(2);
  const [sharp, setSharp] = useState(false);

  const last = STAGES.length - 1;
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    setStage((s) => Math.min(last, Math.max(0, s + (e.key === "ArrowRight" ? 1 : -1))));
  };
  const reset = () => {
    setStage(0);
    setRung(2);
    setN(2);
    setSharp(false);
  };

  const acc = accFor(n, sharp);
  const cost = tokensFor(n);
  const coll = collisions(n);
  const clashing = sharp ? 0 : coll;

  return (
    <div className="space-y-4" onKeyDown={onKey}>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Choose a stage">
        {STAGES.map((s, i) => (
          <Pill key={s.id} on={stage === i} onClick={() => setStage(i)} label={`Stage ${i + 1}: ${s.short}`}>
            <span className="font-mono">{i + 1}</span> {s.short}
          </Pill>
        ))}
        <span className="ml-auto text-xs text-muted">Illustrative numbers, not benchmark data.</span>
      </div>

      <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="min-w-0 rounded-xl bg-surface-2/50 p-2" tabIndex={0} role="group" aria-label="Capability diagram. Use left and right arrow keys to change stage.">
          {stage === 0 && (
            <svg viewBox="0 0 360 300" className="h-auto w-full" role="img" aria-label={`The capability ladder: ${RUNGS.length} rungs from ${RUNGS[0].name} to ${RUNGS[5].name}, selected ${RUNGS[rung].name}: ${RUNGS[rung].when}`}>
              {RUNGS.map((r, i) => {
                const y = LADDER.top + i * LADDER.row;
                const on = i === rung;
                const fill = ((i + 1) / RUNGS.length) * LADDER.w;
                return (
                  <g key={r.name} onClick={() => setRung(i)} style={{ cursor: "pointer" }}>
                    <rect x={LADDER.x - 6} y={y - 4} width={LADDER.w + 12} height={38} rx={8} fill={on ? "var(--accent-soft)" : "transparent"} />
                    <text x={LADDER.x} y={y + 12} fill={on ? "var(--accent-text)" : "var(--ink)"} style={{ font: `${on ? 700 : 600} 15px var(--font-display)` }}>
                      {r.name}
                    </text>
                    <text x={LADDER.x + LADDER.w} y={y + 12} textAnchor="end" fill="var(--muted)" style={{ font: "400 12px var(--font-mono)" }}>
                      {r.note}
                    </text>
                    <rect x={LADDER.x} y={y + 20} width={LADDER.w} height={8} rx={4} fill="var(--surface)" />
                    <motion.rect x={LADDER.x} y={y + 20} height={8} rx={4} fill={on ? "var(--accent)" : "var(--line-strong)"} initial={false} animate={{ width: fill }} transition={{ duration: reduce ? 0 : 0.45, ease: EASE }} />
                  </g>
                );
              })}
              <text x={LADDER.x} y={LADDER.top + RUNGS.length * LADDER.row + 6} fill="var(--muted)" style={{ font: "500 12px var(--font-mono)" }}>
                MORE YOU HAVE TO OPERATE →
              </text>
            </svg>
          )}

          {stage === 1 && (
            <svg viewBox="0 0 340 152" className="h-auto w-full" role="img" aria-label={`Tool count curve with ${n} tools loaded and ${sharp ? "sharp" : "overlapping"} descriptions: selection accuracy ${acc} percent, tool definitions ${cost} tokens, ${clashing} colliding pairs.`}>
              {[40, 70, 100].map((a) => (
                <g key={a}>
                  <line x1={PLOT.x} y1={yAcc(a)} x2={PLOT.x + PLOT.w} y2={yAcc(a)} stroke="var(--line)" strokeDasharray="3 4" />
                  <text x={PLOT.x - 4} y={yAcc(a) + 4} textAnchor="end" fill="var(--muted)" style={{ font: "400 11px var(--font-mono)" }}>{a}</text>
                </g>
              ))}
              <line x1={PLOT.x} y1={PLOT.top} x2={PLOT.x} y2={PLOT.top + PLOT.h} stroke="var(--line-strong)" strokeWidth={1.25} />
              <line x1={PLOT.x} y1={PLOT.top + PLOT.h} x2={PLOT.x + PLOT.w} y2={PLOT.top + PLOT.h} stroke="var(--line-strong)" strokeWidth={1.25} />
              <path d={line(Array.from({ length: TOOLS.length + 1 }, (_, i) => [xFor(i), yCost(tokensFor(i))]))} fill="none" stroke="var(--info)" strokeWidth={2} strokeLinecap="round" />
              <path d={line(Array.from({ length: TOOLS.length + 1 }, (_, i) => [xFor(i), yAcc(accFor(i, sharp))]))} fill="none" stroke={sharp ? "var(--good)" : "var(--bad)"} strokeWidth={2.5} strokeLinecap="round" />
              {/* motion turns x/y on SVG into transforms, so the guide is a <g> translated on x and the dot animates cx/cy as attributes. */}
              <motion.g animate={{ x: xFor(n) }} transition={reduce ? { duration: 0 } : { duration: 0.35, ease: EASE }}>
                <line x1={0} y1={PLOT.top - 6} x2={0} y2={PLOT.top + PLOT.h} stroke="var(--accent-strong)" strokeWidth={1.5} strokeDasharray="2 3" />
              </motion.g>
              <motion.circle cx={xFor(n)} cy={yAcc(acc)} r={5.5} fill="var(--accent)" stroke="var(--accent-ink)" strokeWidth={1.5} transition={reduce ? { duration: 0 } : { duration: 0.35, ease: EASE }} />
              <motion.circle cx={xFor(n)} cy={yCost(cost)} r={5.5} fill="var(--info)" stroke="var(--surface)" strokeWidth={1.5} transition={reduce ? { duration: 0 } : { duration: 0.35, ease: EASE }} />
              {Array.from({ length: TOOLS.length + 1 }, (_, i) => (
                <text key={i} x={xFor(i)} y={PLOT.top + PLOT.h + 16} textAnchor="middle" fill={i === n ? "var(--ink)" : "var(--muted)"} style={{ font: `${i === n ? 700 : 400} 11px var(--font-mono)` }}>{i}</text>
              ))}
            </svg>
          )}

          {stage === 2 && <BeforeAfter reduce={reduce} />}
        </div>

        <div className="min-w-0 rounded-xl border border-line bg-bg/60 p-3">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={stage}
              initial={reduce ? false : { opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduce ? undefined : { opacity: 0, x: -10 }}
              transition={{ duration: reduce ? 0 : 0.22 }}
              className="space-y-3"
            >
              {stage === 0 && (
                <>
                  <p className="text-xs text-muted">Cheapest useful rung for each need:</p>
                  <div className="grid grid-cols-1 gap-1.5 @xl:grid-cols-2">
                    {NEEDS.map((r) => (
                      <button
                        key={r.need}
                        type="button"
                        aria-label={`Use ${RUNGS[r.rung].name} for: ${r.need}`}
                        onClick={() => setRung(r.rung)}
                        className={clsx("rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors", rung === r.rung ? "border-accent-strong bg-accent-soft text-ink" : "border-line bg-surface text-ink-2 hover:border-line-strong")}
                      >
                        <span className="block font-semibold text-ink">{RUNGS[r.rung].name}</span>
                        <span className="text-muted">{r.need}</span>
                      </button>
                    ))}
                  </div>
                  <p className="rounded-lg bg-surface-2/60 px-3 py-2 text-xs text-ink">{RUNGS[rung].what}</p>
                  <p className="text-xs text-ink-2">{RUNGS[rung].when}</p>
                </>
              )}

              {stage === 1 && (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill on={!sharp} onClick={() => setSharp(false)} label="Overlapping tool descriptions">Overlapping</Pill>
                    <Pill on={sharp} onClick={() => setSharp(true)} label="Sharp, distinct tool descriptions">Sharp</Pill>
                    <div className="ml-auto flex items-center gap-1.5">
                      <CtrlButton label="Remove the last tool" onClick={() => setN((v) => Math.max(0, v - 1))} disabled={n === 0}>
                        <Undo2 size={16} />
                      </CtrlButton>
                      <CtrlButton label="Add one more tool" onClick={() => setN((v) => Math.min(TOOLS.length, v + 1))} disabled={n === TOOLS.length}>
                        +
                      </CtrlButton>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Metric k="Selection accuracy" v={`${acc}%`} tone={acc >= 90 ? "good" : acc >= 75 ? "accent" : "bad"} />
                    <Metric k="Tool definitions" v={`${cost} tok`} tone={cost > 1600 ? "bad" : cost > 1000 ? "accent" : "good"} />
                  </div>
                  <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-1" aria-label={`Loaded tools, ${n} of ${TOOLS.length}`}>
                    {TOOLS.slice(0, n).map((t) => {
                      const clash = !sharp && t.sib >= 0 && t.sib < n;
                      return (
                        <motion.li
                          key={t.name}
                          layout={!reduce}
                          initial={reduce ? false : { opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: reduce ? 0 : 0.25 }}
                          className={clsx("rounded-lg border px-2.5 py-1.5", clash ? "border-bad/50 bg-bad-soft/30" : "border-line bg-surface")}
                        >
                          <p className="flex flex-wrap items-center gap-1.5 font-mono text-xs font-semibold text-ink">
                            {t.name}
                            <span className="font-sans font-normal text-muted">{t.tokens} tok</span>
                            {clash && <span className="rounded-full bg-bad-soft px-1.5 font-sans text-[11px] font-medium text-bad">collides with {TOOLS[t.sib].name}</span>}
                          </p>
                          <p className="mt-0.5 text-xs leading-snug text-ink-2">{sharp ? t.sharp : t.loose}</p>
                        </motion.li>
                      );
                    })}
                    {n === 0 && <li className="text-xs text-muted">No tools yet. Add the first one to see the curve start.</li>}
                  </ul>

                  <p className="text-xs text-ink-2">
                    {sharp
                      ? "Same nine tools, same tokens. Only the descriptions changed and the collision count fell to zero — the cheapest fix on this diagram."
                      : coll === 0
                        ? "No two descriptions overlap yet, so accuracy holds. Load the sibling of one of these and watch what a wrong pick costs."
                        : `${clashing} pair${clashing > 1 ? "s" : ""} of descriptions could each honestly be right. Every ambiguous pair is a coin flip the model loses a few times, and the user sees the wrong tool's error.`}
                  </p>
                </>
              )}

              {stage === 2 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted">Same eval set, same 300 requests, two toolsets a team really shipped.</p>
                  <p className="text-xs text-ink-2">
                    Nobody planned 30 tools. They arrived one at a time and each one was reasonable: a tool for the new queue, a tool because the legacy endpoint had an odd shape, a tool for the region someone forgot. None was ever removed, because no single tool looked bad enough to remove on its own.
                  </p>
                  <p className="rounded-lg bg-accent-soft px-3 py-2 text-xs text-ink">
                    The rule to remember: every tool you add is a permanent tax on every request, paid whether or not it gets called. Before you write the schema, name what the agent cannot do without it — and if the answer is nothing, stop.
                  </p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="flex flex-col gap-3 @lg:flex-row @lg:items-center @lg:justify-between">
        <p className="min-h-12 min-w-0 text-[0.95rem] text-ink-2" aria-live="polite">
          <span className="mr-2 font-display font-semibold text-ink tabular">
            {stage + 1}/{STAGES.length}
          </span>
          {STAGES[stage].caption}
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          <CtrlButton label="Previous stage" onClick={() => setStage((s) => Math.max(0, s - 1))} disabled={stage === 0}>
            <ChevronLeft size={18} />
          </CtrlButton>
          <CtrlButton label="Next stage" onClick={() => setStage((s) => Math.min(last, s + 1))} disabled={stage === last}>
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

function BeforeAfter({ reduce }: { reduce: boolean }) {
  const rows: { k: string; before: number; after: number; unit?: string }[] = [
    { k: "Right tool chosen", before: 61, after: 94, unit: "%" },
    { k: "Tools in every request", before: 30, after: 6 },
    { k: "Definition tokens", before: 7400, after: 1150 },
    { k: "Services to run and secure", before: 4, after: 0 },
  ];
  return (
    <div className="space-y-3 p-1">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-bad/40 bg-bad-soft/30 px-2.5 py-2">
          <p className="text-xs font-semibold text-bad">Before</p>
          <p className="mt-0.5 text-xs text-ink-2">30 tools, most of them described as “gets data”.</p>
        </div>
        <div className="rounded-lg border border-good/40 bg-good-soft/30 px-2.5 py-2">
          <p className="text-xs font-semibold text-good">After</p>
          <p className="mt-0.5 text-xs text-ink-2">6 tools, each naming what it is not for.</p>
        </div>
      </div>
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.k}>
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-ink-2">{r.k}</span>
              <span className="font-mono text-ink-2">{r.before.toLocaleString("en-GB")}{r.unit} → <b className="text-good">{r.after.toLocaleString("en-GB")}{r.unit}</b></span>
            </div>
            <div className="mt-1 space-y-1">
              {[r.before, r.after].map((v, j) => (
                <div key={j} className="h-2 overflow-hidden rounded-full bg-surface">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: j ? "var(--good)" : "var(--bad)" }}
                    initial={false}
                    animate={{ width: `${Math.max(2, (v / r.before) * 100)}%` }}
                    transition={{ duration: reduce ? 0 : 0.6, ease: EASE }}
                  />
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">Top bar: the 30-tool toolset. Bottom bar: the 6-tool toolset. Both bars in a row share one scale.</p>
    </div>
  );
}

function Metric({ k, v, tone }: { k: string; v: string; tone: "good" | "accent" | "bad" }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-2.5 py-2">
      <p className="text-xs text-muted">{k}</p>
      <p className="mt-0.5 font-display text-xl font-semibold tabular" style={{ color: tone === "good" ? "var(--good)" : tone === "bad" ? "var(--bad)" : "var(--accent-text)" }}>
        {v}
      </p>
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
