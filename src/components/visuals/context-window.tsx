"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useHydratedReducedMotion } from "@/lib/use-reduced-motion";
import { Bot, Eraser, FileText, FolderSearch, MessageSquare, Minimize2, RotateCcw, ShieldCheck, TriangleAlert, Wrench } from "lucide-react";
import clsx from "clsx";

type Kind = "system" | "tools" | "facts" | "summary" | "turn" | "tool" | "doc" | "sub" | "cleared";
interface Item {
  uid: number;
  kind: Kind;
  k: number;
  label: string;
  detail: string;
  fact?: number; // a turn that states this fact exactly
  facts?: number[]; // a summary that kept these facts exactly
}
interface State {
  items: Item[];
  uid: number;
  turn: number;
  mentioned: number;
  pinned: number[];
  sub: number;
  msg: string;
}

const WINDOW = 200;
const RESERVE = 16;
const W = 340;
const PX = W / WINDOW;
const BAR_Y = 26;
const BAR_H = 48;
const VB_H = 86;
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const FACTS = [
  { exact: "Customer C-88172", vague: "a customer", said: "Hi, I'm customer C-88172." },
  { exact: "Order ORD-55120", vague: "an order", said: "It's about order ORD-55120." },
  { exact: "$247.83 charged twice", vague: "a billing issue", said: "I was charged $247.83 twice." },
  { exact: "Refund by Fri 4 Oct", vague: "wants a refund soon", said: "Please refund one charge by Friday 4 Oct." },
];

const STYLE: Record<Kind, { fill: string; stroke: string; text: string; name: string }> = {
  system: { fill: "var(--ink)", stroke: "var(--ink)", text: "var(--bg)", name: "System prompt" },
  tools: { fill: "var(--info)", stroke: "var(--info)", text: "var(--surface)", name: "Tool definitions" },
  facts: { fill: "var(--good)", stroke: "var(--good)", text: "var(--surface)", name: "Case-facts block" },
  summary: { fill: "var(--accent)", stroke: "var(--accent-strong)", text: "var(--accent-ink)", name: "Summary" },
  turn: { fill: "var(--surface-2)", stroke: "var(--line-strong)", text: "var(--ink)", name: "Conversation turn" },
  tool: { fill: "var(--info-soft)", stroke: "var(--info)", text: "var(--ink)", name: "Tool result" },
  doc: { fill: "var(--line-strong)", stroke: "var(--muted)", text: "var(--ink)", name: "Document" },
  sub: { fill: "var(--good-soft)", stroke: "var(--good)", text: "var(--ink)", name: "Subagent summary" },
  cleared: { fill: "var(--surface)", stroke: "var(--line-strong)", text: "var(--muted)", name: "Cleared placeholder" },
};

const INITIAL: State = {
  items: [
    { uid: 1, kind: "system", k: 6, label: "System", detail: "Instructions, role and rules. Sent on every request." },
    { uid: 2, kind: "tools", k: 14, label: "Tools", detail: "12 tool definitions (names, descriptions, JSON schemas). They take space even when unused." },
    { uid: 3, kind: "turn", k: 3, label: "T1", detail: `User: "${FACTS[0].said}"`, fact: 0 },
  ],
  uid: 4,
  turn: 1,
  mentioned: 1,
  pinned: [],
  sub: 0,
  msg: "Every request re-sends everything: instructions, tool definitions and the whole conversation. Add things and watch the window fill.",
};

const fmt = (k: number) => String(Math.round(k * 10) / 10);
const sum = (items: Item[]) => items.reduce((a, i) => a + i.k, 0);
const holdsExact = (i: Item, f: number) => (i.kind === "turn" && i.fact === f) || (i.kind === "summary" && !!i.facts?.includes(f));
const pct = (k: number) => `${(k / WINDOW) * 100}%`;

