"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useHydratedReducedMotion } from "@/lib/use-reduced-motion";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, RotateCcw, ShieldCheck } from "lucide-react";
import clsx from "clsx";

const ASK = "Make support faster and the answers should be good.";

type Kind = "functional" | "infra";

interface Req {
  id: string;
  kind: Kind;
  text: string;
  tag: string;
  design: string;
  evalId: string | null;
  evalName: string | null;
  evalHow: string | null;
}

// One row of the trace. `evalId: null` is the gap this visual is built to make you notice.
const REQS: Req[] = [
  {
    id: "F1", kind: "functional", text: "Every inbound ticket lands in exactly one of five queues, at least 90% of the time.", tag: "enum tool call",
    design: "One forced tool call whose input is an enum of the five queue names, so the label can never be anything else.",
    evalId: "E1", evalName: "120 labelled tickets",
    evalHow: "Score the chosen queue against the human label; report per-queue accuracy so a small queue cannot hide.",
  },
  {
    id: "F2", kind: "functional", text: "No refund over $500 is ever sent without a named human approving it.", tag: "hard gate in the tool",
    design: "The amount check sits in the tool, not the prompt: over $500 the tool returns needs_approval and the reply cannot claim success.",
    evalId: "E2", evalName: "Boundary cases $499 / $500 / $501",
    evalHow: "Code-graded. Assert no money moved and that the transcript names a human approver.",
  },
  {
    id: "F3", kind: "functional", text: "Every factual answer quotes the policy paragraph it came from.", tag: "schema requires a citation",
    design: "Retrieval returns span offsets, and the response schema requires a citation field the model cannot leave empty.",
    evalId: "E3", evalName: "200 policy questions",
    evalHow: "An LLM judge marks each citation as supporting or contradicting the claim. Contradicting is a hard failure.",
  },
  {
    id: "F4", kind: "functional", text: "A ticket the system cannot resolve is handed to a person, not answered anyway.", tag: "confidence threshold, then stop",
    design: "Confidence threshold on the routing call; below it the flow offers a summary and stops, with no answer path.",
    evalId: "E4", evalName: "60 deliberately unanswerable tickets",
    evalHow: "Assert the reply contains an escalation and zero substantive answer. Silence must be the passing behaviour.",
  },
  {
    id: "N1", kind: "infra", text: "95% of first replies arrive in under 4 seconds.", tag: "streaming, no agent loop",
    design: "Small model for routing, streaming for the answer, one retrieval hop. No agent loop on the happy path.",
    evalId: "E5", evalName: "1,000 timed runs",
    evalHow: "Load test in CI. Hard gate on p95, not an average — averages hide the tail that customers complain about.",
  },
  {
    id: "N2", kind: "infra", text: "Customer data never leaves the EU region, and the service is up 99.5% of the month.", tag: "single eu-central-1 region",
    design: "One eu-central-1 deployment, no cross-region failover, so the residency promise is a fact rather than a policy.",
    evalId: null, evalName: null, evalHow: null,
  },
  {
    id: "N3", kind: "infra", text: "Under $0.02 per ticket at 50,000 tickets a month.", tag: "prompt caching + small model",
    design: "Cache the system prompt and tool definitions; route with the small model and reserve the large one for escalations.",
    evalId: "E6", evalName: "Token-count assertion in CI",
    evalHow: "Replay the 120-case set and fail the build if average tokens per ticket exceed the budget.",
  },
];

const STAGES = [
  { id: "ask", short: "The ask", caption: "A stakeholder sentence with two adjectives in it. “Faster” has no number and “good” has no definition, so nobody can build to it or argue about whether it shipped." },
  { id: "func", short: "Functional", caption: "Push on every clause until each one is observable from outside the system. Each of these can be tested by looking at what came out." },
  { id: "infra", short: "Infrastructure", caption: "Now do the same for the promises that are not user-visible: latency, availability, residency, cost. These are requirements too, and they are the ones teams forget." },
  { id: "trace", short: "Trace", caption: "Every requirement gets a design decision and an eval case. The trace is the point: an unlinked requirement is an unverified promise, and an unverified promise ships broken." },
  { id: "gap", short: "The gap", caption: "N2 is the dangerous one. It is a regulatory promise with no test behind it, so nothing would have told the team it broke." },
];

