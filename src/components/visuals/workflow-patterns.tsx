"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useHydratedReducedMotion } from "@/lib/use-reduced-motion";
import { Check, ChevronLeft, ChevronRight, Pause, Play, RotateCcw, X } from "lucide-react";
import clsx from "clsx";

type PatternId = "chain" | "route" | "parallel" | "orch" | "eval" | "agent";
type Kind = "llm" | "code" | "io" | "stop";
interface Node { id: string; x: number; y: number; w: number; h: number; label: string; sub: string; kind: Kind; from?: number }
interface Edge { id: string; from: string; to: string; off?: number }
interface Step { on: string[]; caption: string; hi?: string[]; badge?: string }
interface Diagram { nodes: Node[]; edges: Edge[]; steps: Step[] }

const n = (id: string, x: number, y: number, w: number, label: string, sub: string, kind: Kind, h = 52, from?: number): Node => ({ id, x, y, w, h, label, sub, kind, from });

const META: Record<PatternId, { tab: string; name: string; who: "code" | "model"; when: string; example: string; tradeoff: string }> = {
  chain: { tab: "Chaining", name: "Prompt chaining", who: "code", when: "The task splits cleanly into fixed steps you know in advance.", example: "Draft product copy, check it against brand rules in code, then translate it.", tradeoff: "Slower (calls run one after another), but each step is simpler, so accuracy goes up. Gates stop a bad result early." },
  route: { tab: "Routing", name: "Routing", who: "code", when: "Inputs fall into distinct categories that are better handled separately.", example: "Refund, technical and general emails each get their own prompt and tools; easy ones go to a smaller, cheaper model.", tradeoff: "Specialised paths do better, but everything hinges on the classifier: a misrouted input gets the wrong treatment." },
  parallel: { tab: "Parallel", name: "Parallelization", who: "code", when: "Independent subtasks can run at once (sectioning), or you want several attempts for confidence (voting).", example: "Sectioning: check each contract clause separately. Voting: three independent checks flag a risky code change.", tradeoff: "Faster wall-clock time or more confidence, but more total tokens, and you must write the merge or vote logic." },
  orch: { tab: "Orchestrator", name: "Orchestrator-workers", who: "model", when: "A complex task where you cannot predict the subtasks until you see the input.", example: "A code change whose set of affected files is only known after inspecting the codebase.", tradeoff: "Adapts to each input, but cost and latency vary run to run and depend on the quality of the orchestrator's plan." },
  eval: { tab: "Evaluator", name: "Evaluator-optimizer", who: "code", when: "You have clear evaluation criteria and iterating measurably improves the result.", example: "Literary translation: generate, critique against a rubric, revise.", tradeoff: "Each round adds cost and latency. Useless without clear criteria, so cap the number of rounds." },
  agent: { tab: "Agent", name: "Autonomous agent", who: "model", when: "Open-ended problems where the steps genuinely cannot be predicted and the value justifies the spend.", example: "Investigate why checkout conversions dropped last week across web, app and email.", tradeoff: "Most flexible, but the most expensive (about 4x the tokens of a chat) and errors can compound. Needs sandboxing, guardrails, a budget cap and tracing." },
};
const ORDER: PatternId[] = ["chain", "route", "parallel", "orch", "eval", "agent"];

const ROUTES = [
  { label: "Refund request", email: "“I was charged twice”", h: "h1", why: "It's a billing problem, so it goes to the refund prompt, which has refund tools. Large refunds still hit a human gate in code." },
  { label: "Login bug", email: "“The app logs me out”", h: "h2", why: "It's technical, so it goes to the tech prompt with documentation search." },
  { label: "Easy question", email: "“When do you open?”", h: "h3", why: "It's a simple FAQ, so a smaller, faster, cheaper model handles it. Saving the big model for hard cases is a classic use of routing." },
];
const TASKS = [
  { label: "Fix README typo", files: ["README.md"] },
  { label: "Add API field", files: ["schema.ts", "api/users.ts", "users.test.ts"] },
  { label: "Rename userId", files: ["db/models.ts", "api/auth.ts", "web/profile.tsx", "jobs/sync.ts"] },
];
const SCORES = [64, 81, 93];
const FEEDBACK = ["Too literal; the idiom in line 2 is lost.", "Better, but the last stanza's rhythm is off."];

