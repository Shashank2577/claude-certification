"use client";

import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import clsx from "clsx";
import { Ban, ChevronLeft, ChevronRight, MessageSquareReply, Pause, Play, RefreshCw, RotateCcw, ShieldCheck, Wrench } from "lucide-react";

type EvId = "SessionStart" | "UserPromptSubmit" | "PreToolUse" | "PostToolUse" | "Stop" | "SessionEnd" | "SubagentStop" | "PreCompact" | "Notification";
type NodeId = EvId | "tool";
type Block = "yes" | "no" | "feedback";
type Tone = "neutral" | "good" | "bad" | "blocked";
type Guard = "off" | "exit1" | "exit2";

interface EventInfo {
  sub: string;
  when: string;
  matcher: string;
  block: Block;
  power: string;
  example: { title: string; code: string };
  plain: string;
}

const EVENTS: Record<EvId, EventInfo> = {
  SessionStart: {
    sub: "session opens or resumes",
    when: "When a session starts, resumes, or restarts after /clear or compaction.",
    matcher: "startup | resume | clear | compact | fork",
    block: "no",
    power: "Plain stdout is added to Claude's context. Exit 2 does not block here; stderr is only shown to you.",
    example: { title: "Load this sprint's tickets as context", code: '"SessionStart": [{ "matcher": "startup",\n  "hooks": [{ "type": "command", "command": "cat .claude/sprint.md" }] }]' },
    plain: "A briefing handed to Claude as it walks in. It adds context; it can't stop anything.",
  },
  UserPromptSubmit: {
    sub: "you press enter",
    when: "After you submit a prompt, before Claude sees it.",
    matcher: "No matcher: runs on every prompt",
    block: "yes",
    power: 'Exit 2 blocks the prompt so it never reaches Claude. JSON {"decision": "block"} does the same. Plain stdout is added as context.',
    example: { title: "Reject prompts that contain an API key", code: "jq -r .prompt | grep -qE 'sk-[A-Za-z0-9]' &&\n  { echo 'Prompt contains a secret' >&2; exit 2; }" },
    plain: "A check on your message at the door, before Claude reads a word of it.",
  },
  PreToolUse: {
    sub: "before a tool runs",
    when: "After Claude chooses a tool call, before it runs.",
    matcher: "Tool name, case-sensitive: Bash, Edit|Write, mcp__.*",
    block: "yes",
    power: "Exit 2 blocks the call and sends stderr back to Claude. Or exit 0 with JSON permissionDecision: allow | deny | ask | defer, plus updatedInput to rewrite the arguments.",
    example: { title: "Block rm -rf", code: "jq -r .tool_input.command | grep -q 'rm -rf' &&\n  { echo 'rm -rf is blocked. Use pnpm clean.' >&2; exit 2; }" },
    plain: "The main checkpoint. This is where you stop a tool call before anything happens.",
  },
  PostToolUse: {
    sub: "after a tool succeeds",
    when: "Right after a tool call succeeds, before Claude reasons over the result.",
    matcher: "Tool name: Edit|Write, ^mcp__ …",
    block: "feedback",
    power: "Can't undo anything because the tool already ran. Exit 2 or decision: block only sends a message back to Claude. updatedToolOutput can replace what Claude sees.",
    example: { title: "Auto-format after every edit", code: '"PostToolUse": [{ "matcher": "Edit|Write",\n  "hooks": [{ "type": "command",\n    "command": "npx prettier --write \\"$(jq -r .tool_input.file_path)\\"" }] }]' },
    plain: "The cleanup crew: format files, normalise data (e.g. every date to ISO 8601), log, or warn Claude.",
  },
  Stop: {
    sub: "Claude is about to finish",
    when: "When Claude is about to end its turn.",
    matcher: "No matcher: always runs",
    block: "yes",
    power: 'Exit 2 (or {"decision": "block"}) stops Claude from stopping. It keeps working, guided by your reason.',
    example: { title: "Don't finish until tests pass", code: "npm test >/dev/null 2>&1 ||\n  { echo 'Tests still failing. Keep going.' >&2; exit 2; }" },
    plain: "A final checklist Claude must pass before it's allowed to say \"done\".",
  },
  SessionEnd: {
    sub: "session closes",
    when: "When the session ends (you exit, /clear, log out).",
    matcher: "End reason: clear | resume | logout | prompt_input_exit | other",
    block: "no",
    power: "Can't block: exit 2 only shows stderr to you. Use it for cleanup and logging.",
    example: { title: "Write a session log", code: "jq -c '{session_id, cwd}' >> ~/.claude/sessions.log" },
    plain: "Turning off the lights on the way out. It can't keep the session open.",
  },
  SubagentStop: {
    sub: "a subagent is about to finish",
    when: "When a subagent is about to return its result.",
    matcher: "Agent type: Explore, Plan, general-purpose, or a custom agent name",
    block: "yes",
    power: "Like Stop, but for subagents: exit 2 keeps the subagent working.",
    example: { title: "Require sources in research results", code: "./scripts/check-report.sh ||\n  { echo 'Add your sources before finishing.' >&2; exit 2; }" },
    plain: "The same \"are you really done?\" check, for helpers Claude sends off.",
  },
  PreCompact: {
    sub: "before context is compacted",
    when: "Before the conversation is summarised to free up context.",
    matcher: "manual | auto",
    block: "yes",
    power: "Exit 2 blocks the compaction.",
    example: { title: "Back up the transcript first", code: 'cp "$(jq -r .transcript_path)" ~/backups/' },
    plain: "A last chance to save the full conversation before it gets summarised.",
  },
  Notification: {
    sub: "Claude needs your attention",
    when: "When Claude Code sends a notification, e.g. it needs permission or is waiting for you.",
    matcher: "Notification type: permission_prompt | idle_prompt | auth_success | …",
    block: "no",
    power: "Exit code and stderr are ignored. It can only react.",
    example: { title: "Desktop alert", code: "osascript -e 'display notification \"Claude needs you\"'" },
    plain: "A doorbell. It tells you something happened; it changes nothing.",
  },
};