// Three columns: requirement id, design decision, eval case. Compact so 12px text stays readable on a phone.
const COL = { x: 8, w: 96, gap: 22, top: 34, row: 34 };
const colX = (i: number) => COL.x + i * (COL.w + COL.gap);
const colMid = (i: number) => colX(i) + COL.w / 2;

export default function RequirementsTraceability() {
  const reduce = !!useHydratedReducedMotion();
  const [stage, setStage] = useState(0);
  const [focus, setFocus] = useState(0);
  const last = STAGES.length - 1;

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    setStage((s) => Math.min(last, Math.max(0, s + (e.key === "ArrowRight" ? 1 : -1))));
  };

  // How much of the trace is on screen at each stage.
  const visible = stage === 0 ? 0 : stage === 1 ? 4 : 7;
  const showEval = stage >= 3;
  const spotlight = stage === 4 ? REQS.findIndex((r) => r.evalId === null) : focus;
  const rows = REQS.slice(0, visible);
  const unverified = REQS.filter((r) => !r.evalId).length;
  const current = REQS[Math.max(0, Math.min(REQS.length - 1, spotlight))];

  return (
    <div className="space-y-4" onKeyDown={onKey}>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Choose a stage">
        {STAGES.map((s, i) => (
          <Pill key={s.id} on={stage === i} onClick={() => setStage(i)} label={`Stage ${i + 1}: ${s.short}`}>
            <span className="font-mono">{i + 1}</span> {s.short}
          </Pill>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <div className="min-w-0 rounded-xl bg-surface-2/50 p-2" tabIndex={0} role="group" aria-label="Requirement trace diagram. Use left and right arrow keys to change stage.">
          <svg
            viewBox="0 0 348 300"
            className="h-auto w-full"
            role="img"
            aria-label={
              visible === 0
                ? "A stakeholder request with no requirements written down yet."
                : `${rows.length} requirements traced: ${rows
                    .map((r) => `${r.id}${r.evalId ? ` verified by ${r.evalId}` : " with no eval case"}`)
                    .join(", ")}.`
            }
          >
            {stage === 0 ? (
              <g>
                <rect x={26} y={74} width={296} height={124} rx={14} fill="var(--surface)" stroke="var(--line-strong)" strokeWidth={1.25} />
                <text x={44} y={104} fill="var(--muted)" style={{ font: "600 12px var(--font-mono)" }}>
                  STAKEHOLDER
                </text>
                <text x={44} y={132} fill="var(--ink)" style={{ font: "500 16px var(--font-sans)" }}>
                  <tspan x={44}>Make support faster</tspan>
                  <tspan x={44} dy={23}>
                    and the answers
                  </tspan>
                  <tspan x={44} dy={23}>
                    should be good.
                  </tspan>
                </text>
                <text x={174} y={244} textAnchor="middle" fill="var(--bad)" style={{ font: "600 15px var(--font-display)" }}>
                  Nothing here is testable.
                </text>
              </g>
            ) : (
              <>
                {["Requirement", "Design decision", "Eval case"].map((h, i) => (
                  <text key={h} x={colMid(i)} y={18} textAnchor="middle" fill="var(--muted)" style={{ font: "600 11px var(--font-mono)" }}>
                    {i === 2 && !showEval ? "Eval case (not yet)" : h.toUpperCase()}
                  </text>
                ))}
                {rows.map((r, i) => {
                  const y = COL.top + i * COL.row;
                  const on = i === spotlight;
                  const tone = r.evalId ? "var(--line-strong)" : "var(--bad)";
                  return (
                    <g key={r.id} onClick={() => setFocus(i)} style={{ cursor: "pointer" }}>
                      {showEval && (
                        <line x1={colMid(0) + COL.w / 2} y1={y + 14} x2={colX(1) - 3} y2={y + 14} stroke={tone} strokeWidth={on ? 2 : 1.25} />
                      )}
                      {showEval && r.evalId && (
                        <line x1={colMid(1) + COL.w / 2} y1={y + 14} x2={colX(2) - 3} y2={y + 14} stroke="var(--line-strong)" strokeWidth={on ? 2 : 1.25} />
                      )}
                      {showEval && !r.evalId && (
                        <line x1={colMid(1) + COL.w / 2} y1={y + 14} x2={colX(2) + 6} y2={y + 14} stroke="var(--bad)" strokeWidth={1.5} strokeDasharray="3 3" />
                      )}
                      {[0, 1, 2].map((c) => {
                        const empty = c > 0 && !showEval;
                        const bad = showEval && c === 2 && !r.evalId;
                        return (
                          <rect
                            key={c}
                            x={colX(c)}
                            y={y}
                            width={COL.w}
                            height={28}
                            rx={9}
                            fill={on ? "var(--accent-soft)" : bad ? "var(--bad-soft)" : "var(--surface)"}
                            stroke={on ? "var(--accent-strong)" : bad ? "var(--bad)" : c === 1 ? "var(--line)" : "var(--line-strong)"}
                            strokeWidth={on ? 2 : 1.25}
                            strokeDasharray={c === 0 && r.kind === "infra" ? "4 3" : empty || bad ? "4 3" : undefined}
                          />
                        );
                      })}
                      <text x={colMid(0)} y={y + 19} textAnchor="middle" fill="var(--ink)" style={{ font: "700 14px var(--font-mono)" }}>
                        {r.id}
                      </text>
                      <text x={colMid(1)} y={y + 19} textAnchor="middle" fill="var(--muted)" style={{ font: "400 12px var(--font-mono)" }}>
                        chosen
                      </text>
                      <text x={colMid(2)} y={y + 19} textAnchor="middle" fill={showEval && !r.evalId ? "var(--bad)" : r.evalId ? "var(--good)" : "var(--muted)"} style={{ font: "700 13px var(--font-mono)" }}>
                        {showEval ? (r.evalId ?? "NO EVAL") : "—"}
                      </text>
                    </g>
                  );
                })}
                <text x={COL.x} y={COL.top + rows.length * COL.row + 16} fill="var(--muted)" style={{ font: "500 11px var(--font-mono)" }}>
                  DASHED BOX = NON-FUNCTIONAL OR INFRASTRUCTURE
                </text>
              </>
            )}
          </svg>
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
                <div className="space-y-2">
                  <p className="rounded-lg bg-surface px-3 py-2 font-serif text-[1.05rem] text-ink">“{ASK}”</p>
                  <ul className="space-y-1.5 text-xs text-ink-2">
                    <li className="rounded-lg border border-bad/40 bg-bad-soft/25 px-2.5 py-2">
                      <b className="text-bad">“Faster”</b> — faster than what, measured how, for whom? No baseline, no percentile, no threshold.
                    </li>
                    <li className="rounded-lg border border-bad/40 bg-bad-soft/25 px-2.5 py-2">
                      <b className="text-bad">“Good”</b> — good on which dimension? Correct? Kind? Short? Two teams can pass this sentence and disagree.
                    </li>
                  </ul>
                  <p className="text-xs text-ink-2">Split the sentence into clauses. Every clause has to end in something you could put a number on and an outsider could check.</p>
                </div>
              )}

              {stage === 1 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted">Four functional requirements, each observable from outside the system.</p>
                  <ReqList reqs={REQS.slice(0, 4)} focus={spotlight} onPick={setFocus} reduce={reduce} />
                </div>
              )}

              {stage === 2 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted">Three infrastructure requirements nobody wrote down, because they are not features.</p>
                  <ReqList reqs={REQS.slice(4)} focus={Math.max(0, spotlight - 4)} onPick={(i) => setFocus(i + 4)} reduce={reduce} />
                  <p className="rounded-lg bg-accent-soft px-3 py-2 text-xs text-ink">
                    “Answers should be good” quietly contained a latency budget, an availability promise, a residency rule and a unit-economics ceiling. Skipping these is how a support pilot becomes a compliance incident.
                  </p>
                </div>
              )}

              {stage === 3 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted">{REQS.length} requirements, {REQS.length - unverified} with an eval case, {unverified} without.</p>
                  <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                    {REQS.map((r, i) => (
                      <TraceRow key={r.id} r={r} on={i === spotlight} onClick={() => setFocus(i)} reduce={reduce} />
                    ))}
                  </div>
                </div>
              )}

              {stage === 4 && (
                <div className="space-y-2">
                  <div className="flex items-start gap-2 rounded-lg border border-bad/50 bg-bad-soft/35 p-3">
                    <AlertTriangle size={18} className="mt-0.5 shrink-0" style={{ color: "var(--bad)" }} aria-hidden />
                    <div>
                      <p className="font-display text-sm font-semibold text-ink">N2 has no eval case</p>
                      <p className="mt-1 text-xs text-ink-2">{current.text} {current.design}</p>
                    </div>
                  </div>
                  <p className="text-xs text-ink-2">
                    It is the one people care about most and the one nobody tested: residency needs a region assertion in the deployment config and an outage needs failure injection. Neither exists, so a misconfigured region would reach production and stay there.
                  </p>
                  <ul className="space-y-1.5 text-xs text-ink-2">
                    <li className="flex gap-2 rounded-lg border border-line bg-surface px-2.5 py-2">
                      <ShieldCheck size={14} className="mt-0.5 shrink-0" style={{ color: "var(--good)" }} aria-hidden />
                      Rule: no requirement ships without a test that fails when the requirement is broken. If you cannot write the test, you do not yet know what you are promising.
                    </li>
                    <li className="flex gap-2 rounded-lg border border-line bg-surface px-2.5 py-2">
                      <Check size={14} className="mt-0.5 shrink-0" style={{ color: "var(--good)" }} aria-hidden />
                      Write the eval case while you are still writing the requirement. The gap is always cheapest to close at the moment of writing.
                    </li>
                  </ul>
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
          <CtrlButton label="Reset to the vague ask" onClick={() => { setStage(0); setFocus(0); }}>
            <RotateCcw size={16} />
          </CtrlButton>
        </div>
      </div>
    </div>
  );
}

