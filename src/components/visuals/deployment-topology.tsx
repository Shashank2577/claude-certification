"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import clsx from "clsx";
import { ChevronLeft, ChevronRight, Eye, KeyRound, RotateCcw, Server, ShieldAlert } from "lucide-react";

type TopoId = "self" | "managed" | "proxy";

interface Box {
  id: string;
  label: string;
  sub: string;
  x: number;
  y: number;
  w: number;
  yours: boolean;
}

interface Hop {
  from: string;
  to: string;
  ms: number;
  what: string;
}

interface Topo {
  id: TopoId;
  label: string;
  blurb: string;
  boxes: Box[];
  hops: Hop[];
  creds: string;
  boundary: string;
  observe: string;
  fails: string;
}

const COMMON: Box[] = [
  { id: "app", label: "Your app", sub: "UI + API", x: 12, y: 122, w: 104, yours: true },
  { id: "auth", label: "Auth", sub: "who is calling", x: 12, y: 20, w: 104, yours: true },
  { id: "sysrec", label: "Systems of record", sub: "orders, tickets", x: 12, y: 224, w: 104, yours: true },
];

const MODEL: Box = { id: "model", label: "Claude API", sub: "Anthropic-hosted", x: 452, y: 122, w: 112, yours: false };

const TOPOS: Record<TopoId, Topo> = {
  self: {
    id: "self",
    label: "Self-hosted agent",
    blurb: "You own every component. The orchestrator and the sandbox are inside your network; only the model call leaves.",
    creds: "You hold the credentials. Your orchestrator mints a short-lived token per tool call, and the sandbox gets a scoped key with no database write access.",
    boundary: "The sandbox boundary is yours to draw: a container, a microVM, or a separate network segment. Nothing about it is enforced by the model provider.",
    observe: "Full visibility. Model calls, tool calls, prompts and outputs are all inside your own telemetry, with your own retention rules.",
    fails: "A bug in your loop is your bug. An unpatched sandbox is your bug. You will be paged for both.",
    boxes: [
      ...COMMON,
      { id: "orch", label: "Orchestrator", sub: "your loop", x: 148, y: 122, w: 116, yours: true },
      { id: "sandbox", label: "Tool sandbox", sub: "no credentials", x: 292, y: 122, w: 124, yours: true },
      MODEL,
    ],
    hops: [
      { from: "auth", to: "app", ms: 12, what: "Session token verified. The caller's tenant and role come from your database, never from the prompt." },
      { from: "app", to: "orch", ms: 4, what: "Your orchestrator builds the Messages request and hands it the role-filtered tool list." },
      { from: "orch", to: "model", ms: 1150, what: "One round trip over the public internet. TLS terminates at the provider. This is the only hop that leaves your network." },
      { from: "model", to: "orch", ms: 0, what: "The reply carries a tool_use block. Your code, not the model, decides whether to run it." },
      { from: "orch", to: "sandbox", ms: 220, what: "Tool executes inside the sandbox with a scoped credential and no outbound access beyond an allowlist." },
      { from: "sandbox", to: "sysrec", ms: 85, what: "Tool reads the order through a service account scoped to read-only on that table." },
      { from: "sysrec", to: "app", ms: 40, what: "Result comes back as a tool_result and the loop runs again until stop_reason is end_turn." },
    ],
  },
  managed: {
    id: "managed",
    label: "Managed agent",
    blurb: "The provider runs the orchestrator and the tool environment. You keep auth and your systems of record.",
    creds: "The provider holds execution credentials for the duration of the run. You grant scoped permissions up front; you do not see the intermediate state, and revocation is a control-plane call.",
    boundary: "The boundary sits inside the provider. Your code no longer sits between the model and the tool, so any prompt-level defence has to be enforced by the tool permission you granted.",
    observe: "You see requests, token usage, stop reasons and tool-call summaries. You do not see raw prompts by default, and debugging requires exporting a trace.",
    fails: "A bad tool permission fails open, not closed. The blast radius is whatever you granted, and the failure may be visible only in the provider's logs.",
    boxes: [
      ...COMMON,
      { id: "managed", label: "Managed agent runtime", sub: "loop + sandbox", x: 168, y: 122, w: 168, yours: false },
      MODEL,
    ],
    hops: [
      { from: "auth", to: "app", ms: 12, what: "Same authentication step. You still decide who may start a run." },
      { from: "app", to: "managed", ms: 380, what: "You submit a task plus a scoped permission set. The provider's runtime owns the loop from here." },
      { from: "managed", to: "model", ms: 120, what: "Model calls now happen inside the provider network. No public-internet hop on this leg, and no request you can observe directly." },
      { from: "managed", to: "sysrec", ms: 640, what: "The runtime calls your API using the credentials you granted. Each call is authorized against the grant, not against your session." },
      { from: "sysrec", to: "managed", ms: 90, what: "Result returns to the runtime. Treat it as untrusted data; it may contain injected text." },
      { from: "managed", to: "app", ms: 60, what: "Final answer and usage come back over a webhook. Poll for status rather than holding a connection open." },
    ],
  },
  proxy: {
    id: "proxy",
    label: "Your loop + managed tools",
    blurb: "You keep the orchestrator for inspection, but delegate tool execution to a hosted sandbox. A middle shape, and a common one.",
    creds: "Split. Your orchestrator never holds execution credentials; the hosted sandbox holds a scoped key your control plane can revoke at any time.",
    boundary: "Two boundaries: yours around the loop, the provider's around execution. You can see every decision the model makes, but not what happens inside the tool.",
    observe: "Best of both for the loop: full prompt visibility on your side, provider-side metrics for the tool side. Log reconciliation is manual.",
    fails: "The gap between the two is the risk: a tool call your orchestrator approved cannot be re-checked once it is executing remotely.",
    boxes: [
      ...COMMON,
      { id: "orch", label: "Orchestrator", sub: "your loop", x: 148, y: 122, w: 116, yours: true },
      { id: "hosted", label: "Hosted sandbox", sub: "scoped key", x: 292, y: 122, w: 124, yours: false },
      MODEL,
    ],
    hops: [
      { from: "auth", to: "app", ms: 12, what: "Verify the session, derive the role. Everything downstream inherits this decision." },
      { from: "app", to: "orch", ms: 4, what: "Build the request, filter tools by role, log the exact body you are about to send." },
      { from: "orch", to: "model", ms: 1100, what: "Model round trip. This is your slowest hop and it is the one you cannot make faster by optimising your own code." },
      { from: "orch", to: "hosted", ms: 300, what: "Dispatch the tool call with a scoped, expiring credential and an explicit timeout." },
      { from: "hosted", to: "sysrec", ms: 640, what: "The hosted sandbox calls your API. Network egress is limited to your allowlist, not the open internet." },
      { from: "sysrec", to: "hosted", ms: 90, what: "Result returns; the sandbox can redact before handing it back to your loop." },
      { from: "hosted", to: "orch", ms: 300, what: "tool_result returns to you. You still make the final decision about what to do with it." },
    ],
  },
};

