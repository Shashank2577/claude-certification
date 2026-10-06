"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useHydratedReducedMotion } from "@/lib/use-reduced-motion";
import { AlertTriangle, Check, Lock, RefreshCw, ShieldAlert, Sparkles, X } from "lucide-react";
import clsx from "clsx";

type Tab = "define" | "select" | "errors";
const TABS: { id: Tab; label: string }[] = [
  { id: "define", label: "Definitions" },
  { id: "select", label: "Selection" },
  { id: "errors", label: "Errors" },
];
const EASE = [0.22, 1, 0.36, 1] as const;

/* ---------- 1. Definitions ---------- */
interface Part {
  id: string;
  tag: string;
  code: string;
  why: string;
}
const BAD: Part[] = [
  { id: "b-name", tag: "Vague name", code: '"name": "get_data"', why: "\"Data\" could mean anything. Nothing in the name says orders, so Claude has to guess." },
  { id: "b-desc", tag: "One-line description", code: '"description": "Gets data."', why: "The description is the label Claude reads to choose a tool. Two words give it nothing to go on." },
  { id: "b-overlap", tag: "Overlaps a sibling", code: '// also defined: get_info — "Gets info."', why: "Two tools that honestly mean the same thing. Claude will pick differently on different runs, and no prompt can fix that." },
  { id: "b-param", tag: "Ambiguous parameter", code: '"id": { "type": "string" }', why: "Which id? Customer, order, invoice? No format, no example, so wrong values get sent." },
];
const GOOD: Part[] = [
  { id: "g-name", tag: "Clear name", code: '"name": "get_order"', why: "The name states the resource. Names must match ^[a-zA-Z0-9_-]{1,128}$: letters, digits, underscore, hyphen." },
  { id: "g-purpose", tag: "Purpose & output", code: '"Looks up one order by ID and returns status, line items, payment state and shipping events."', why: "Says what it does and what comes back. Anthropic's docs call the description \"by far the most important factor\" in tool performance." },
  { id: "g-when", tag: "When to use", code: '"Use when the user mentions an order, package, delivery or refund, or quotes an ID starting ORD-."', why: "Explicit triggers. A request containing \"ORD-\" now points to one tool only. The docs recommend at least 3–4 sentences like these." },
  { id: "g-not", tag: "When NOT to use", code: '"Do NOT use for account details such as email or address; use get_customer."', why: "Draws the boundary with the sibling tool by name. This is what stops misrouting between look-alike tools." },
  { id: "g-param", tag: "Described input", code: '"order_id": { "type": "string", "description": "Format ORD-NNNN, e.g. ORD-4821" }', why: "Unambiguous parameter name (order_id, not id) plus a format and an example, so the right value gets sent." },
  { id: "g-enum", tag: "Enum, not free text", code: '"response_format": { "enum": ["concise", "detailed"] }', why: "An enum makes wrong values impossible (poka-yoke: design out the mistake) and lets the agent ask for less data when it only needs an ID." },
];