function build(p: PatternId, opt: number): Diagram {
  if (p === "chain") {
    const fail = opt === 1;
    return {
      nodes: [n("in", 10, 104, 92, "Brief", "input", "io"), n("c1", 128, 104, 110, "Call 1", "draft copy", "llm"), n("gate", 264, 104, 100, "Gate", "code check", "code"), n("c2", 390, 104, 110, "Call 2", "translate", "llm"), n("out", 526, 104, 104, "Output", "final copy", "io"), ...(fail ? [n("stop", 249, 200, 130, "Exit", "gate failed", "stop")] : [])],
      edges: [{ id: "e1", from: "in", to: "c1" }, { id: "e2", from: "c1", to: "gate" }, { id: "e3", from: "gate", to: "c2" }, { id: "e4", from: "c2", to: "out" }, ...(fail ? [{ id: "ef", from: "gate", to: "stop" }] : [])],
      steps: [
        { on: ["e1"], caption: "The brief goes to the first call, which has one focused job: write the draft." },
        { on: ["e2"], caption: "The draft goes to a gate: plain code that checks it (length, banned words, brand rules). No LLM needed." },
        fail
          ? { on: ["ef"], caption: "The check fails, so the chain exits early. The bad draft never reaches translation, so you don't pay for wasted work, and your code decides what happens next (retry, or hand to a person)." }
          : { on: ["e3"], caption: "The check passes, so the draft moves on. Call 2 only has to translate, which is an easier job than doing everything at once." },
        ...(fail ? [] : [{ on: ["e4"], caption: "Final copy. Each step was simple and testable on its own. The price: the calls ran one after another, so it's slower." }]),
      ],
    };
  }
  if (p === "route") {
    const r = ROUTES[opt];
    const i = r.h.slice(1);
    return {
      nodes: [n("in", 10, 104, 96, "Email", "customer", "io"), n("router", 136, 104, 112, "Router", "classifies", "llm"), n("h1", 300, 20, 150, "Refund prompt", "+ refund tools", "llm"), n("h2", 300, 104, 150, "Tech prompt", "+ docs search", "llm"), n("h3", 300, 188, 150, "Small model", "easy FAQ", "llm"), n("out", 510, 104, 110, "Reply", "to customer", "io")],
      edges: [{ id: "r0", from: "in", to: "router" }, ...[1, 2, 3].flatMap((k) => [{ id: `r${k}`, from: "router", to: `h${k}` }, { id: `o${k}`, from: `h${k}`, to: "out" }])],
      steps: [
        { on: ["r0"], caption: `An email arrives: ${r.email}. Nobody has sorted it yet.` },
        { on: [`r${i}`], caption: `The router (a quick LLM call, or a traditional classifier) labels it, and your code sends it down one path. ${r.why}` },
        { on: [`o${i}`], caption: "The specialist path writes the reply. The other paths never ran, so each prompt stays focused and short." },
      ],
    };
  }
  if (p === "parallel") {
    const vote = opt === 1;
    const lbl = vote ? ["Check #1", "Check #2", "Check #3"] : ["Liability", "IP rights", "Termination"];
    return {
      nodes: [n("in", 10, 104, 90, vote ? "Change" : "Contract", "input", "io"), n("split", 124, 104, 96, vote ? "Copy" : "Split", "code", "code"), ...lbl.map((l, k) => n(`w${k}`, 252, 20 + k * 84, 140, l, vote ? "same task" : "own subtask", "llm")), n("agg", 424, 104, 100, vote ? "Vote" : "Merge", vote ? "any / majority" : "combine · code", "code"), n("out", 548, 104, 82, "Result", vote ? "flag?" : "memo", "io")],
      edges: [{ id: "a", from: "in", to: "split" }, ...[0, 1, 2].flatMap((k) => [{ id: `s${k}`, from: "split", to: `w${k}` }, { id: `j${k}`, from: `w${k}`, to: "agg" }]), { id: "z", from: "agg", to: "out" }],
      steps: [
        { on: ["a"], caption: vote ? "A risky code change comes in." : "A contract comes in. Code splits it into clauses by heading." },
        { on: ["s0", "s1", "s2"], caption: vote ? "Voting: the SAME task runs three times at once (same prompt, or three differently worded ones). Different runs can catch different problems." : "Sectioning: DIFFERENT, independent subtasks run at the same time. Each call focuses on one clause type." },
        { on: ["j0", "j1", "j2"], caption: vote ? "Results come back together. Your code decides the rule: flag if any check says yes, or only if most do." : "Results come back together. Total time is about one call, not three." },
        { on: ["z"], caption: vote ? "More confidence, but you paid for three calls on one question." : "The merged findings. You defined the three subtasks in code before anything ran; that's what makes it parallelization." },
      ],
    };
  }
  if (p === "orch") {
    const files = TASKS[opt].files;
    const ys = files.length === 1 ? [106] : files.length === 3 ? [30, 106, 182] : [10, 72, 134, 196];
    return {
      nodes: [n("in", 10, 106, 96, "Task", "from user", "io"), n("orch", 136, 100, 130, "Orchestrator", "plans at run time", "llm", 64), ...files.map((f, k) => n(`w${k}`, 326, ys[k], 150, `Worker ${k + 1}`, f, "llm", 48, 1)), n("syn", 516, 106, 114, "Synthesizer", "final answer", "llm")],
      edges: [{ id: "a", from: "in", to: "orch" }, ...files.flatMap((_, k) => [{ id: `d${k}`, from: "orch", to: `w${k}` }, { id: `b${k}`, from: `w${k}`, to: "syn" }])],
      steps: [
        { on: ["a"], caption: `Task: “${TASKS[opt].label}”. Nobody wrote a list of subtasks in advance.` },
        { on: files.map((_, k) => `d${k}`), caption: `The orchestrator (an LLM) inspects the codebase and decides at run time: ${files.length} file${files.length > 1 ? "s" : ""}, so ${files.length} worker${files.length > 1 ? "s" : ""}. Try another task to see the plan change.` },
        { on: files.map((_, k) => `b${k}`), caption: "Each worker edits its file and reports back." },
        { on: [], hi: ["syn"], caption: "The results are combined into one change. Unlike parallelization, the model chose the split, not your code." },
      ],
    };
  }
  if (p === "eval") {
    const thr = opt;
    const steps: Step[] = [{ on: ["a"], caption: "The source text goes to the generator, which writes a first translation." }];
    let accepted = false;
    for (let r = 0; r < 3 && !accepted; r++) {
      const s = SCORES[r];
      steps.push({ on: ["ge"], badge: `Round ${r + 1} · score ${s}`, caption: `The evaluator grades draft ${r + 1} against the rubric: ${s}/100. The bar is ${thr}.` });
      if (s >= thr) {
        accepted = true;
        steps.push({ on: ["z"], badge: `Accepted · ${s}`, caption: `${s} clears the bar of ${thr}, so the loop stops and the translation ships after ${r + 1} round${r ? "s" : ""}.` });
      } else if (r < 2) {
        steps.push({ on: ["eg"], badge: `Round ${r + 1} · score ${s}`, caption: `Below the bar, so specific feedback goes back: “${FEEDBACK[r]}” The generator revises.` });
      } else {
        steps.push({ on: ["z"], badge: "Cap reached", caption: `Still below ${thr} after 3 rounds. Your code stops the loop at its cap and sends the best draft to a human instead of looping forever.` });
      }
    }
    return {
      nodes: [n("in", 10, 104, 96, "Source", "poem", "io"), n("gen", 146, 104, 140, "Generator", "writes / revises", "llm"), n("ev", 340, 104, 140, "Evaluator", "scores vs rubric", "llm"), n("out", 524, 104, 106, accepted ? "Output" : "Human", accepted ? "ship it" : "review", accepted ? "io" : "stop")],
      edges: [{ id: "a", from: "in", to: "gen" }, { id: "ge", from: "gen", to: "ev", off: 12 }, { id: "eg", from: "ev", to: "gen", off: 12 }, { id: "z", from: "ev", to: "out" }],
      steps,
    };
  }
  return {
    nodes: [n("human", 10, 104, 100, "Human", "sets the goal", "io"), n("agent", 180, 96, 150, "Agent", "LLM in a loop", "llm", 68), n("env", 456, 104, 170, "Environment", "tools · data · APIs", "code"), n("stop", 190, 200, 130, "Stop", "done or budget cap", "stop")],
    edges: [{ id: "g", from: "human", to: "agent", off: 10 }, { id: "c", from: "agent", to: "human", off: 10 }, { id: "act", from: "agent", to: "env", off: 12 }, { id: "obs", from: "env", to: "agent", off: 12 }, { id: "end", from: "agent", to: "stop" }],
    steps: [
      { on: ["g"], caption: "You give a goal, not a script: “Find out why checkout conversions dropped.” Nobody lists the steps." },
      { on: ["act"], badge: "Turn 1", caption: "Claude picks its own first action: query last week's checkout data." },
      { on: ["obs"], badge: "Turn 1", caption: "Real results come back from the environment. This ground truth steers what happens next." },
      { on: ["act"], badge: "Turn 2", caption: "Based on what it saw, it chooses a step nobody planned: compare the app funnel with the web funnel." },
      { on: ["obs"], badge: "Turn 2", caption: "The app numbers look different. Each turn costs tokens, and a wrong turn can compound." },
      { on: ["c"], badge: "Checkpoint", caption: "It shows its plan and findings to a human. Showing its reasoning like this (transparency) is one of Anthropic's three agent principles." },
      { on: ["end"], badge: "Stop", caption: "It stops when the task is done, or when a guardrail fires: a turn limit or a budget cap." },
    ],
  };
}

