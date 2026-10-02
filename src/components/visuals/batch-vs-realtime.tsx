"use client";

import { useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion, type PanInfo } from "motion/react";
import { Check, ChevronLeft, ChevronRight, Clock, Layers, RotateCcw, X, Zap } from "lucide-react";
import clsx from "clsx";

type Lane = "batch" | "sync";
type Tab = "sort" | "life" | "cost";

const TABS: [Tab, string][] = [
  ["sort", "1. Who is waiting?"],
  ["life", "2. How a batch runs"],
  ["cost", "3. Cost at volume"],
];

const JOBS: { id: string; name: string; who: string; answer: Lane; why: string }[] = [
  { id: "nightly", name: "Nightly tech-debt report", who: "Read next morning", answer: "batch", why: "Nobody is waiting overnight, so take the 50% discount. Up to 24 hours is fine." },
  { id: "premerge", name: "Pre-merge check", who: "A developer can't merge until it passes", answer: "sync", why: "A developer is blocked. Batch has no latency guarantee, so 'usually fast' isn't good enough." },
  { id: "audit", name: "Weekly security audit", who: "Reviewed later in the week", answer: "batch", why: "Latency-tolerant bulk work: a textbook batch job." },
  { id: "chat", name: "Live support chat", who: "A customer is typing", answer: "sync", why: "A person is waiting for a reply in seconds. Use synchronous calls, ideally streamed. Batches can't stream." },
  { id: "archive", name: "Re-extract 200k archived documents", who: "Backfill, no deadline today", answer: "batch", why: "Huge volume with no one waiting. Batch halves the bill." },
  { id: "agent", name: "Agent fixing a bug with tools", who: "Needs several tool round-trips", answer: "sync", why: "A batch item is one Messages call: it can't run a tool and continue mid-request. Multi-turn tool loops need synchronous calls." },
];

const LIFE = [
  { title: "Build", caption: "Each request is one ordinary Messages call with its own custom_id (a name you choose). You can include tool definitions, but nothing can run a tool and continue inside the request." },
  { title: "Submit", caption: "Send them all as one batch: up to 100,000 requests or 256 MB, whichever comes first. You get a batch ID back right away. The answers come later." },
  { title: "Process", caption: "Requests run asynchronously and independently. Most batches finish within an hour, but the only promise is the 24-hour window: by then every request has either finished or expired." },
  { title: "Match", caption: "Results can come back in any order. Match each one to its request by custom_id, never by position. Errored, canceled and expired requests aren't billed. Results stay downloadable for 29 days." },
  { title: "Retry", caption: "Find the failed custom_ids, fix the cause (for example, chunk a document that was too long), and resubmit only those in a new batch. Re-running everything wastes money and can duplicate results." },
];

const REQS = ["doc-001", "doc-002", "doc-003", "doc-004", "doc-005"];
// Order results arrive in, and each result's status.
const RESULT_ORDER = [2, 0, 4, 1, 3];
const STATUS: Record<number, "succeeded" | "errored" | "expired"> = { 0: "succeeded", 1: "errored", 2: "succeeded", 3: "expired", 4: "succeeded" };

const VOLUMES = [100, 1_000, 10_000, 50_000, 100_000, 250_000, 500_000, 1_000_000];
// Illustrative, matching the lesson's worked example: 4,000 input + 500 output tokens per request
// at Sonnet 5.5 list prices ($2 / $10 per million tokens). 50,000 requests = $650 sync, $325 batch.
const PER_REQ = (4000 * 2 + 500 * 10) / 1_000_000;

const money = (n: number) => (n >= 1000 ? `$${Math.round(n).toLocaleString("en-US")}` : `$${n.toFixed(2)}`);

export default function BatchVsRealtime() {
  const reduce = useReducedMotion();
  const [tab, setTab] = useState<Tab>("sort");
  const tabIndex = TABS.findIndex(([id]) => id === tab);
  const onTabKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const nextIndex = (tabIndex + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length;
    setTab(TABS[nextIndex][0]);
    (e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]")[nextIndex])?.focus();
  };

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Views" onKeyDown={onTabKey} className="flex flex-wrap gap-1.5 rounded-xl bg-surface-2/60 p-1">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`bvr-tab-${id}`}
            aria-selected={tab === id}
            aria-controls="bvr-panel"
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            className={clsx(
              "relative flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              tab === id ? "text-ink" : "text-muted hover:text-ink",
            )}
          >
            {tab === id ? (
              <motion.span layoutId="bvr-tab" className="absolute inset-0 rounded-lg border border-line bg-surface shadow-sm" transition={{ duration: reduce ? 0 : 0.25 }} />
            ) : null}
            <span className="relative">{label}</span>
          </button>
        ))}
      </div>
      <div id="bvr-panel" role="tabpanel" aria-labelledby={`bvr-tab-${tab}`}>
        {tab === "sort" ? <Sorter reduce={!!reduce} /> : tab === "life" ? <Lifecycle reduce={!!reduce} /> : <Cost reduce={!!reduce} />}
      </div>
    </div>
  );
}