function Definitions() {
  const reduce = useHydratedReducedMotion();
  const [active, setActive] = useState<string>("g-not");
  const all = [...BAD, ...GOOD];
  const current = all.find((p) => p.id === active) ?? GOOD[3];
  const isGood = current.id.startsWith("g");
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">Hover or tap any line to see why it helps or hurts. Claude never sees your code, only these labels.</p>
      <div className="grid grid-cols-1 gap-3 @xl:grid-cols-2">
        {[
          { title: "Vague tool", parts: BAD, good: false },
          { title: "Well-designed tool", parts: GOOD, good: true },
        ].map((col) => (
          <div key={col.title} className={clsx("rounded-xl border p-3", col.good ? "border-good/50 bg-good-soft/40" : "border-bad/40 bg-bad-soft/40")}>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold" style={{ color: col.good ? "var(--good)" : "var(--bad)" }}>
              {col.good ? <Check size={14} /> : <X size={14} />} {col.title}
            </p>
            <ul className="space-y-1.5">
              {col.parts.map((p) => {
                const on = p.id === active;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      aria-label={`${p.tag}: show why`}
                      aria-pressed={on}
                      onMouseEnter={() => setActive(p.id)}
                      onFocus={() => setActive(p.id)}
                      onClick={() => setActive(p.id)}
                      className={clsx(
                        "w-full rounded-lg border bg-surface px-2.5 py-1.5 text-left transition-colors",
                        on ? "border-accent-strong shadow-card" : "border-line hover:border-line-strong",
                      )}
                    >
                      <span className="block text-xs font-semibold" style={{ color: col.good ? "var(--good)" : "var(--bad)" }}>
                        {p.tag}
                      </span>
                      <code className="block font-mono text-xs leading-snug break-words text-ink">{p.code}</code>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <div aria-live="polite" className="min-h-12">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={current.id}
            initial={reduce ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -4 }}
            transition={{ duration: reduce ? 0 : 0.2 }}
            className="text-[0.95rem] text-ink-2"
          >
            <span className="mr-2 font-display font-semibold" style={{ color: isGood ? "var(--good)" : "var(--bad)" }}>
              {current.tag}.
            </span>
            {current.why}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ---------- 2. Selection simulator ---------- */
type ToolId = "get_customer" | "get_order";
const LEVELS = [
  { label: "One-liner", caption: "Each description is a single vague phrase (\"Retrieves customer information\", \"Retrieves order details\"). Claude is close to guessing whenever a request could fit either tool." },
  { label: "+ Purpose", caption: "Saying what each tool returns helps a little, but the two still overlap on anything that mentions the customer." },
  { label: "+ When / not", caption: "Each tool now names its triggers and the sibling to use instead. This boundary is the biggest single jump." },
  { label: "+ Formats & examples", caption: "Input formats (ORD-NNNN, email) and a handoff rule settle the last edge cases. Richer descriptions are the cheapest fix and address the root cause: missing information." },
];
const DESC: Record<ToolId, string[]> = {
  get_order: [
    "Retrieves order details.",
    "Looks up one order and returns status, items, payment and shipping events.",
    "Use for orders, packages, deliveries, refunds or IDs starting ORD-. Not for account details; use get_customer.",
    "order_id looks like ORD-4821. If the user gives only an email, call get_customer first.",
  ],
  get_customer: [
    "Retrieves customer information.",
    "Returns one customer's profile: name, email, address and their order IDs.",
    "Use for account questions: contact details, address, login. Not for one order's status; use get_order.",
    "Accepts customer_id or email, e.g. sam@example.com. Use first when there is no order ID.",
  ],
};
const REQUESTS: { text: string; correct: ToolId; p: number[] }[] = [
  { text: "Where is my package?", correct: "get_order", p: [0.55, 0.7, 0.92, 0.96] },
  { text: "Check what happened with ORD-4821", correct: "get_order", p: [0.5, 0.62, 0.9, 0.98] },
  { text: "Change the email on my account", correct: "get_customer", p: [0.7, 0.76, 0.95, 0.97] },
  { text: "I only have my email. Find my last order", correct: "get_customer", p: [0.35, 0.45, 0.82, 0.94] },
  { text: "Was I refunded for ORD-7710?", correct: "get_order", p: [0.45, 0.6, 0.9, 0.97] },
];
// Compact viewBox so 15px SVG text stays ~12px+ when the diagram is ~300px wide on a phone.
const TOOL_POS: Record<ToolId, { x: number }> = { get_customer: { x: 8 }, get_order: { x: 186 } };
const TOOL_W = 166;
const TOOL_Y = 170;
const START = { x: 180, y: 70 };

function Selection() {
  const reduce = useHydratedReducedMotion();
  const [level, setLevel] = useState(0);
  const [req, setReq] = useState(1);
  const r = REQUESTS[req];
  const pc = r.p[level];
  const prob: Record<ToolId, number> = r.correct === "get_order" ? { get_order: pc, get_customer: 1 - pc } : { get_customer: pc, get_order: 1 - pc };
  const winner: ToolId = prob.get_order >= prob.get_customer ? "get_order" : "get_customer";
  const overall = Math.round((REQUESTS.reduce((s, q) => s + q.p[level], 0) / REQUESTS.length) * 100);
  const endOf = (t: ToolId) => ({ x: TOOL_POS[t].x + TOOL_W / 2, y: TOOL_Y });
  const w = endOf(winner);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Pick a user request">
        {REQUESTS.map((q, i) => (
          <button
            key={q.text}
            type="button"
            aria-pressed={i === req}
            aria-label={`Request: ${q.text}`}
            onClick={() => setReq(i)}
            className={clsx(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              i === req ? "border-accent-strong bg-accent-soft text-ink" : "border-line bg-surface text-ink-2 hover:border-line-strong",
            )}
          >
            “{q.text}”
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="rounded-xl bg-surface-2/50 p-2">
          <svg
            viewBox="0 0 360 240"
            className="h-auto w-full"
            role="img"
            aria-label={`At description level "${LEVELS[level].label}", for "${r.text}" Claude picks get_order ${Math.round(prob.get_order * 100)}% and get_customer ${Math.round(prob.get_customer * 100)}% of the time. Correct tool: ${r.correct}.`}
          >
            {(Object.keys(TOOL_POS) as ToolId[]).map((t) => {
              const e = endOf(t);
              const ok = t === r.correct;
              const pct = Math.round(prob[t] * 100);
              const col = ok ? "var(--good)" : "var(--bad)";
              const cx = TOOL_POS[t].x + TOOL_W / 2;
              return (
                <g key={t}>
                  <motion.line
                    x1={START.x}
                    y1={START.y}
                    x2={e.x}
                    y2={e.y}
                    stroke={col}
                    strokeLinecap="round"
                    initial={false}
                    animate={{ strokeWidth: 1.5 + prob[t] * 12, opacity: 0.25 + prob[t] * 0.75 }}
                    transition={{ duration: reduce ? 0 : 0.5, ease: EASE }}
                  />
                  <rect x={TOOL_POS[t].x} y={TOOL_Y} width={TOOL_W} height={62} rx={14} fill="var(--surface)" stroke={t === winner ? "var(--accent-strong)" : "var(--line-strong)"} strokeWidth={t === winner ? 2.5 : 1.25} />
                  <text x={cx} y={TOOL_Y + 27} textAnchor="middle" fill="var(--ink)" style={{ font: "600 15px var(--font-mono)" }}>
                    {t}
                  </text>
                  <text x={cx} y={TOOL_Y + 49} textAnchor="middle" fill={col} style={{ font: "600 14px var(--font-sans)" }}>
                    {ok ? "correct · " : "wrong · "}
                    {pct}%
                  </text>
                </g>
              );
            })}
            <rect x={90} y={12} width={180} height={58} rx={14} fill="var(--ink)" />
            <text x={180} y={37} textAnchor="middle" fill="var(--bg)" style={{ font: "600 17px var(--font-display)" }}>
              Claude
            </text>
            <text x={180} y={57} textAnchor="middle" fill="var(--bg)" fillOpacity={0.8} style={{ font: "500 14px var(--font-sans)" }}>
              reads only the labels
            </text>
            <motion.circle
              key={`${req}-${level}`}
              r={7}
              fill="var(--accent)"
              stroke="var(--accent-ink)"
              strokeWidth={1.5}
              initial={reduce ? { cx: w.x, cy: w.y } : { cx: START.x, cy: START.y, opacity: 0 }}
              animate={{ cx: w.x, cy: w.y, opacity: 1 }}
              transition={{ duration: reduce ? 0 : 0.7, ease: EASE }}
            />
          </svg>
        </div>

        <div className="space-y-2 rounded-xl border border-line bg-bg/60 p-3">
          <p className="text-xs font-medium text-muted">What Claude sees</p>
          <p className="text-xs text-muted">Only the name, description and input schema. Never your code.</p>
          {(["get_order", "get_customer"] as ToolId[]).map((t) => (
            <div key={t} className="rounded-lg border border-line bg-surface px-2.5 py-2">
              <p className="font-mono text-xs font-semibold text-accent-text">{t}</p>
              <p className="mt-0.5 text-xs leading-snug text-ink">
                {DESC[t].slice(level === 0 ? 0 : 1, level + 1).map((s, i) => (
                  <motion.span key={`${t}-${i}-${level}`} initial={reduce || i < level - 1 ? false : { opacity: 0 }} animate={{ opacity: 1 }} className="mr-1">
                    {s}
                  </motion.span>
                ))}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 @lg:grid-cols-[1fr_auto] @lg:items-center">
        <label className="block">
          <span className="flex justify-between text-xs text-muted">
            <span>Description quality</span>
            <span className="font-semibold text-ink">{LEVELS[level].label}</span>
          </span>
          <input
            type="range"
            min={0}
            max={3}
            step={1}
            value={level}
            onChange={(e) => setLevel(Number(e.target.value))}
            aria-label="Description quality"
            aria-valuetext={LEVELS[level].label}
            className="mt-1 w-full accent-[var(--accent-strong)]"
          />
        </label>
        <div className="min-w-40">
          <p className="text-xs text-muted">Right tool, all 5 requests</p>
          <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-surface-2">
            <motion.div
              className="h-full rounded-full"
              style={{ background: overall >= 90 ? "var(--good)" : overall >= 70 ? "var(--accent-strong)" : "var(--bad)" }}
              initial={false}
              animate={{ width: `${overall}%` }}
              transition={{ duration: reduce ? 0 : 0.5, ease: EASE }}
            />
          </div>
          <p className="mt-0.5 font-display text-lg font-semibold text-ink tabular">{overall}%</p>
        </div>
      </div>
      <p className="min-h-12 text-[0.95rem] text-ink-2" aria-live="polite">
        {LEVELS[level].caption} <span className="text-xs text-muted">(Illustrative numbers, not benchmark data.)</span>
      </p>
    </div>
  );
}

/* ---------- 3. Error responses ---------- */
type Scenario = "transient" | "validation" | "business" | "permission";
const SCENARIOS: Record<Scenario, { label: string; body: string; action: string; icon: ReactNode }> = {
  transient: {
    label: "Timeout",
    body: '"errorCategory": "transient",\n"isRetryable": true,\n"message": "Inventory service timed out after 10s. Retry in a few seconds."',
    action: "Waits briefly and retries. Retrying is worth it because the flag says so.",
    icon: <RefreshCw size={16} />,
  },
  validation: {
    label: "Bad input",
    body: '"errorCategory": "validation",\n"isRetryable": false,\n"message": "order_id must look like ORD-NNNN; got \\"4821\\". Ask the user or add the prefix."',
    action: "Fixes the argument to ORD-4821 and calls again. Retrying the same input would fail forever.",
    icon: <Sparkles size={16} />,
  },
  business: {
    label: "Over limit",
    body: '"errorCategory": "business",\n"isRetryable": false,\n"message": "Refund of $640 exceeds the $500 self-service limit.",\n"customerMessage": "Refunds above $500 need a quick review by our billing team. I can open that request now."',
    action: "Stops retrying, relays the customer-friendly message and escalates to a human.",
    icon: <ShieldAlert size={16} />,
  },
  permission: {
    label: "No access",
    body: '"errorCategory": "permission",\n"isRetryable": false,\n"message": "This caller cannot view ORD-4821; it belongs to another account. Ask the customer to sign in to the owning account."',
    action: "Stops. Retrying won't grant access, so it asks the customer to sign in to the right account or escalates.",
    icon: <Lock size={16} />,
  },
};

function Errors() {
  const reduce = useHydratedReducedMotion();
  const [scenario, setScenario] = useState<Scenario>("transient");
  const [structured, setStructured] = useState(false);
  const s = SCENARIOS[scenario];
  const json = structured
    ? `{\n  "isError": true,\n  "content": [{ "type": "text", "text": "…" }]\n}\n\n// the "text" string, parsed:\n{\n${s.body.replace(/^/gm, "  ")}\n}`
    : `{\n  "isError": true,\n  "content": [{ "type": "text", "text": "Operation failed" }]\n}`;
  const explain = structured
    ? `Structured error: a category, a retryable flag and a message that says what went wrong and what to try next. The agent picks the right recovery. ${s.action}`
    : "Generic \"Operation failed\": the agent can't tell a timeout from a typo from a policy limit, so it retries blindly or gives up. Uniform errors remove the information needed to recover.";

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 @lg:flex-row @lg:items-center @lg:justify-between">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Failure scenario">
          {(Object.keys(SCENARIOS) as Scenario[]).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={k === scenario}
              aria-label={`Scenario: ${SCENARIOS[k].label}`}
              onClick={() => setScenario(k)}
              className={clsx("rounded-full border px-3 py-1 text-xs transition-colors", k === scenario ? "border-accent-strong bg-accent-soft text-ink" : "border-line bg-surface text-ink-2 hover:border-line-strong")}
            >
              {SCENARIOS[k].label}
            </button>
          ))}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={structured}
          aria-label="Structured error response"
          onClick={() => setStructured((v) => !v)}
          className="flex items-center gap-2 self-start rounded-full border border-line-strong bg-surface py-1 pr-3 pl-1 text-xs text-ink"
        >
          <span className={clsx("relative h-5 w-9 rounded-full transition-colors", structured ? "bg-good" : "bg-surface-2")}>
            <motion.span className="absolute top-0.5 size-4 rounded-full bg-surface shadow-card" initial={false} animate={{ left: structured ? 18 : 2 }} transition={{ duration: reduce ? 0 : 0.2 }} />
          </span>
          {structured ? "Structured" : "Generic"}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.pre
            key={`${scenario}-${structured}`}
            aria-label={`Tool result the server returns, ${structured ? "structured" : "generic"}`}
            initial={reduce ? false : { opacity: 0, x: structured ? 8 : -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? undefined : { opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.2 }}
            className={clsx("overflow-x-auto rounded-xl border p-3 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap text-ink", structured ? "border-good/50 bg-good-soft/40" : "border-bad/40 bg-bad-soft/40")}
          >
            {json}
          </motion.pre>
        </AnimatePresence>
        <div className="rounded-xl border border-line bg-bg/60 p-3">
          <p className="text-xs font-medium text-muted">Agent&apos;s next move</p>
          <motion.div
            key={`${scenario}-${structured}-a`}
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0 : 0.3, delay: reduce ? 0 : 0.1 }}
            className="mt-2 flex gap-2 rounded-lg border border-line bg-surface p-2.5"
          >
            <span className="mt-0.5 shrink-0" style={{ color: structured ? "var(--good)" : "var(--bad)" }}>
              {structured ? s.icon : <AlertTriangle size={16} />}
            </span>
            <p className="text-sm text-ink">{structured ? s.action : "Guesses. Might retry a typo five times, or give up on a two-second blip and tell the user nothing useful."}</p>
          </motion.div>
          <p className="mt-2 text-xs text-muted">
            The tool ran and failed, so MCP returns a normal result flagged <code className="font-mono">isError: true</code> and the model can react. Protocol errors (unknown tool, malformed arguments) use JSON-RPC errors instead. In the Claude API, a <code className="font-mono">tool_result</code> uses <code className="font-mono">is_error</code>.
          </p>
        </div>
      </div>
      <p className="min-h-12 text-[0.95rem] text-ink-2" aria-live="polite">
        {explain}
      </p>
    </div>
  );
}

/* ---------- Shell ---------- */
export default function ToolDesign() {
  const reduce = useHydratedReducedMotion();
  const [tab, setTab] = useState<Tab>("define");
  const onKey = (e: KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.id === tab);
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const n = (i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length;
      setTab(TABS[n].id);
      document.getElementById(`td-tab-${TABS[n].id}`)?.focus();
    }
  };
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Tool design views" className="inline-flex rounded-xl border border-line bg-surface-2/60 p-1" onKeyDown={onKey}>
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`td-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls="td-panel"
            aria-label={`${t.label} view`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            className={clsx("relative rounded-lg px-3 py-1.5 text-sm font-medium transition-colors", tab === t.id ? "text-ink" : "text-muted hover:text-ink")}
          >
            {tab === t.id ? <motion.span layoutId="td-pill" className="absolute inset-0 rounded-lg bg-surface shadow-card" transition={{ duration: reduce ? 0 : 0.25, ease: EASE }} /> : null}
            <span className="relative">{t.label}</span>
          </button>
        ))}
      </div>
      <div id="td-panel" role="tabpanel" aria-labelledby={`td-tab-${tab}`}>
        {tab === "define" ? <Definitions /> : tab === "select" ? <Selection /> : <Errors />}
      </div>
    </div>
  );
}