const RAIL: NodeId[] = ["SessionStart", "UserPromptSubmit", "PreToolUse", "tool", "PostToolUse", "Stop", "SessionEnd"];
const SIDE: EvId[] = ["SubagentStop", "PreCompact", "Notification"];
const ALL: EvId[] = [...(RAIL.filter((n) => n !== "tool") as EvId[]), ...SIDE];

interface Step {
  node: NodeId;
  tone: Tone;
  log: string;
  caption: string;
}

function buildSteps(g: Guard): Step[] {
  const pre: Step =
    g === "exit2"
      ? { node: "PreToolUse", tone: "good", log: "Bash rm -rf build/ → exit 2 · “rm -rf is blocked. Use pnpm clean.”", caption: "Claude asks to run rm -rf build/. The guard exits 2, so Claude Code blocks the call and hands the hook's message back to Claude." }
      : g === "exit1"
        ? { node: "PreToolUse", tone: "bad", log: "Bash rm -rf build/ → exit 1 (non-blocking error)", caption: "The guard spots rm -rf but exits 1. Only exit 2 blocks. Any other non-zero code is a non-blocking error, so the call goes ahead." }
        : { node: "PreToolUse", tone: "neutral", log: "Bash rm -rf build/ → no hook configured", caption: "Claude asks to run rm -rf build/. No PreToolUse hook is configured, so nothing checks it." };
  const tool: Step[] =
    g === "exit2"
      ? [
          { node: "tool", tone: "blocked", log: "rm -rf build/ never ran", caption: "The command never runs. The hook runs in Claude Code, outside the model, so no wording in the conversation can get round it." },
          { node: "PreToolUse", tone: "good", log: "Bash pnpm clean → exit 0", caption: "Claude reads the reason and changes course: it asks for pnpm clean instead. PreToolUse fires again, and this time the guard exits 0." },
          { node: "tool", tone: "neutral", log: "pnpm clean ✓", caption: "The safe command runs." },
        ]
      : [
          {
            node: "tool",
            tone: "bad",
            log: "rm -rf build/ ran",
            caption: g === "exit1" ? "The destructive command runs even though a guard existed. A guard that exits 1 protects nothing." : "The destructive command runs. A CLAUDE.md rule might have discouraged it, but nothing enforced it.",
          },
        ];
  return [
    { node: "SessionStart", tone: "neutral", log: "stdout → context: “Sprint 14: fix the flaky login test”", caption: "The session opens. A SessionStart hook prints this sprint's tickets, and that text is added to Claude's context." },
    { node: "UserPromptSubmit", tone: "neutral", log: "“Clear the build folder, then fix the login test” → exit 0", caption: "You press enter. A UserPromptSubmit hook checks the prompt before Claude sees it, finds no secrets, and exits 0." },
    pre,
    ...tool,
    g === "off"
      ? { node: "PreToolUse", tone: "neutral", log: "Edit src/login.test.ts → no hook configured", caption: "Next Claude wants to edit a file. PreToolUse fires before every tool call, but with no hook configured it passes straight through." }
      : { node: "PreToolUse", tone: "neutral", log: "Edit src/login.test.ts → guard matcher is Bash, skipped", caption: "Next Claude wants to edit a file. PreToolUse fires before every tool call, but the guard's matcher is Bash, so it doesn't run for Edit." },
    { node: "tool", tone: "neutral", log: "Edit src/login.test.ts ✓", caption: "The edit is applied." },
    { node: "PostToolUse", tone: "good", log: "Edit|Write → prettier --write src/login.test.ts", caption: "PostToolUse fires after the edit succeeds and runs the formatter. It can't undo the edit, but it can tidy up or send feedback to Claude." },
    { node: "Stop", tone: "good", log: "npm test → pass → exit 0", caption: "Claude is ready to finish. A Stop hook runs the tests; they pass, so it exits 0. Had they failed, exit 2 would have kept Claude working." },
    { node: "SessionEnd", tone: "neutral", log: "session log written", caption: "You close the session. SessionEnd runs cleanup. It can't block anything because the session is already ending." },
  ];
}