export default function ContextWindow() {
  const reduce = useHydratedReducedMotion();
  const [s, setS] = useState<State>(INITIAL);
  const [pin, setPin] = useState(false);
  const [trim, setTrim] = useState(false);
  const [cache, setCache] = useState(false);
  const [middle, setMiddle] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  // The pinned facts block sits right after the tool definitions, outside the summarizable history.
  const factsItem: Item | null = pin
    ? { uid: -1, kind: "facts", k: 0.4 + 0.2 * s.pinned.length, label: "Facts", detail: s.pinned.length ? `<case_facts> ${s.pinned.map((f) => FACTS[f].exact).join(" · ")}. Re-sent exactly, never summarized.` : "<case_facts> (empty so far). Facts stated from now on are copied here." }
    : null;
  const display = factsItem ? [s.items[0], s.items[1], factsItem, ...s.items.slice(2)] : s.items;
  const used = sum(display);
  const showCurve = middle && used >= 60;

  const laid = display.map((it, idx) => {
    const start = sum(display.slice(0, idx));
    const mid = (start + it.k / 2) / Math.max(used, 1);
    const inMiddle = showCurve && it.kind !== "system" && it.kind !== "tools" && it.kind !== "facts" && mid > 0.25 && mid < 0.75;
    return { ...it, start, inMiddle };
  });

  const factStatus = (f: number): "unseen" | "pinned" | "history" | "risk" | "blurred" => {
    if (f >= s.mentioned) return "unseen";
    if (s.pinned.includes(f)) return "pinned";
    const holder = laid.find((it) => holdsExact(it, f));
    if (!holder) return "blurred";
    return holder.inMiddle ? "risk" : "history";
  };

  const fits = (extra: number) => used + extra <= WINDOW - RESERVE;
  const tooFull = (what: string) => setS((p) => ({ ...p, msg: `No room for ${what}: the window must also keep ${RESERVE}K free for Claude's reply. Compact, clear tool results or delegate first.` }));

  const add = (kind: Kind, k: number, label: string, detail: string, msg: string, what: string, extra?: Partial<State>, fact?: number) => {
    if (!fits(k)) return tooFull(what);
    setS((p) => ({ ...p, ...extra, items: [...p.items, { uid: p.uid, kind, k, label, detail, fact }], uid: p.uid + 1, msg }));
  };

  const addTurn = () => {
    const n = s.turn + 1;
    const f = s.mentioned < FACTS.length ? s.mentioned : undefined;
    const said = f !== undefined ? FACTS[f].said : "Thanks, any update?";
    const msg =
      f !== undefined
        ? `Turn ${n} adds a critical fact: "${FACTS[f].exact}".${pin ? " It is copied into the pinned case-facts block too." : " Right now it lives only in the history, where a summary can blur it."}`
        : `Turn ${n} adds about 3K tokens. Every old turn is re-sent on every request.`;
    add("turn", 3, `T${n}`, `User: "${said}"`, msg, "another 3K turn", { turn: n, mentioned: f !== undefined ? f + 1 : s.mentioned, pinned: pin && f !== undefined ? [...s.pinned, f] : s.pinned }, f);
  };

  const compact = () => {
    const kept = s.items.filter((i) => i.kind === "system" || i.kind === "tools");
    const gone = s.items.filter((i) => !kept.includes(i));
    if (!gone.length) return setS((p) => ({ ...p, msg: "Nothing to compact yet: only the system prompt and tools are loaded." }));
    const k = Math.min(12, Math.max(2, Math.round(sum(gone) * 0.06) + 2));
    const lost = FACTS.map((_, f) => f).filter((f) => f < s.mentioned && !s.pinned.includes(f) && gone.some((i) => holdsExact(i, f)));
    const msg = lost.length
      ? `Compaction squeezed ${fmt(sum(gone))}K of history into a ${k}K summary. Summaries lose exact values first: ${lost.map((f) => `"${FACTS[f].exact}" became "${FACTS[f].vague}"`).join(", ")}.`
      : `Compaction squeezed ${fmt(sum(gone))}K of history into a ${k}K summary.${pin ? " The case-facts block sits outside the summary, so every exact value survived." : ""}`;
    setS((p) => ({
      ...p,
      items: [...kept, { uid: p.uid, kind: "summary", k, label: "Summary", facts: p.pinned, detail: `<conversation_summary> Customer contacted support about ${FACTS.slice(0, p.mentioned).map((f, i) => (p.pinned.includes(i) ? f.exact : f.vague)).join(", ")}…` }],
      uid: p.uid + 1,
      msg,
    }));
  };

  const clearTools = () => {
    const tools = s.items.filter((i) => i.kind === "tool");
    if (tools.length <= 3) return setS((p) => ({ ...p, msg: `Context editing keeps the 3 most recent tool results by default. You have ${tools.length}, so nothing is cleared yet.` }));
    const old = new Set(tools.slice(0, -3).map((t) => t.uid));
    const freed = sum(tools.slice(0, -3)) - 0.2 * old.size;
    setS((p) => ({
      ...p,
      items: p.items.map((i) => (old.has(i.uid) ? { ...i, kind: "cleared", k: 0.2, label: "", detail: "Old tool result replaced by a short placeholder." } : i)),
      msg: `Context editing (clear_tool_uses) removed ${old.size} older tool result${old.size > 1 ? "s" : ""} and freed ${fmt(freed)}K, keeping the 3 most recent. Conversation turns are untouched.`,
    }));
  };

  const delegate = () =>
    add("sub", 1.5, "Sub", "Explore subagent's condensed findings: file paths and a call chain.", "A subagent read the files in its own fresh window (about 60K). Only a 1.5K summary came back, so the main context stays lean.", "the subagent's 1.5K summary", { sub: 60 });

  const togglePin = () => {
    const on = !pin;
    setPin(on);
    const exactNow = FACTS.map((_, f) => f).filter((f) => f < s.mentioned && s.items.some((i) => holdsExact(i, f)));
    const blurred = s.mentioned - exactNow.length;
    setS((p) => ({
      ...p,
      pinned: on ? exactNow : [],
      msg: on
        ? `A small case-facts block now rides near the top of every request and is never summarized.${blurred ? ` It is too late for ${blurred} fact${blurred > 1 ? "s" : ""} an earlier summary already blurred.` : ""}`
        : "Facts block removed. Facts now live only in the history, where the next compaction can blur them.",
    }));
  };

  const reset = () => {
    setS(INITIAL);
    setPin(false);
    setTrim(false);
    setCache(false);
    setMiddle(false);
    setSelected(null);
  };

  const activeId = hover ?? selected;
  const active = laid.find((it) => it.uid === activeId);
  const mids = laid.filter((it) => it.inMiddle);
  const status =
    used > WINDOW - RESERVE - 1.5
      ? { t: "Full: nothing more fits", c: "var(--bad)" }
      : used >= 150
        ? { t: "Past 150K: compaction would trigger (if enabled)", c: "var(--bad)" }
        : used >= 100
          ? { t: "Past 100K: context editing would trigger (if enabled)", c: "var(--accent-text)" }
          : { t: "Plenty of room", c: "var(--good)" };
  const cacheEnd = (s.items[0].k + s.items[1].k) * PX;
  const dur = reduce ? 0 : 0.55;
  const kinds = Array.from(new Set(display.map((d) => d.kind)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="font-display text-2xl font-semibold text-ink tabular">
            {fmt(used)}K <span className="text-base font-normal text-muted">/ 200K tokens</span>
          </p>
          <p className="text-xs text-muted">200K window shown (Haiku 4.5). Opus and Sonnet 5.x have 1M: more room, same rules.</p>
        </div>
        <span className="rounded-full border border-line px-2.5 py-1 text-xs font-medium" style={{ color: status.c }} aria-live="polite">
          {status.t}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="rounded-xl bg-surface-2/50 p-2 @lg:p-3">
          <div className="relative">
            <svg viewBox={`0 0 ${W} ${VB_H}`} className="h-auto w-full" role="img" aria-label={`Context window ${fmt(used)}K of 200K used. ${display.map((d) => `${STYLE[d.kind].name} ${fmt(d.k)}K`).join(", ")}. ${RESERVE}K kept free for the reply.`}>
              <defs>
                <pattern id="cw-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <line x1="0" y1="0" x2="0" y2="6" stroke="var(--line-strong)" strokeWidth="2" />
                </pattern>
              </defs>
              <rect x={0} y={BAR_Y} width={W} height={BAR_H} rx={8} fill="var(--surface)" stroke="var(--line)" />
              <rect x={(WINDOW - RESERVE) * PX} y={BAR_Y + 1} width={RESERVE * PX - 1} height={BAR_H - 2} rx={6} fill="url(#cw-hatch)" opacity={0.7} />

              <AnimatePresence initial={false}>
                {laid.map((it) => {
                  const st = STYLE[it.kind];
                  const w = Math.max(it.k * PX, 2);
                  const isActive = activeId === it.uid;
                  return (
                    <motion.g key={it.uid} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: it.inMiddle ? 0.35 : 1 }} exit={{ opacity: 0 }} transition={{ duration: dur }}>
                      <motion.rect
                        y={BAR_Y + 1}
                        height={BAR_H - 2}
                        rx={3}
                        fill={st.fill}
                        stroke={isActive ? "var(--accent-strong)" : st.stroke}
                        strokeWidth={isActive ? 2.5 : 1}
                        strokeDasharray={it.kind === "cleared" ? "3 2" : undefined}
                        initial={reduce ? false : { x: it.start * PX, width: 0 }}
                        animate={{ x: it.start * PX, width: w }}
                        transition={{ duration: dur, ease: EASE }}
                      />
                      {w >= it.label.length * 8 + 10 ? (
                        <text x={it.start * PX + w / 2} y={BAR_Y + BAR_H / 2 + 5} textAnchor="middle" fill={st.text} style={{ font: "600 14px var(--font-sans)", pointerEvents: "none" }}>
                          {it.label}
                        </text>
                      ) : null}
                    </motion.g>
                  );
                })}
              </AnimatePresence>

              {showCurve ? <path d={`M 0 12 C ${used * 0.3 * PX} 26, ${used * 0.7 * PX} 26, ${used * PX} 12`} fill="none" stroke="var(--accent-strong)" strokeWidth={2} /> : null}
              {cache ? <path d={`M 0 ${BAR_Y + BAR_H + 3} v 6 H ${cacheEnd} v -6`} fill="none" stroke="var(--good)" strokeWidth={1.5} /> : null}
              {[100, 150].map((k) => (
                <line key={k} x1={k * PX} x2={k * PX} y1={BAR_Y - 4} y2={BAR_Y + BAR_H + 4} stroke="var(--ink-2)" strokeDasharray="3 3" />
              ))}
            </svg>

            {/* Real buttons laid over the bar so every block is hoverable, focusable and clickable. */}
            <div className="absolute inset-x-0" style={{ top: `${(BAR_Y / VB_H) * 100}%`, height: `${(BAR_H / VB_H) * 100}%` }}>
              <AnimatePresence initial={false}>
                {laid.map((it) => (
                  <motion.button
                    key={it.uid}
                    type="button"
                    aria-label={`${STYLE[it.kind].name}, ${fmt(it.k)}K tokens. ${it.detail}`}
                    aria-pressed={selected === it.uid}
                    className="absolute top-0 h-full min-w-1.5 cursor-pointer rounded-sm bg-transparent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-strong"
                    onMouseEnter={() => setHover(it.uid)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(it.uid)}
                    onBlur={() => setHover(null)}
                    onClick={() => setSelected((cur) => (cur === it.uid ? null : it.uid))}
                    initial={reduce ? false : { opacity: 0, left: pct(it.start), width: 0 }}
                    animate={{ left: pct(it.start), width: pct(it.k), opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: dur, ease: EASE }}
                  />
                ))}
              </AnimatePresence>
            </div>

            {!(showCurve && used >= 150) ? <span className="absolute right-0 top-0 text-xs text-muted">reply space ↓</span> : null}
            {showCurve ? (
              <span className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-xs font-semibold" style={{ left: pct(Math.max(used / 2, 64)), color: "var(--accent-text)" }}>
                the middle gets the least attention
              </span>
            ) : null}
          </div>

          <div className="relative h-9 text-xs leading-tight text-muted">
            <span className="absolute right-1/2 top-0 pr-1 text-right">
              <span className="font-mono text-ink-2">100K</span>
              <br />
              context editing
            </span>
            <span className="absolute left-3/4 top-0 pl-1">
              <span className="font-mono text-ink-2">150K</span>
              <br />
              compaction
            </span>
          </div>
          {cache ? (
            <p className="text-xs font-semibold" style={{ color: "var(--good)" }}>
              cached prefix (system + tools): cheaper, not smaller
            </p>
          ) : null}

          <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-2" aria-label="Legend">
            {kinds.map((k) => (
              <li key={k} className="flex items-center gap-1.5">
                <span className="inline-block size-3 rounded-sm border" style={{ background: STYLE[k].fill, borderColor: STYLE[k].stroke }} />
                {STYLE[k].name}
              </li>
            ))}
            <li className="flex items-center gap-1.5">
              <span className="inline-block size-3 rounded-sm border border-line" style={{ backgroundImage: "repeating-linear-gradient(45deg, var(--line-strong) 0 1.5px, transparent 1.5px 4px)" }} />
              Kept free for the reply ({RESERVE}K)
            </li>
          </ul>

          <p className="min-h-10 pt-2 text-xs text-ink-2">
            {active ? (
              <>
                <span className="font-semibold text-ink">
                  {STYLE[active.kind].name} · {fmt(active.k)}K
                </span>{" "}
                {active.detail}
                {active.inMiddle ? <span style={{ color: "var(--accent-text)" }}> Sits in the low-attention middle.</span> : null}
              </>
            ) : (
              <span className="text-muted">
                Hover, tab to or click a block to see what it holds.{mids.length ? ` ${mids.length} block${mids.length > 1 ? "s" : ""} sit in the low-attention middle.` : ""}
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-line bg-bg/60 p-3">
          <p className="text-xs font-medium text-muted">Critical facts the next answer needs</p>
          <ul className="space-y-1.5">
            {FACTS.map((f, i) => {
              const st = factStatus(i);
              return (
                <motion.li key={i} layout={!reduce} className={clsx("flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-sm", st === "unseen" ? "border-dashed border-line" : "border-line bg-surface")}>
                  <span className="mt-0.5 shrink-0">
                    {st === "pinned" ? (
                      <ShieldCheck size={14} style={{ color: "var(--good)" }} />
                    ) : st === "history" ? (
                      <MessageSquare size={14} className="text-muted" />
                    ) : st === "unseen" ? (
                      <span className="block size-3.5" />
                    ) : (
                      <TriangleAlert size={14} style={{ color: st === "risk" ? "var(--accent-text)" : "var(--bad)" }} />
                    )}
                  </span>
                  <span className="min-w-0">
                    {st === "blurred" ? (
                      <>
                        <span className="font-mono text-xs text-muted line-through">{f.exact}</span>{" "}
                        <span className="font-mono text-xs text-bad">&rarr; &ldquo;{f.vague}&rdquo;</span>
                      </>
                    ) : (
                      <span className={clsx("font-mono text-xs", st === "unseen" ? "text-muted" : "text-ink")}>{st === "unseen" ? "not mentioned yet" : f.exact}</span>
                    )}
                    <span className="block text-xs text-muted">
                      {{ unseen: "Arrives in a later turn", pinned: "Safe in the case-facts block", history: "In the history only: exact for now", risk: "Buried mid-window: may be overlooked", blurred: "Lost to summarization" }[st]}
                    </span>
                  </span>
                </motion.li>
              );
            })}
          </ul>
          <AnimatePresence>
            {s.sub > 0 ? (
              <motion.div initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-lg border border-line bg-surface p-2">
                <p className="text-xs text-muted">Subagent&rsquo;s own window ({s.sub}K of 200K), discarded when it finishes</p>
                <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-surface-2">
                  <motion.div key={s.uid} className="h-full rounded-full" style={{ background: "var(--good)" }} initial={{ width: reduce ? pct(s.sub) : "0%" }} animate={{ width: pct(s.sub) }} transition={{ duration: reduce ? 0 : 1.1, ease: EASE }} />
                </div>
                <p className="mt-1 text-xs text-ink-2">60K of file reads stayed here. Only a 1.5K summary came back.</p>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 @xl:grid-cols-2">
        <Group title="Fill the window">
          <Act icon={<MessageSquare size={15} />} label="Add turn +3K" onClick={addTurn} />
          <Act
            icon={<Wrench size={15} />}
            label={`Tool result +${trim ? 2 : 18}K`}
            onClick={() =>
              add(
                "tool",
                trim ? 2 : 18,
                "lookup",
                trim ? "lookup_order trimmed to the 5 fields a return needs." : "lookup_order raw JSON: 40+ fields, most irrelevant.",
                trim ? "A trimmed tool result: only the 5 fields that matter, about 2K." : "A raw tool result lands in the history, about 18K. It is re-sent on every later turn.",
                `an ${trim ? 2 : 18}K tool result`,
              )
            }
          />
          <Act icon={<FileText size={15} />} label="Document +30K" onClick={() => add("doc", 30, "Doc", "Refund policy PDF. Best placed near the top, with the question at the end.", "A 30K document joins the window. Long material works best near the top of the prompt, with the question last.", "a 30K document")} />
          <Act icon={<FolderSearch size={15} />} label="Explore files +45K" onClick={() => add("tool", 45, "Reads", "60 file reads and greps done in the main context.", "Exploring in the main context: 45K of file reads and grep output piles into the history and is re-sent every turn. Compare with Delegate to subagent.", "45K of file reads")} />
        </Group>
        <Group title="Manage it">
          <Act icon={<Minimize2 size={15} />} label="Compact" onClick={compact} strong />
          <Act icon={<Eraser size={15} />} label="Clear tool results" onClick={clearTools} strong />
          <Act icon={<Bot size={15} />} label="Delegate to subagent" onClick={delegate} strong />
          <Act icon={<RotateCcw size={15} />} label="Reset" onClick={reset} />
        </Group>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Options">
        <Toggle on={pin} onClick={togglePin} label="Pin case-facts block" />
        <Toggle
          on={trim}
          onClick={() => {
            setTrim(!trim);
            setS((p) => ({ ...p, msg: !trim ? "New tool results are trimmed to the needed fields before they enter the history: about 2K instead of 18K each." : "Tool results now go into the history raw." }));
          }}
          label="Trim tool output"
        />
        <Toggle
          on={cache}
          onClick={() => {
            setCache(!cache);
            setS((p) => ({ ...p, msg: !cache ? "Prompt caching reuses the already-processed prefix (system prompt and tools) across requests: cheaper and faster. The cached tokens still take up the same space in the window." : "Caching off: the prefix is processed in full on each request." }));
          }}
          label="Prompt caching"
        />
        <Toggle
          on={middle}
          onClick={() => {
            setMiddle(!middle);
            setS((p) => ({ ...p, msg: !middle ? `In long inputs, models use the start and end reliably and can skip the middle. Fix: put key facts or findings first, with clear section headers.${used < 60 ? " The overlay appears once the window holds about 60K." : ""}` : "Attention overlay hidden." }));
          }}
          label="Lost in the middle"
        />
      </div>

      <p className="min-h-12 rounded-xl border-l-4 bg-surface-2/50 px-3 py-2 text-[0.95rem] text-ink-2" style={{ borderColor: "var(--accent)" }} aria-live="polite">
        {s.msg}
      </p>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-muted">{title}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Act({ icon, label, onClick, strong }: { icon: ReactNode; label: string; onClick: () => void; strong?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-colors active:scale-95",
        strong ? "border-accent-strong bg-accent-soft text-ink hover:bg-accent/40" : "border-line-strong bg-surface text-ink hover:border-ink",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  const reduce = useHydratedReducedMotion();
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onClick} className={clsx("inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors", on ? "border-good bg-good-soft text-ink" : "border-line-strong bg-surface text-ink-2 hover:border-ink")}>
      <span className={clsx("relative h-4 w-7 rounded-full transition-colors", on ? "bg-good" : "bg-line-strong")}>
        <motion.span className="absolute top-0.5 size-3 rounded-full bg-surface" animate={{ left: on ? 14 : 2 }} transition={{ duration: reduce ? 0 : 0.18 }} />
      </span>
      {label}
    </button>
  );
}