function anchors(a: Node, b: Node, off = 0) {
  const ax = a.x + a.w / 2, ay = a.y + a.h / 2, bx = b.x + b.w / 2, by = b.y + b.h / 2;
  // Math.sqrt is correctly rounded everywhere (Math.hypot is not), so server and browser agree.
  const dx = bx - ax, dy = by - ay, len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / len, uy = dy / len, px = -uy * off, py = ux * off;
  const clip = (m: Node) => Math.min(ux ? m.w / 2 / Math.abs(ux) : 1e9, uy ? m.h / 2 / Math.abs(uy) : 1e9);
  const s = clip(a) + 3, e = clip(b) + 5;
  const r = (v: number) => Math.round(v * 100) / 100;
  return { x1: r(ax + ux * s + px), y1: r(ay + uy * s + py), x2: r(bx - ux * e + px), y2: r(by - uy * e + py) };
}

const DEFAULT_OPT: Record<PatternId, number> = { chain: 0, route: 0, parallel: 0, orch: 1, eval: 85, agent: 0 };

const QUIZ: { q: string; answer: PatternId; why: string }[] = [
  { q: "Customer emails about orders, returns and warranties each need different instructions and tools.", answer: "route", why: "Distinct input categories that are better handled separately: classify, then send each to its own prompt and toolset." },
  { q: "Extract fields from a claim, validate them in code, and only then write the letter.", answer: "chain", why: "Fixed, known steps in order, with a programmatic gate between them. That is prompt chaining." },
  { q: "Rename a field across a codebase where you only learn which files are affected after looking.", answer: "orch", why: "The subtasks can't be known in advance, so an LLM decides them at run time. With parallelization, you would have to fix the subtasks in code beforehand." },
];