/* ---------- 1. Workload sorter ---------- */

const FINE_POINTER = "(pointer: fine)";
const subscribeFinePointer = (cb: () => void) => {
  const mq = window.matchMedia(FINE_POINTER);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

function Sorter({ reduce }: { reduce: boolean }) {
  const [placed, setPlaced] = useState<Record<string, Lane | undefined>>({});
  const [msg, setMsg] = useState("Ask one question of each job: is a person or process blocked waiting for the answer? Click a lane button or drag a card into a lane.");
  const lanes = { batch: useRef<HTMLDivElement>(null), sync: useRef<HTMLDivElement>(null) };
  // Dragging is only offered to mouse-style pointers: on touch screens a full-width draggable card would block page scrolling.
  // Server snapshot is false so the first client render matches the server HTML.
  const finePointer = useSyncExternalStore(subscribeFinePointer, () => window.matchMedia(FINE_POINTER).matches, () => false);
  const canDrag = !reduce && finePointer;

  const place = (id: string, lane: Lane) => {
    const job = JOBS.find((j) => j.id === id)!;
    setPlaced((p) => ({ ...p, [id]: lane }));
    setMsg(`${lane === job.answer ? "Right." : "Not quite."} ${job.name}: ${job.why}`);
  };
  const unplace = (id: string) => setPlaced((p) => ({ ...p, [id]: undefined }));
  const onDrop = (id: string, info: PanInfo) => {
    for (const lane of ["batch", "sync"] as Lane[]) {
      const r = lanes[lane].current?.getBoundingClientRect();
      if (!r) continue;
      const x = info.point.x - window.scrollX;
      const y = info.point.y - window.scrollY;
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return place(id, lane);
    }
  };

  const pool = JOBS.filter((j) => !placed[j.id]);
  const done = JOBS.filter((j) => placed[j.id]);
  const correct = done.filter((j) => placed[j.id] === j.answer).length;

  return (
    <LayoutGroup id="bvr-sort">
      <div className="space-y-3">
        <div className="flex min-h-[3.5rem] flex-wrap gap-2 rounded-xl border border-dashed border-line-strong bg-bg/50 p-2" aria-label="Unsorted jobs">
          {pool.length === 0 ? (
            <p className="self-center px-2 text-sm text-muted">
              All sorted: <span className="font-semibold text-ink tabular">{correct}/{JOBS.length}</span> correct.
            </p>
          ) : null}
          {pool.map((j) => (
            <motion.div
              key={j.id}
              layoutId={reduce ? undefined : `job-${j.id}`}
              drag={canDrag}
              dragSnapToOrigin
              whileDrag={{ scale: 1.04, zIndex: 20 }}
              onDragEnd={(_, info) => onDrop(j.id, info)}
              className={clsx(
                "w-full rounded-lg border border-line bg-surface px-3 py-2 @lg:w-[calc(50%-0.25rem)] @2xl:w-[calc(33.33%-0.35rem)]",
                canDrag && "cursor-grab touch-none active:cursor-grabbing",
              )}
            >
              <p className="text-sm font-semibold text-ink">{j.name}</p>
              <p className="text-xs text-muted">{j.who}</p>
              <div className="mt-2 flex gap-1.5">
                <LaneBtn lane="batch" onClick={() => place(j.id, "batch")} label={`Send ${j.name} to batch`} />
                <LaneBtn lane="sync" onClick={() => place(j.id, "sync")} label={`Send ${j.name} to synchronous`} />
              </div>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 @lg:grid-cols-2">
          {(["batch", "sync"] as Lane[]).map((lane) => (
            <div
              key={lane}
              ref={lanes[lane]}
              className="min-h-40 rounded-xl border p-3"
              style={{ borderColor: lane === "batch" ? "var(--info)" : "var(--accent-strong)", background: lane === "batch" ? "var(--info-soft)" : "var(--accent-soft)" }}
            >
              <div className="flex items-center gap-2">
                {lane === "batch" ? <Layers size={16} style={{ color: "var(--info)" }} /> : <Zap size={16} style={{ color: "var(--accent-text)" }} />}
                <p className="font-display text-sm font-semibold text-ink">{lane === "batch" ? "Message Batches API" : "Synchronous Messages API"}</p>
              </div>
              <p className="mt-0.5 text-xs text-ink-2">
                {lane === "batch" ? "50% cheaper · results within 24 h (often < 1 h) · no latency guarantee" : "Full price · answer in seconds · streaming and multi-turn tool loops"}
              </p>
              <ul className="mt-2 space-y-1.5">
                <AnimatePresence initial={false}>
                  {done
                    .filter((j) => placed[j.id] === lane)
                    .map((j) => {
                      const ok = j.answer === lane;
                      return (
                        <motion.li key={j.id} layoutId={reduce ? undefined : `job-${j.id}`} className="flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5">
                          <span className="grid size-5 shrink-0 place-items-center rounded-full" style={{ background: ok ? "var(--good)" : "var(--bad)", color: "var(--surface)" }} aria-label={ok ? "Correct" : "Incorrect"}>
                            {ok ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={3} />}
                          </span>
                          <span className="flex-1 text-sm text-ink">{j.name}</span>
                          <button type="button" onClick={() => unplace(j.id)} aria-label={`Move ${j.name} back`} title="Move back" className="rounded p-1 text-muted hover:text-ink">
                            <RotateCcw size={13} />
                          </button>
                        </motion.li>
                      );
                    })}
                </AnimatePresence>
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2 @lg:flex-row @lg:items-start @lg:justify-between">
          <p className="min-h-12 text-[0.95rem] text-ink-2" aria-live="polite">
            {msg}
          </p>
          <button type="button" onClick={() => { setPlaced({}); setMsg("Cleared. Try again: who is waiting on each result?"); }} aria-label="Reset sorter" className="shrink-0 rounded-xl border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink hover:border-ink">
            Reset
          </button>
        </div>
      </div>
    </LayoutGroup>
  );
}

function LaneBtn({ lane, onClick, label }: { lane: Lane; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
      aria-label={label}
      className="flex items-center gap-1 rounded-md border border-line-strong bg-bg px-2 py-0.5 text-xs font-medium text-ink transition-colors hover:border-ink active:scale-95"
    >
      {lane === "batch" ? <Layers size={12} /> : <Zap size={12} />}
      {lane === "batch" ? "Batch" : "Sync"}
    </button>
  );
}

/* ---------- 2. Batch lifecycle ---------- */

// Compact 360-unit-wide scene so labels stay legible at phone width (15px units ≈ 12.5px at 375px).
const ROW_Y = (i: number) => 46 + i * 48;
const BATCH = { x: 112, y: 92, w: 100, h: 100, cx: 162, cy: 142 };
const RETRY_BOX = { x: 106, y: 272, w: 150, h: 34 };

function Lifecycle({ reduce }: { reduce: boolean }) {
  const [step, setStep] = useState(0);
  const last = LIFE.length - 1;
  const next = () => setStep((s) => Math.min(last, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") { e.preventDefault(); next(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); back(); }
  };
  const t = { duration: reduce ? 0 : 0.6, ease: [0.22, 1, 0.36, 1] as const };
  const statusColor = (s: string) => (s === "succeeded" ? "var(--good)" : "var(--bad)");
  const inBatch = step >= 1;
  const clock = { cx: 150, cy: 170, r: 13 };

  return (
    <div className="space-y-3" onKeyDown={onKey}>
      <div className="rounded-xl bg-surface-2/50 p-2" tabIndex={0} role="group" aria-label="Batch lifecycle. Use left and right arrow keys to step.">
        <svg viewBox="0 0 360 316" className="mx-auto h-auto w-full max-w-[27rem]" role="img" aria-label={`Step ${step + 1}, ${LIFE[step].title}: ${LIFE[step].caption}`}>
          <text x={50} y={18} textAnchor="middle" fill="var(--muted)" style={{ font: "500 15px var(--font-sans)" }}>requests</text>
          <text x={291} y={18} textAnchor="middle" fill="var(--muted)" style={{ font: "500 15px var(--font-sans)" }}>results (any order)</text>

          {REQS.map((id, i) => {
            const y = ROW_Y(i);
            return (
              <g key={id}>
                <motion.rect initial={false} animate={{ opacity: inBatch ? 0.45 : 1 }} transition={t} x={4} y={y - 16} width={92} height={32} rx={8} fill="var(--surface)" stroke="var(--line-strong)" />
                <text x={50} y={y + 5} textAnchor="middle" fill="var(--ink)" style={{ font: "500 15px var(--font-mono)" }}>{id}</text>
                <motion.line initial={false} animate={{ pathLength: inBatch ? 1 : 0, opacity: inBatch ? 1 : 0 }} transition={{ ...t, delay: reduce ? 0 : i * 0.06 }} x1={97} y1={y} x2={BATCH.x - 1} y2={BATCH.cy} stroke="var(--info)" strokeWidth={1.5} />
              </g>
            );
          })}

          <motion.rect initial={false} animate={{ opacity: inBatch ? 1 : 0.35 }} transition={t} x={BATCH.x} y={BATCH.y} width={BATCH.w} height={BATCH.h} rx={14} fill="var(--ink)" />
          <text x={BATCH.cx} y={122} textAnchor="middle" fill="var(--bg)" style={{ font: "600 18px var(--font-display)" }}>Batch</text>
          <text x={BATCH.cx} y={142} textAnchor="middle" fill="var(--bg)" fillOpacity={0.8} style={{ font: "500 14px var(--font-mono)" }}>
            {step < 1 ? "not sent" : step === 2 ? "in_progress" : "ended"}
          </text>
          {/* 24h clock ring: fills a little to show "most batches finish in under an hour" */}
          <circle cx={clock.cx} cy={clock.cy} r={clock.r} fill="none" stroke="var(--ink-2)" strokeWidth={4} opacity={0.5} />
          <g transform={`rotate(-90 ${clock.cx} ${clock.cy})`}>
            <motion.circle
              cx={clock.cx} cy={clock.cy} r={clock.r} fill="none" stroke="var(--accent)" strokeWidth={4} strokeLinecap="round"
              initial={false}
              animate={{ pathLength: step < 2 ? 0 : 0.1 }}
              transition={{ duration: reduce ? 0 : 1.2 }}
            />
          </g>
          <text x={clock.cx + 20} y={clock.cy + 5} fill="var(--bg)" style={{ font: "500 14px var(--font-mono)" }}>{step >= 2 ? "<1h" : "24h"}</text>

          {RESULT_ORDER.map((ri, slot) => {
            const y = ROW_Y(slot);
            const show = step >= 3;
            const st = STATUS[ri];
            const failed = st !== "succeeded";
            const retried = step >= 4 && failed;
            return (
              <motion.g key={ri} initial={false} animate={{ opacity: show ? 1 : 0, x: show ? 0 : -24 }} transition={{ ...t, delay: show && !reduce ? slot * 0.12 : 0 }}>
                <line x1={BATCH.x + BATCH.w} y1={BATCH.cy} x2={225} y2={y} stroke="var(--line-strong)" strokeWidth={1} />
                <rect x={226} y={y - 20} width={130} height={40} rx={8} fill="var(--surface)" stroke={statusColor(st)} strokeWidth={retried ? 2.5 : 1.5} strokeDasharray={retried ? "5 3" : undefined} />
                <circle cx={240} cy={y - 5} r={4} fill={statusColor(st)} />
                <text x={250} y={y} fill="var(--ink)" style={{ font: "600 15px var(--font-mono)" }}>{REQS[ri]}</text>
                <text x={250} y={y + 15} fill={statusColor(st)} style={{ font: "500 14px var(--font-mono)" }}>{retried ? "resubmit" : st}</text>
              </motion.g>
            );
          })}

          <AnimatePresence>
            {step >= 4 ? (
              <motion.g initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={t}>
                <rect x={RETRY_BOX.x} y={RETRY_BOX.y} width={RETRY_BOX.w} height={RETRY_BOX.h} rx={10} fill="var(--surface)" stroke="var(--info)" strokeWidth={2} />
                <text x={RETRY_BOX.x + RETRY_BOX.w / 2} y={RETRY_BOX.y + 22} textAnchor="middle" fill="var(--ink)" style={{ font: "600 15px var(--font-display)" }}>New batch: 2 items</text>
                {/* dashed arrows from the two failed results (slots 3 and 4) into the new batch */}
                <path d={`M 226 ${ROW_Y(3) + 12} Q 244 262 ${RETRY_BOX.x + RETRY_BOX.w} 289`} fill="none" stroke="var(--bad)" strokeWidth={1.5} strokeDasharray="4 4" />
                <path d={`M 226 ${ROW_Y(4) + 12} Q 240 282 ${RETRY_BOX.x + RETRY_BOX.w} 289`} fill="none" stroke="var(--bad)" strokeWidth={1.5} strokeDasharray="4 4" />
              </motion.g>
            ) : null}
          </AnimatePresence>
        </svg>
      </div>

      <div className="flex flex-col gap-3 @lg:flex-row @lg:items-center @lg:justify-between">
        <p className="min-h-12 text-[0.95rem] text-ink-2" aria-live="polite">
          <span className="mr-2 font-display font-semibold text-ink tabular">{step + 1}/{LIFE.length} {LIFE[step].title}.</span>
          {LIFE[step].caption}
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          <CtrlButton label="Previous step" onClick={back} disabled={step === 0}><ChevronLeft size={18} /></CtrlButton>
          <CtrlButton label="Next step" onClick={next} disabled={step === last}><ChevronRight size={18} /></CtrlButton>
          <CtrlButton label="Reset" onClick={() => setStep(0)}><RotateCcw size={16} /></CtrlButton>
        </div>
      </div>
    </div>
  );
}

/* ---------- 3. Cost at volume ---------- */

function Cost({ reduce }: { reduce: boolean }) {
  const [vi, setVi] = useState(3);
  const n = VOLUMES[vi];
  const sync = n * PER_REQ;
  const batch = sync / 2;
  const t = { duration: reduce ? 0 : 0.5, ease: [0.22, 1, 0.36, 1] as const };

  const rows: { label: string; icon: ReactNode; cost: number; wait: string; color: string }[] = [
    { label: "Synchronous", icon: <Zap size={14} />, cost: sync, wait: "seconds per request", color: "var(--accent-strong)" },
    { label: "Batch", icon: <Layers size={14} />, cost: batch, wait: "up to 24 h for the batch", color: "var(--info)" },
  ];

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-baseline justify-between">
          <label htmlFor="bvr-vol" className="text-sm font-medium text-ink">Requests</label>
          <span className="font-display text-lg font-semibold text-ink tabular">{n.toLocaleString("en-US")}</span>
        </div>
        <input
          id="bvr-vol" type="range" min={0} max={VOLUMES.length - 1} step={1} value={vi}
          onChange={(e) => setVi(Number(e.target.value))}
          aria-label="Number of requests" aria-valuetext={`${n.toLocaleString("en-US")} requests`}
          className="mt-1 w-full accent-[var(--accent-strong)]"
        />
      </div>

      <div className="space-y-3 rounded-xl border border-line bg-bg/60 p-3">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 font-medium text-ink"><span style={{ color: r.color }}>{r.icon}</span>{r.label}</span>
              <span className="font-display font-semibold text-ink tabular">{money(r.cost)}</span>
            </div>
            <div className="mt-1 h-3 overflow-hidden rounded-full bg-surface-2">
              <motion.div className="h-full rounded-full" style={{ background: r.color }} initial={false} animate={{ width: `${(r.cost / sync) * 100}%` }} transition={t} />
            </div>
            <p className="mt-1 flex items-center gap-1 text-xs text-muted"><Clock size={12} />Wait: {r.wait}</p>
          </div>
        ))}
        <div className="flex items-center justify-between border-t border-line pt-2">
          <span className="text-sm text-ink-2">Saved by batching</span>
          <motion.span key={n} initial={reduce ? false : { scale: 1.15 }} animate={{ scale: 1 }} transition={t} className="font-display text-xl font-semibold tabular" style={{ color: "var(--good)" }}>
            {money(sync - batch)}
          </motion.span>
        </div>
      </div>

      <p className="text-[0.95rem] text-ink-2" aria-live="polite">
        At {n.toLocaleString("en-US")} requests the batch discount saves {money(sync - batch)}, but every one of those answers could take up to 24 hours. The saving grows with volume; the wait doesn&apos;t shrink. If anything is blocked on the result, pay full price and go synchronous. Batch and prompt-caching discounts stack.
      </p>
      <p className="text-xs text-muted">Illustrative: 4,000 input + 500 output tokens per request at $2 / $10 per million tokens (Sonnet 5.5 list price). The 50% discount applies to both input and output tokens.</p>
    </div>
  );
}

function CtrlButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} className="grid size-9 place-items-center rounded-xl border border-line-strong bg-surface text-ink transition-colors hover:border-ink active:scale-95 disabled:opacity-40">
      {children}
    </button>
  );
}