const TONE: Record<Tone, { c: string; soft: string }> = {
  neutral: { c: "var(--accent-strong)", soft: "var(--accent-soft)" },
  good: { c: "var(--good)", soft: "var(--good-soft)" },
  bad: { c: "var(--bad)", soft: "var(--bad-soft)" },
  blocked: { c: "var(--bad)", soft: "var(--bad-soft)" },
};

const GUARDS: { id: Guard; label: string; code: string }[] = [
  { id: "off", label: "No hook", code: "# no PreToolUse hook configured" },
  { id: "exit1", label: "Hook exits 1", code: "grep -q 'rm -rf' && { echo 'blocked' >&2; exit 1; }" },
  { id: "exit2", label: "Hook exits 2", code: "grep -q 'rm -rf' && { echo 'blocked' >&2; exit 2; }" },
];

export default function HooksLifecycle() {
  const reduce = useReducedMotion();
  const [mode, setMode] = useState<"explore" | "simulate">("explore");
  const [sel, setSel] = useState<EvId>("PreToolUse");
  const [guard, setGuard] = useState<Guard>("exit2");
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const steps = buildSteps(guard);
  const last = steps.length - 1;
  const cur = steps[Math.min(step, last)];
  const spring = reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 420, damping: 34 };

  useEffect(() => {
    if (!playing || mode !== "simulate") return;
    if (step >= last) {
      const t = setTimeout(() => setPlaying(false), 0);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setStep((s) => Math.min(last, s + 1)), 2400);
    return () => clearTimeout(t);
  }, [playing, step, last, mode]);

  const next = () => setStep((s) => Math.min(last, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));
  const pickGuard = (g: Guard) => {
    setGuard(g);
    setStep((s) => (s > 2 ? 2 : s)); // jump back to the decision point so the fork is visible
  };
  const onKey = (e: KeyboardEvent) => {
    const fwd = e.key === "ArrowRight" || e.key === "ArrowDown";
    const bwd = e.key === "ArrowLeft" || e.key === "ArrowUp";
    if (!fwd && !bwd) return;
    e.preventDefault();
    if (mode === "simulate") (fwd ? next : back)();
    else setSel((s) => ALL[(ALL.indexOf(s) + (fwd ? 1 : ALL.length - 1)) % ALL.length]);
  };

  const activeNode: NodeId = mode === "simulate" ? cur.node : sel;
  const tone = mode === "simulate" ? TONE[cur.tone] : TONE.neutral;
  const visited = new Set(steps.slice(0, step + 1).map((s) => s.node));
  const toolBlocked = mode === "simulate" && cur.node === "tool" && cur.tone === "blocked";
  const info = EVENTS[sel];

  const row = (id: EvId) => {
    const on = activeNode === id;
    const e = EVENTS[id];
    return (
      <button
        key={id}
        type="button"
        onClick={() => {
          setMode("explore");
          setPlaying(false);
          setSel(id);
        }}
        aria-label={`${id}: ${e.sub}. ${blockLabel(e.block)}. Show details.`}
        aria-pressed={mode === "explore" && on}
        className="relative flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-surface-2/70"
      >
        {on ? <motion.span layoutId="hl-active" className="absolute inset-0 rounded-xl border-2" style={{ borderColor: tone.c, background: tone.soft }} transition={spring} /> : null}
        <span
          className="relative z-10 size-3 shrink-0 rounded-full border-2"
          style={{ borderColor: on ? tone.c : "var(--line-strong)", background: on || (mode === "simulate" && visited.has(id)) ? (on ? tone.c : "var(--line-strong)") : "var(--surface)" }}
        />
        <span className="relative z-10 min-w-0 flex-1">
          <span className="block font-mono text-[13px] font-semibold text-ink">{id}</span>
          <span className="block text-xs text-muted">{e.sub}</span>
        </span>
        <BlockBadge block={e.block} />
      </button>
    );
  };

  return (
    <div className="space-y-4" onKeyDown={onKey}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-xl border border-line bg-surface-2/60 p-1" role="group" aria-label="Mode">
          {(["explore", "simulate"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              aria-label={m === "explore" ? "Explore events" : "Simulate a session"}
              onClick={() => {
                setMode(m);
                setPlaying(false);
              }}
              className={clsx("rounded-lg px-3 py-1.5 text-sm font-medium transition-colors", mode === m ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink")}
            >
              {m === "explore" ? "Explore events" : "Simulate a session"}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">Arrow keys move through {mode === "explore" ? "events" : "steps"}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="rounded-xl bg-surface-2/50 p-2" tabIndex={0} role="group" aria-label="One Claude Code session, top to bottom">
          <div className="relative">
            <span className="absolute top-5 bottom-5 left-[18px] w-px -translate-x-1/2 bg-line-strong" aria-hidden />
            {row("SessionStart")}
            {row("UserPromptSubmit")}
            {row("PreToolUse")}
            <motion.div
              key={toolBlocked ? `blocked-${step}` : "tool"}
              animate={toolBlocked && !reduce ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }}
              transition={{ duration: 0.4 }}
              className="relative flex items-center gap-3 rounded-xl px-3 py-2"
            >
              {activeNode === "tool" ? <motion.span layoutId="hl-active" className="absolute inset-0 rounded-xl border-2 border-dashed" style={{ borderColor: tone.c, background: tone.soft }} transition={spring} /> : null}
              <span className="relative z-10 grid size-3 shrink-0 place-items-center" aria-hidden>
                <Wrench size={12} style={{ color: activeNode === "tool" ? tone.c : "var(--muted)" }} />
              </span>
              <span className="relative z-10 min-w-0 flex-1">
                <span className={clsx("block text-[13px] font-semibold text-ink-2", toolBlocked && "line-through")}>the tool runs</span>
                <span className="block text-xs text-muted">not a hook: the action itself</span>
              </span>
              {toolBlocked ? (
                <span className="relative z-10 inline-flex items-center gap-1 rounded-full bg-bad px-2 py-0.5 text-xs font-semibold text-surface">
                  <Ban size={12} /> never ran
                </span>
              ) : null}
            </motion.div>
            {row("PostToolUse")}
            <p className="flex items-center gap-1.5 py-1 pl-9 text-xs text-muted">
              <RefreshCw size={12} aria-hidden /> PreToolUse → tool → PostToolUse repeats for every tool call
            </p>
            {row("Stop")}
            {row("SessionEnd")}
          </div>
          <p className="mt-3 px-3 text-xs font-medium text-muted">Also fires when needed</p>
          <div className="mt-1">{SIDE.map(row)}</div>
        </div>

        <div className="flex min-h-72 flex-col rounded-xl border border-line bg-bg/60 p-3">
          <AnimatePresence mode="wait" initial={false}>
            {mode === "explore" ? (
              <motion.div key={`ex-${sel}`} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0 }} transition={{ duration: 0.18 }} className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-mono text-base font-semibold text-ink">{sel}</p>
                  <BlockBadge block={info.block} />
                </div>
                <p className="text-sm text-ink-2">{info.plain}</p>
                <dl className="space-y-2 text-sm">
                  <Fact k="Fires">{info.when}</Fact>
                  <Fact k="Matcher">
                    <span className="font-mono text-xs">{info.matcher}</span>
                  </Fact>
                  <Fact k="Power">{info.power}</Fact>
                </dl>
                <div>
                  <p className="text-xs font-medium text-accent-text">Example: {info.example.title}</p>
                  <pre className="mt-1 overflow-x-auto rounded-lg border border-line bg-surface p-2.5 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-ink">{info.example.code}</pre>
                </div>
              </motion.div>
            ) : (
              <motion.div key="sim" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={reduce ? undefined : { opacity: 0 }} transition={{ duration: 0.18 }} className="flex flex-1 flex-col">
                <p className="text-xs font-medium text-muted">PreToolUse guard on Bash</p>
                <div className="mt-1 grid grid-cols-3 gap-1 rounded-xl border border-line bg-surface-2/60 p-1" role="group" aria-label="PreToolUse guard hook">
                  {GUARDS.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      aria-pressed={guard === g.id}
                      aria-label={`Guard: ${g.label}`}
                      onClick={() => pickGuard(g.id)}
                      className={clsx("rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors", guard === g.id ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink")}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
                <pre className="mt-2 overflow-x-auto rounded-lg border border-line bg-surface px-2.5 py-2 font-mono text-xs whitespace-pre-wrap break-words text-ink-2">{GUARDS.find((g) => g.id === guard)?.code}</pre>
                <ol className="mt-3 flex-1 space-y-1.5" aria-label="Hook log so far">
                  <AnimatePresence initial={false}>
                    {steps.slice(0, step + 1).map((s, i) => (
                      <motion.li
                        key={`${guard}-${i}`}
                        layout={!reduce}
                        initial={reduce ? false : { opacity: 0, x: -8 }}
                        animate={{ opacity: i === step ? 1 : 0.72, x: 0 }}
                        exit={reduce ? undefined : { opacity: 0 }}
                        transition={reduce ? { duration: 0 } : undefined}
                        className="rounded-lg border bg-surface px-2.5 py-1.5"
                        style={{ borderColor: i === step ? TONE[s.tone].c : "var(--line)" }}
                      >
                        <span className="font-mono text-xs font-semibold" style={{ color: s.node === "tool" ? "var(--muted)" : s.tone === "neutral" ? "var(--accent-text)" : TONE[s.tone].c }}>
                          {s.node === "tool" ? "tool" : s.node}
                        </span>
                        <p className="font-mono text-xs break-words text-ink">{s.log}</p>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ol>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex flex-col gap-3 @lg:flex-row @lg:items-center @lg:justify-between">
        <p className="min-h-12 text-[0.95rem] text-ink-2" aria-live="polite">
          {mode === "simulate" ? (
            <>
              <span className="mr-2 font-display font-semibold text-ink tabular">
                {step + 1}/{steps.length}
              </span>
              {cur.caption}
            </>
          ) : (
            <>
              <span className="mr-2 font-mono font-semibold text-ink">{sel}</span>
              {info.plain} Try <em>Simulate a session</em> to watch a guard stop a command.
            </>
          )}
        </p>
        {mode === "simulate" ? (
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
            <Ctrl
              label="Reset"
              onClick={() => {
                setPlaying(false);
                setStep(0);
              }}
            >
              <RotateCcw size={16} />
            </Ctrl>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-2 @lg:grid-cols-3" aria-label="Exit codes">
        <ExitChip code="0" color="var(--good)" text="Success. Carry on (stdout may be parsed as JSON)." />
        <ExitChip code="2" color="var(--accent)" ink="var(--accent-ink)" text="Blocking error. Blocks where the event allows; stderr goes back." />
        <ExitChip code="1, 127…" color="var(--bad)" text="Non-blocking error. The action still proceeds." />
      </div>

      <Determinism reduce={!!reduce} />
    </div>
  );
}

function blockLabel(b: Block) {
  return b === "yes" ? "Can block" : b === "feedback" ? "Can't block, can give feedback" : "Can't block";
}

function BlockBadge({ block }: { block: Block }) {
  const Icon = block === "yes" ? ShieldCheck : block === "feedback" ? MessageSquareReply : null;
  return (
    <span
      className={clsx(
        "relative z-10 inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold",
        block === "yes" ? "border-accent-strong bg-accent-soft text-accent-text" : "border-line bg-surface text-muted",
      )}
    >
      {Icon ? <Icon size={12} aria-hidden /> : null}
      {block === "yes" ? "can block" : block === "feedback" ? "feedback only" : "can't block"}
    </span>
  );
}

function Fact({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr] gap-2">
      <dt className="text-xs font-semibold tracking-wide text-muted uppercase">{k}</dt>
      <dd className="text-ink-2">{children}</dd>
    </div>
  );
}

function ExitChip({ code, color, ink = "var(--surface)", text }: { code: string; color: string; ink?: string; text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-line bg-surface px-3 py-2">
      <span className="shrink-0 rounded-md px-1.5 py-0.5 font-mono text-xs font-bold" style={{ background: color, color: ink }}>
        exit {code}
      </span>
      <span className="text-xs text-ink-2">{text}</span>
    </div>
  );
}

const RUNS = 20;

function Determinism({ reduce }: { reduce: boolean }) {
  const [run, setRun] = useState(0);
  const [misses, setMisses] = useState<number[]>([6, 15]);
  const go = () => {
    if (run > 0) {
      const n = 1 + Math.floor(Math.random() * 3);
      const picks = new Set<number>();
      while (picks.size < n) picks.add(Math.floor(Math.random() * RUNS));
      setMisses([...picks]);
    }
    setRun((r) => r + 1);
  };
  const rows = [
    { label: "CLAUDE.md says “never run rm -rf”", kind: "Probabilistic: guidance the model weighs", miss: run ? misses : [] },
    { label: "PreToolUse hook exits 2", kind: "Deterministic: enforced by Claude Code", miss: [] as number[] },
  ];
  return (
    <div className="rounded-xl border border-line bg-surface-2/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">Same risky request, {RUNS} sessions</p>
        <button type="button" onClick={go} aria-label={run ? "Run 20 sessions again" : "Run 20 sessions"} className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-ink active:scale-95">
          {run ? "Run again" : `Run ${RUNS} sessions`}
        </button>
      </div>
      <div className="mt-3 space-y-3">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p className="text-xs font-medium text-ink-2">{r.label}</p>
              <p className="text-xs text-muted">
                {r.kind}
                {run ? ` · ${RUNS - r.miss.length}/${RUNS} stopped` : ""}
              </p>
            </div>
            <div className="mt-1.5 grid grid-cols-10 gap-1 @lg:grid-cols-20" role="img" aria-label={run ? `${r.label}: ${RUNS - r.miss.length} of ${RUNS} sessions stopped the command` : `${r.label}: not run yet`}>
              {Array.from({ length: RUNS }, (_, i) => {
                const bad = r.miss.includes(i);
                return (
                  <motion.span
                    key={`${run}-${i}`}
                    initial={run && !reduce ? { scale: 0, opacity: 0 } : false}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: reduce ? 0 : i * 0.035, duration: reduce ? 0 : 0.25 }}
                    className="h-4 rounded-[4px] border"
                    style={run ? { background: bad ? "var(--bad)" : "var(--good)", borderColor: bad ? "var(--bad)" : "var(--good)" } : { borderColor: "var(--line-strong)" }}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">
        Illustrative. Instructions are usually followed, but nothing guarantees it. A hook runs outside the model, so it stops the command every time. Anything that must always or never happen belongs in a hook or a permission rule.
      </p>
    </div>
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