export default function WorkflowPatterns() {
  const reduce = useHydratedReducedMotion();
  const [pattern, setPattern] = useState<PatternId>("chain");
  const [opt, setOpt] = useState(DEFAULT_OPT.chain);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const panRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const d = build(pattern, opt);
  const last = d.steps.length - 1;
  const cur = d.steps[Math.min(step, last)];
  const meta = META[pattern];
  const byId = Object.fromEntries(d.nodes.map((x) => [x.id, x]));
  const used = new Set(d.steps.flatMap((s) => s.on));
  const active = new Set(cur.on);
  const lit = new Set([...cur.on.flatMap((id) => { const e = d.edges.find((x) => x.id === id); return e ? [e.from, e.to] : []; }), ...(cur.hi ?? [])]);
  const visible = d.nodes.filter((x) => x.from === undefined || step >= x.from);
  const shown = new Set(visible.map((x) => x.id));
  const litXs = d.nodes.filter((x) => lit.has(x.id)).map((x) => x.x + x.w / 2);
  const focusX = litXs.length ? litXs.reduce((a, b) => a + b, 0) / litXs.length : 320;

  // On narrow screens the diagram is wider than the card and pans sideways; keep the action in view.
  useEffect(() => {
    const box = panRef.current, svg = svgRef.current;
    if (!box || !svg || box.scrollWidth <= box.clientWidth + 4) return;
    const left = Math.max(0, (focusX * svg.clientWidth) / 640 - box.clientWidth / 2);
    box.scrollTo({ left, behavior: reduce ? "auto" : "smooth" });
  }, [focusX, reduce]);

  useEffect(() => {
    if (!playing) return;
    if (step >= last) {
      const t = setTimeout(() => setPlaying(false), 0);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setStep((s) => Math.min(last, s + 1)), 2400);
    return () => clearTimeout(t);
  }, [playing, step, last]);

  const pick = (p: PatternId) => { setPattern(p); setOpt(DEFAULT_OPT[p]); setStep(0); setPlaying(false); };
  const show = (p: PatternId) => { pick(p); tabRefs.current[ORDER.indexOf(p)]?.focus(); };
  const choose = (o: number) => { setOpt(o); setStep(0); };
  const next = () => setStep((s) => Math.min(last, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));
  const onStepKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") { e.preventDefault(); next(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); back(); }
  };
  const onTabKey = (e: KeyboardEvent, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const j = (i + (e.key === "ArrowRight" ? 1 : ORDER.length - 1)) % ORDER.length;
    pick(ORDER[j]);
    tabRefs.current[j]?.focus();
  };

  const options: { label: string; aria: string }[] | null =
    pattern === "chain" ? [{ label: "Gate passes", aria: "Show the gate passing" }, { label: "Gate fails", aria: "Show the gate failing" }]
    : pattern === "route" ? ROUTES.map((r) => ({ label: r.label, aria: `Route a ${r.label.toLowerCase()}` }))
    : pattern === "parallel" ? [{ label: "Sectioning", aria: "Show sectioning" }, { label: "Voting", aria: "Show voting" }]
    : pattern === "orch" ? TASKS.map((t) => ({ label: t.label, aria: `Task: ${t.label}` }))
    : null;

  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="Workflow patterns" className="flex flex-wrap gap-1">
        {ORDER.map((p, i) => (
          <button key={p} ref={(el) => { tabRefs.current[i] = el; }} type="button" role="tab" aria-selected={p === pattern} aria-controls="wp-panel" aria-label={META[p].name} tabIndex={p === pattern ? 0 : -1} onClick={() => pick(p)} onKeyDown={(e) => onTabKey(e, i)}
            className={clsx("relative shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors", p === pattern ? "text-accent-ink" : "text-ink-2 hover:bg-surface-2")}>
            {p === pattern && <motion.span layoutId="wp-tab" className="absolute inset-0 rounded-lg bg-accent" transition={{ duration: reduce ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }} />}
            <span className="relative">
              <span className="mr-1.5 font-mono text-xs opacity-70" aria-hidden="true">{i < 5 ? i + 1 : "★"}</span>
              {META[p].tab}
            </span>
          </button>
        ))}
      </div>

      {/* Always stacked: beside the detail card the diagram would shrink its labels below ~11px. */}
      <div id="wp-panel" role="tabpanel" className="grid min-w-0 gap-4">
        <div className="min-w-0 space-y-3">
          <div className="min-w-0 rounded-xl bg-surface-2/50 p-3 @xl:hidden" role="img" aria-label={`${meta.name}, step ${step + 1} of ${d.steps.length}: ${cur.caption}`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Current step {cur.badge ? `· ${cur.badge}` : ""}</p>
            <ol className="mt-3 grid min-w-0 gap-2">
              {cur.on.length ? cur.on.map((id) => {
                const e = d.edges.find((x) => x.id === id);
                if (!e || !shown.has(e.from) || !shown.has(e.to)) return null;
                return <li key={id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch gap-2">
                  {[e.from, e.to].map((nodeId, i) => <div key={`${nodeId}-${i}`} className="min-w-0 rounded-xl border-2 border-accent-strong bg-surface px-2 py-3 text-center">
                    <p className="font-display text-sm font-semibold wrap-anywhere text-ink">{byId[nodeId].label}</p>
                    <p className="text-xs wrap-anywhere text-ink-2">{byId[nodeId].sub}</p>
                  </div>).flatMap((node, i) => i === 0 ? [node, <span key="arrow" className="self-center text-xl text-accent-text" aria-hidden>→</span>] : [node])}
                </li>;
              }) : visible.filter((x) => lit.has(x.id)).map((x) => <li key={x.id} className="min-w-0 rounded-xl border-2 border-accent-strong bg-surface px-3 py-2">
                <p className="font-display text-sm font-semibold wrap-anywhere text-ink">{x.label}</p>
                <p className="text-xs wrap-anywhere text-ink-2">{x.sub}</p>
              </li>)}
            </ol>
          </div>
          <div ref={panRef} className="hidden max-w-full min-w-0 overflow-x-auto rounded-xl bg-surface-2/50 p-2 @xl:block" tabIndex={0} role="group" aria-label={`${meta.name} diagram. Use left and right arrow keys to step.`} onKeyDown={onStepKey}>
            <svg ref={svgRef} viewBox="0 0 640 260" className="h-auto w-full min-w-[560px]" role="img" aria-label={`${meta.name}, step ${step + 1} of ${d.steps.length}: ${cur.caption}`}>
              <defs>
                {[["wp-a", "var(--line-strong)"], ["wp-a-on", "var(--accent-strong)"]].map(([id, c]) => (
                  <marker key={id} id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M0 0 L10 5 L0 10 z" fill={c} />
                  </marker>
                ))}
              </defs>
              {cur.badge ? (
                <text x={632} y={18} textAnchor="end" fill="var(--accent-text)" style={{ font: "600 13px var(--font-mono)" }}>{cur.badge}</text>
              ) : null}
              {d.edges.filter((e) => shown.has(e.from) && shown.has(e.to)).map((e) => {
                const g = anchors(byId[e.from], byId[e.to], e.off);
                const on = active.has(e.id);
                return (
                  <line key={`${pattern}-${e.id}`} {...g} stroke={on ? "var(--accent-strong)" : "var(--line-strong)"} strokeWidth={on ? 2.5 : 1.25} strokeDasharray={used.has(e.id) ? undefined : "4 5"} opacity={used.has(e.id) ? 1 : 0.6}
                    markerEnd={on ? "url(#wp-a-on)" : "url(#wp-a)"} style={{ transition: "stroke 200ms ease, stroke-width 200ms ease" }} />
                );
              })}
              <AnimatePresence>
                {visible.map((x) => {
                  const on = lit.has(x.id);
                  const fill = x.kind === "llm" ? "var(--ink)" : x.kind === "code" ? "var(--surface-2)" : x.kind === "stop" ? "var(--bad-soft)" : "var(--surface)";
                  return (
                    <motion.g key={`${pattern}-${x.id}`} initial={reduce ? false : { opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.35, ease: [0.22, 1, 0.36, 1] }} style={{ transformOrigin: `${x.x + x.w / 2}px ${x.y + x.h / 2}px` }}>
                      <rect x={x.x} y={x.y} width={x.w} height={x.h} rx={14} fill={fill}
                        stroke={on ? "var(--accent-strong)" : x.kind === "stop" ? "var(--bad)" : "var(--line-strong)"} strokeWidth={on ? 2.5 : 1.25} strokeDasharray={x.kind === "code" ? "5 4" : undefined} style={{ transition: "stroke 200ms ease" }} />
                      <text x={x.x + x.w / 2} y={x.y + x.h / 2 - 3} textAnchor="middle" fill={x.kind === "llm" ? "var(--bg)" : "var(--ink)"} style={{ font: "600 16px var(--font-display)" }}>{x.label}</text>
                      {/* --surface-2 and --bad keep AA contrast on the ink / bad-soft fills in both themes (accent on light ink fails in dark mode). */}
                      <text x={x.x + x.w / 2} y={x.y + x.h / 2 + 15} textAnchor="middle" fill={x.kind === "llm" ? "var(--surface-2)" : x.kind === "stop" ? "var(--bad)" : "var(--muted)"} style={{ font: "500 13px var(--font-sans)" }}>{x.sub}</text>
                    </motion.g>
                  );
                })}
              </AnimatePresence>
              {cur.on.map((id) => {
                const e = d.edges.find((x) => x.id === id);
                if (!e || !shown.has(e.to)) return null;
                const g = anchors(byId[e.from], byId[e.to], e.off);
                return (
                  <motion.circle key={`${pattern}-${opt}-${step}-${id}`} r={6.5} fill="var(--accent)" stroke="var(--accent-ink)" strokeWidth={1.5}
                    initial={reduce ? { cx: g.x2, cy: g.y2 } : { cx: g.x1, cy: g.y1, opacity: 0 }} animate={{ cx: g.x2, cy: g.y2, opacity: 1 }}
                    transition={{ duration: reduce ? 0 : 0.8, ease: [0.22, 1, 0.36, 1], delay: reduce ? 0 : 0.1 }} />
                );
              })}
            </svg>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
            <span className="flex items-center gap-1.5"><span className="inline-block size-3 rounded bg-ink" /> LLM call (the model)</span>
            <span className="flex items-center gap-1.5"><span className="inline-block size-3 rounded border border-dashed border-line-strong bg-surface-2" /> Plain code (no model)</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-0 w-4 border-t border-dashed border-line-strong" /> Path not taken</span>
          </div>

          {options ? (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Try a variation">
              {options.map((o, i) => (
                <button key={o.label} type="button" aria-label={o.aria} aria-pressed={opt === i} onClick={() => choose(i)}
                  className={clsx("rounded-full border px-3 py-1 text-xs font-medium transition-colors active:scale-95", opt === i ? "border-accent-strong bg-accent-soft text-ink" : "border-line text-ink-2 hover:border-line-strong")}>
                  {o.label}
                </button>
              ))}
            </div>
          ) : pattern === "eval" ? (
            <label className="flex items-center gap-3 text-sm text-ink-2">
              <span className="shrink-0">Quality bar</span>
              <input type="range" min={60} max={95} step={5} value={opt} onChange={(e) => choose(Number(e.target.value))} aria-label="Quality bar the evaluator requires" className="w-full accent-[var(--accent-strong)]" />
              <span className="w-8 shrink-0 font-mono text-ink tabular">{opt}</span>
            </label>
          ) : (
            <p className="text-xs text-muted">No variations here: the path is different every run, because the model chooses it.</p>
          )}
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={pattern} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, y: -4 }} transition={{ duration: reduce ? 0 : 0.25 }}
            className="flex min-w-0 flex-col gap-3 rounded-xl border border-line bg-bg/60 p-4">
            <div>
              <p className="font-display text-lg font-semibold text-ink">{meta.name}</p>
              <div className="mt-1 flex flex-wrap gap-1.5 text-xs font-medium text-ink">
                <span className={clsx("rounded-full px-2 py-0.5", pattern === "agent" ? "bg-accent-soft" : "bg-surface-2")}>{pattern === "agent" ? "Not a workflow: an agent" : "Workflow pattern"}</span>
                <span className={clsx("rounded-full px-2 py-0.5", meta.who === "code" ? "bg-info-soft" : "bg-accent-soft")}>
                  {pattern === "orch" ? "Shape fixed by code; subtasks chosen by the model" : meta.who === "code" ? "Steps decided by your code, in advance" : "Steps decided by the model, at run time"}
                </span>
              </div>
            </div>
            <Fact title="Use it when">{meta.when}</Fact>
            <Fact title="Example">{meta.example}</Fact>
            <Fact title="Trade-off">{meta.tradeoff}</Fact>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex flex-col gap-3 @xl:flex-row @xl:items-center @xl:justify-between">
        <p className="min-h-12 min-w-0 text-[0.95rem] text-ink-2" aria-live="polite">
          <span className="mr-2 font-display font-semibold text-ink tabular">{step + 1}/{d.steps.length}</span>
          {cur.caption}
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          <CtrlButton label="Previous step" onClick={back} disabled={step === 0}><ChevronLeft size={18} /></CtrlButton>
          <CtrlButton label={playing ? "Pause" : "Play"} onClick={() => { if (step >= last) setStep(0); setPlaying((p) => !p); }}>{playing ? <Pause size={16} /> : <Play size={16} />}</CtrlButton>
          <CtrlButton label="Next step" onClick={next} disabled={step === last}><ChevronRight size={18} /></CtrlButton>
          <CtrlButton label="Reset" onClick={() => { setPlaying(false); setStep(0); }}><RotateCcw size={16} /></CtrlButton>
        </div>
      </div>

      <Quiz reduce={!!reduce} onShow={show} />
    </div>
  );
}