function ReqList({ reqs, focus, onPick, reduce }: { reqs: Req[]; focus: number; onPick: (i: number) => void; reduce: boolean }) {
  return (
    <ul className="space-y-1.5">
      {reqs.map((r, i) => (
        <motion.li key={r.id} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduce ? 0 : 0.25 }}>
          <button
            type="button"
            aria-label={`Requirement ${r.id}: ${r.text}`}
            aria-pressed={i === focus}
            onClick={() => onPick(i)}
            className={clsx("w-full rounded-lg border px-2.5 py-2 text-left transition-colors", i === focus ? "border-accent-strong bg-accent-soft" : "border-line bg-surface hover:border-line-strong")}
          >
            <span className="font-mono text-xs font-semibold text-accent-text">{r.id}</span>
            <span className="ml-2 text-xs text-ink">{r.text}</span>
          </button>
        </motion.li>
      ))}
    </ul>
  );
}

function TraceRow({ r, on, onClick, reduce }: { r: Req; on: boolean; onClick: () => void; reduce: boolean }) {
  return (
    <motion.button
      type="button"
      aria-label={`${r.id}, ${r.evalId ? `verified by ${r.evalId}: ${r.evalName}` : "no eval case, unverified"}`}
      aria-pressed={on}
      onClick={onClick}
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      className={clsx("block w-full rounded-lg border px-2.5 py-2 text-left transition-colors", r.evalId ? (on ? "border-accent-strong bg-accent-soft" : "border-line bg-surface") : "border-bad/60 bg-bad-soft/25")}
    >
      <span className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-mono text-xs font-semibold text-accent-text">{r.id}</span>
        <span className="text-xs text-ink">{r.text}</span>
      </span>
      <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
        <span className="rounded-full bg-surface-2 px-1.5 font-mono">{r.tag}</span>
        {r.evalId ? (
          <span className="rounded-full bg-good-soft px-1.5 font-mono font-semibold" style={{ color: "var(--good)" }}>
            {r.evalId} · {r.evalName}
          </span>
        ) : (
          <span className="rounded-full bg-bad-soft px-1.5 font-mono font-semibold" style={{ color: "var(--bad)" }}>
            no eval case
          </span>
        )}
      </span>
      {on && r.evalHow && <span className="mt-1 block text-[11px] text-ink-2">{r.evalHow}</span>}
    </motion.button>
  );
}

function Pill({ on, onClick, label, children }: { on: boolean; onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      onClick={onClick}
      className={clsx("rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors active:scale-[0.98]", on ? "border-accent-strong bg-accent-soft text-ink" : "border-line bg-surface text-ink-2 hover:border-line-strong")}
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
      className="hit-44 grid size-9 place-items-center rounded-xl border border-line-strong bg-surface text-ink transition-colors hover:border-ink active:scale-95 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