const TOPO_LIST = [TOPOS.self, TOPOS.managed, TOPOS.proxy];

function boxOf(t: Topo, id: string) {
  return t.boxes.find((b) => b.id === id)!;
}
function side(t: Topo, id: string) {
  const b = boxOf(t, id);
  return { cx: b.x + b.w / 2, cy: b.y + 22 };
}
function edge(t: Topo, hop: Hop) {
  const a = side(t, hop.from);
  const b = side(t, hop.to);
  const A = boxOf(t, hop.from);
  const B = boxOf(t, hop.to);
  // Same-column hops (auth → app → sysrec) run vertically so the arrows do not cut across the boxes.
  if (Math.abs(a.cx - b.cx) < 12) {
    const down = b.cy > a.cy;
    return { x1: a.cx, y1: down ? a.cy + 22 : a.cy - 22, x2: b.cx, y2: down ? b.cy - 22 : b.cy + 22 };
  }
  const right = a.cx < b.cx;
  return { x1: right ? A.x + A.w : A.x, y1: a.cy, x2: right ? B.x : B.x + B.w, y2: b.cy };
}

// A leg is drawn dashed when it crosses between a box you operate and one the provider operates.
function crossesBoundary(t: Topo, h: Hop) {
  return boxOf(t, h.from).yours !== boxOf(t, h.to).yours;
}

const BOX_H = 44;

// One dashed rect around everything the provider operates, so the trust boundary is a shape you can see.
function providerBox(t: Topo) {
  const theirs = t.boxes.filter((b) => !b.yours);
  const x = Math.min(...theirs.map((b) => b.x));
  const y = Math.min(...theirs.map((b) => b.y));
  const x2 = Math.max(...theirs.map((b) => b.x + b.w));
  const y2 = Math.max(...theirs.map((b) => b.y + BOX_H));
  return { x: x - 10, y: y - 10, w: x2 - x + 20, h: y2 - y + 20 };
}