function Quiz({ reduce, onShow }: { reduce: boolean; onShow: (p: PatternId) => void }) {
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<PatternId | null>(null);
  const [score, setScore] = useState(0);
  const done = i >= QUIZ.length;
  const q = QUIZ[Math.min(i, QUIZ.length - 1)];
  const answer = (p: PatternId) => { if (picked) return; setPicked(p); if (p === q.answer) setScore((s) => s + 1); };
  const advance = () => { setPicked(null); setI((x) => x + 1); };
  const restart = () => { setI(0); setPicked(null); setScore(0); };

  return (
    <section className="rounded-xl border border-line bg-surface-2/40 p-4" aria-label="Quiz: which pattern fits this scenario?">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-display text-base font-semibold text-ink">Which pattern fits this scenario?</p>
        <span className="font-mono text-xs text-muted tabular">{done ? `${score}/${QUIZ.length}` : `${i + 1}/${QUIZ.length} · score ${score}`}</span>
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={done ? "done" : i} initial={reduce ? false : { opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={reduce ? undefined : { opacity: 0, x: -12 }} transition={{ duration: reduce ? 0 : 0.25 }} className="mt-3 space-y-3">
          {done ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-ink-2" aria-live="polite">
                {score === QUIZ.length ? "All three right. You can tell the patterns apart by asking who decides the steps, and when." : "Tip: ask who decides the steps. Your code, before the run: chaining, routing, parallelization or an evaluator loop. The model, during the run: orchestrator-workers (still a workflow with a fixed shape) or a full agent."}
              </p>
              <button type="button" onClick={restart} aria-label="Restart quiz" className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:border-ink">Try again</button>
            </div>
          ) : (
            <>
              <p className="text-[0.95rem] text-ink">{q.q}</p>
              <div className="grid grid-cols-2 gap-1.5 @xl:grid-cols-3">
                {ORDER.map((p) => {
                  const right = picked && p === q.answer, wrong = picked === p && p !== q.answer;
                  return (
                    <button key={p} type="button" onClick={() => answer(p)} disabled={!!picked} aria-label={`Answer: ${META[p].name}`}
                      className={clsx("flex min-w-0 items-center justify-between gap-1 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors",
                        right ? "border-good bg-good-soft text-ink" : wrong ? "border-bad bg-bad-soft text-ink" : "border-line bg-surface text-ink-2 enabled:hover:border-line-strong disabled:opacity-60")}>
                      {META[p].name}
                      {right ? <Check size={15} className="shrink-0 text-good" /> : wrong ? <X size={15} className="shrink-0 text-bad" /> : null}
                    </button>
                  );
                })}
              </div>
              <div aria-live="polite">
                {picked ? (
                  <div className="flex flex-col gap-2 @xl:flex-row @xl:items-start @xl:justify-between">
                    <p className="min-w-0 text-sm text-ink-2">
                      <span className={clsx("font-semibold", picked === q.answer ? "text-good" : "text-bad")}>{picked === q.answer ? "Correct. " : `Not quite: it's ${META[q.answer].name}. `}</span>
                      {q.why}
                    </p>
                    <div className="flex shrink-0 gap-1.5">
                      <button type="button" onClick={() => onShow(q.answer)} aria-label={`Show ${META[q.answer].name} in the diagram`} className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-2 hover:border-line-strong">See it</button>
                      <button type="button" onClick={advance} aria-label="Next scenario" className="rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-bg">{i === QUIZ.length - 1 ? "Finish" : "Next"}</button>
                    </div>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}

function Fact({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">{title}</p>
      <p className="mt-0.5 text-sm text-ink-2">{children}</p>
    </div>
  );
}

function CtrlButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label}
      className="hit-44 grid size-9 place-items-center rounded-xl border border-line-strong bg-surface text-ink transition-colors hover:border-ink active:scale-95 disabled:opacity-40">
      {children}
    </button>
  );
}