export default function DeploymentTopology() {
  const reduce = !!useReducedMotion();
  const [topoId, setTopoId] = useState<TopoId>("self");
  const [step, setStep] = useState(0);
  const topo = TOPOS[topoId];
  const last = topo.hops.length - 1;
  const hop = topo.hops[Math.min(step, last)];
  const e = edge(topo, hop);
  const done = step >= last;

  const setTopo = (id: TopoId) => {
    setTopoId(id);
    setStep(0);
  };
  const onKey = (k: KeyboardEvent) => {
    if (k.key === "ArrowRight" || k.key === "ArrowLeft") {
      k.preventDefault();
      setStep((s) => Math.max(0, Math.min(last, s + (k.key === "ArrowRight" ? 1 : -1))));
    }
  };
  const reset = () => setStep(0);

  return (
    <div className="space-y-4" onKeyDown={onKey}>
      <div role="group" aria-label="Deployment topology" className="flex flex-wrap gap-1.5 rounded-xl bg-surface-2/60 p-1">
        {TOPO_LIST.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={topoId === t.id}
            aria-label={`Topology: ${t.label}`}
            onClick={() => setTopo(t.id)}
            className={clsx(
              "flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
              topoId === t.id ? "border-accent-strong bg-accent-soft text-ink" : "border-transparent bg-surface text-ink-2 hover:border-line-strong",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-2">
          <div className="rounded-xl bg-surface-2/50 p-2" tabIndex={0} role="group" aria-label="Topology diagram. Use left and right arrow keys to step through the request path.">
            <svg viewBox="0 0 580 300" className="h-auto w-full" role="img" aria-label={`${topo.label}. Step ${Math.min(step + 1, topo.hops.length)} of ${topo.hops.length}: ${hop.what} Latency ${hop.ms} milliseconds.`}>
              <defs>
                <marker id="dt-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0 0 L10 5 L0 10 z" fill="var(--line-strong)" />
                </marker>
                <marker id="dt-arrow-on" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0 0 L10 5 L0 10 z" fill="var(--accent-strong)" />
                </marker>
              </defs>

              <rect {...providerBox(topo)} rx="16" fill="none" stroke="var(--line-strong)" strokeWidth="1.5" strokeDasharray="6 5" />
              {/* Anchored to the right edge of its own boundary box: left-aligned it runs past the 580-unit viewBox. */}
              <text
                x={providerBox(topo).x + providerBox(topo).w}
                y={providerBox(topo).y - 4}
                textAnchor="end"
                fill="var(--muted)"
                style={{ font: "500 11px var(--font-sans)" }}
              >
                provider-operated · outside your boundary
              </text>

              {topo.hops.map((h, i) => {
                const on = i === step;
                const geo = edge(topo, h);
                const crosses = crossesBoundary(topo, h);
                return (
                  <line
                    key={`${h.from}-${h.to}-${i}`}
                    x1={geo.x1}
                    y1={geo.y1}
                    x2={geo.x2}
                    y2={geo.y2}
                    stroke={on ? "var(--accent-strong)" : "var(--line-strong)"}
                    strokeWidth={on ? 2.5 : 1.25}
                    strokeDasharray={crosses && !on ? "5 5" : undefined}
                    markerEnd={on ? "url(#dt-arrow-on)" : "url(#dt-arrow)"}
                    style={{ transition: "stroke 200ms ease" }}
                  />
                );
              })}

              {topo.hops.map((h, i) => {
                const geo = edge(topo, h);
                const vertical = Math.abs(geo.x1 - geo.x2) < 12;
                return (
                  <text
                    key={`ms-${h.from}-${h.to}-${i}`}
                    x={(geo.x1 + geo.x2) / 2 + (vertical ? 44 : 0)}
                    y={(geo.y1 + geo.y2) / 2 + (vertical ? 4 : -6)}
                    textAnchor={vertical ? "start" : "middle"}
                    fill={i === step ? "var(--accent-text)" : "var(--muted)"}
                    style={{ font: `${i === step ? 700 : 400} 11px var(--font-mono)` }}
                  >
                    {h.ms} ms
                  </text>
                );
              })}

              {topo.boxes.map((b) => {
                const active = hop.from === b.id || hop.to === b.id;
                return (
                  <g key={b.id}>
                    <motion.rect
                      x={b.x}
                      y={b.y}
                      width={b.w}
                      height={BOX_H}
                      rx="12"
                      fill={b.yours ? "var(--surface)" : "var(--ink)"}
                      stroke={active ? "var(--accent-strong)" : "var(--line-strong)"}
                      strokeWidth={active ? 2.5 : 1.25}
                      animate={{ scale: active && !reduce ? 1.03 : 1 }}
                      transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    />
                    <text x={b.x + b.w / 2} y={b.y + 20} textAnchor="middle" fill={b.yours ? "var(--ink)" : "var(--bg)"} style={{ font: "600 13px var(--font-display)" }}>
                      {b.label}
                    </text>
                    {/* --ink is light in dark mode, so text on a filled node must use --bg for AA contrast. */}
                    <text x={b.x + b.w / 2} y={b.y + 35} textAnchor="middle" fill={b.yours ? "var(--ink-2)" : "var(--bg)"} fillOpacity={b.yours ? 1 : 0.78} style={{ font: "400 10px var(--font-sans)" }}>
                      {b.sub}
                    </text>
                  </g>
                );
              })}

              <motion.circle
                key={`${topoId}-${step}`}
                r="6"
                fill="var(--accent)"
                stroke="var(--accent-ink)"
                strokeWidth="1.5"
                initial={reduce ? { cx: e.x1, cy: e.y1 } : { cx: e.x1, cy: e.y1, opacity: 0 }}
                animate={{ cx: e.x2, cy: e.y2, opacity: 1 }}
                transition={{ duration: reduce ? 0 : 0.75, ease: [0.22, 1, 0.36, 1] }}
              />
            </svg>
          </div>
          <p className="px-1 text-xs text-muted">{topo.blurb}</p>
          <p className="px-1 text-xs text-muted">Ink-filled boxes are provider-operated: you cannot inspect, patch or audit them. A dashed leg crosses between your code and theirs.</p>
        </div>

        <div className="flex min-w-0 flex-col gap-2.5 rounded-xl border border-line bg-bg/60 p-3">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`${topoId}-${step}`}
              initial={reduce ? false : { opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduce ? undefined : { opacity: 0, x: -12 }}
              transition={{ duration: reduce ? 0 : 0.22 }}
              className="space-y-2.5"
            >
              <p className="text-xs font-medium text-muted">
                Hop {Math.min(step + 1, topo.hops.length)} of {topo.hops.length} · {boxOf(topo, hop.from).label} → {boxOf(topo, hop.to).label}
              </p>
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-surface-2 px-2 py-1 font-mono text-xs text-ink">{hop.ms} ms</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <motion.div
                    className="h-full rounded-full bg-accent"
                    initial={reduce ? false : { width: 0 }}
                    animate={{ width: `${Math.min(100, (hop.ms / 1300) * 100)}%` }}
                    transition={{ duration: reduce ? 0 : 0.5, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
              </div>
              <p className="text-sm leading-snug text-ink">{hop.what}</p>

              <div className="space-y-1.5 border-t border-line pt-2.5">
                <Facet icon={<KeyRound size={13} aria-hidden />} title="Who holds credentials">
                  {topo.creds}
                </Facet>
                <Facet icon={<Server size={13} aria-hidden />} title="Where the sandbox boundary sits">
                  {topo.boundary}
                </Facet>
                <Facet icon={<Eye size={13} aria-hidden />} title="What you can observe">
                  {topo.observe}
                </Facet>
                <Facet icon={<ShieldAlert size={13} aria-hidden />} title="Failure mode" tone="bad">
                  {topo.fails}
                </Facet>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="flex flex-col gap-3 @lg:flex-row @lg:items-center @lg:justify-between">
        <p className="min-h-12 min-w-0 text-[0.95rem] text-ink-2" aria-live="polite">
          <span className="mr-2 font-display font-semibold text-ink tabular">
            {Math.min(step + 1, topo.hops.length)}/{topo.hops.length}
          </span>
          {done ? "Round trip complete. Total annotated latency is the sum above, and the model hop is most of it: no amount of optimising your own code removes that. Streaming is what makes it feel faster." : hop.what}
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          <CtrlButton label="Previous hop" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            <ChevronLeft size={18} />
          </CtrlButton>
          <CtrlButton label="Next hop" onClick={() => setStep((s) => Math.min(last, s + 1))} disabled={step === last}>
            <ChevronRight size={18} />
          </CtrlButton>
          <CtrlButton label="Reset to the first hop" onClick={reset}>
            <RotateCcw size={16} />
          </CtrlButton>
        </div>
      </div>
    </div>
  );
}

function Facet({ icon, title, children, tone }: { icon: ReactNode; title: string; children: ReactNode; tone?: "bad" }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-2.5 py-1.5">
      <p className={clsx("flex items-center gap-1.5 text-xs font-semibold", tone === "bad" ? "text-bad" : "text-ink")}>
        <span className="shrink-0" aria-hidden>
          {icon}
        </span>
        {title}
      </p>
      <p className="mt-0.5 text-[11px] leading-snug text-ink-2">{children}</p>
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
      className="grid size-9 place-items-center rounded-xl border border-line-strong bg-surface text-ink transition-colors hover:border-ink active:scale-95 disabled:opacity-40"
    >
      {children}
    </button>
  );
}