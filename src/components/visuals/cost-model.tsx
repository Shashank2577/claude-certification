"use client";

import { useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import clsx from "clsx";
import { Boxes, Cpu, DatabaseZap, Layers, Percent, Scissors, Timer, Zap } from "lucide-react";

type Tier = "haiku" | "sonnet" | "opus";
type LeverId = "cache" | "batch" | "small" | "trim";

interface TierSpec {
  name: string;
  // Illustrative list prices, $ per million tokens.
  inPrice: number;
  outPrice: number;
  baseP50: number;
}

const TIERS: Record<Tier, TierSpec> = {
  haiku: { name: "Haiku", inPrice: 1, outPrice: 5, baseP50: 0.6 },
  sonnet: { name: "Sonnet", inPrice: 3, outPrice: 15, baseP50: 1.9 },
  opus: { name: "Opus", inPrice: 15, outPrice: 75, baseP50: 5.4 },
};

const LEVERS: Record<LeverId, { label: string; detail: string }> = {
  cache: { label: "Prompt caching", detail: "The stable prefix (tool definitions, system prompt, policy docs) is written once and read at 0.1x afterwards. Only helps if the bytes before the last breakpoint really are identical." },
  batch: { label: "Message Batches", detail: "Half price on input and output. No latency guarantee and no streaming, so only for work nobody is waiting on." },
  small: { label: "Smaller model", detail: "Roughly a 3x cut on both input and output. Costs quality, so check it against an eval rather than assuming." },
  trim: { label: "Trim the context", detail: "Fewer input tokens on every request, no caching needed. Cheapest lever to reach for, because it also cuts latency." },
};

const CACHE_READ = 0.1;
const CACHE_WRITE = 1.25;
const BATCH = 0.5;
// Illustrative share of the prompt that stays byte-identical across requests in a support app.
const STABLE_SHARE = 0.7;
// Output generation rate, tokens per second, illustrative.
const TPS: Record<Tier, number> = { haiku: 120, sonnet: 75, opus: 35 };

export default function CostModel() {
  const reduce = !!useReducedMotion();
  const [perDay, setPerDay] = useState(20_000);
  const [inTok, setInTok] = useState(4000);
  const [outTok, setOutTok] = useState(500);
  const [hit, setHit] = useState(0);
  const [tier, setTier] = useState<Tier>("sonnet");
  const [batch, setBatch] = useState(false);
  const [levers, setLevers] = useState<Record<LeverId, boolean>>({ cache: false, batch: false, small: false, trim: false });

  // The "smaller model" lever steps down exactly one tier, so Opus never silently becomes Haiku.
  const STEP_DOWN: Record<Tier, Tier> = { haiku: "haiku", sonnet: "haiku", opus: "sonnet" };
  const billedTier: Tier = levers.small ? STEP_DOWN[tier] : tier;
  const spec = TIERS[billedTier];
  const rate = levers.batch ? BATCH : 1;

  const effIn = levers.trim ? Math.round(inTok * 0.75) : inTok;
  const useCache = levers.cache;
  // Cached requests split into a write (first call after the prefix changes) and a read (every other call).
  const cached = useCache ? effIn * STABLE_SHARE : 0;
  const writeTokens = cached * (1 - hit / 100);
  const readTokens = cached * (hit / 100);
  const plainTokens = effIn - cached;

  const inputCost =
    ((writeTokens * CACHE_WRITE * spec.inPrice + readTokens * CACHE_READ * spec.inPrice + plainTokens * spec.inPrice) / 1e6) * rate;
  const outputCost = ((outTok * spec.outPrice) / 1e6) * rate;
  const perReq = inputCost + outputCost;
  const dayCost = perReq * perDay;
  const monthCost = dayCost * 30;

  // p50/p95 from fixed network and queue cost plus streaming output time at the tier's token rate.
  const netMs = 180;
  const outMs = (outTok / TPS[billedTier]) * 1000;
  const p50 = netMs + outMs + spec.baseP50 * 1000;
  const p95 = p50 * 1.7;

  const rows = [
    { k: "Cache writes", tok: writeTokens, cost: (writeTokens * CACHE_WRITE * spec.inPrice) / 1e6 * rate, bar: "bg-info" },
    { k: "Cache reads", tok: readTokens, cost: (readTokens * CACHE_READ * spec.inPrice) / 1e6 * rate, bar: "bg-good" },
    { k: "Fresh input", tok: plainTokens, cost: (plainTokens * spec.inPrice) / 1e6 * rate, bar: "bg-accent" },
    { k: "Output", tok: outTok, cost: (outTok * spec.outPrice) / 1e6 * rate, bar: "bg-bad" },
  ].filter((r) => r.tok > 0);
  const maxCost = Math.max(...rows.map((r) => r.cost), 0.000001);

  const toggleLever = (k: LeverId) => setLevers((v) => ({ ...v, [k]: !v[k] }));

  // A lever that saves nothing on this shape is worth saying out loud.
  const cacheUseful = useCache && hit > 0;
  const batchUseful = levers.batch;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="space-y-2.5 rounded-xl border border-line bg-bg/60 p-3">
          <p className="text-xs font-medium text-muted">Your workload</p>
          <Slider label="Requests per day" value={perDay} min={100} max={1_000_000} step={100} fmt={(n) => n.toLocaleString("en-US")} onChange={setPerDay} />
          <Slider label="Average input tokens" value={inTok} min={200} max={60_000} step={100} fmt={(n) => n.toLocaleString("en-US")} onChange={setInTok} />
          <Slider label="Average output tokens" value={outTok} min={20} max={8000} step={20} fmt={(n) => n.toLocaleString("en-US")} onChange={setOutTok} />
          <Slider label="Cache hit rate" value={hit} min={0} max={100} step={5} fmt={(n) => `${n}%`} onChange={setHit} suffix="of requests hit a warm prefix" />

          <div>
            <p className="text-xs font-medium text-muted">Model tier</p>
            <div className="mt-1 grid grid-cols-3 gap-1.5">
              {(Object.keys(TIERS) as Tier[]).map((k) => (
                <Pill key={k} on={tier === k} onClick={() => setTier(k)} label={`Model tier: ${TIERS[k].name}`}>
                  {TIERS[k].name}
                </Pill>
              ))}
            </div>
            <p className="mt-1 font-mono text-[11px] text-muted">
              ${TIERS[tier].inPrice} in / ${TIERS[tier].outPrice} out per Mtok
            </p>
          </div>

          <Toggle on={batch} onClick={() => setBatch((v) => !v)} label="Submit through Message Batches" />

          <div className="rounded-lg bg-surface-2/60 p-2.5">
            <p className="font-mono text-[11px] text-muted">
              per request = ({Math.round(writeTokens).toLocaleString("en-US")} × {CACHE_WRITE}× + {Math.round(readTokens).toLocaleString("en-US")} × {CACHE_READ}× + {Math.round(plainTokens).toLocaleString("en-US")} × 1×) × ${spec.inPrice} ÷ 1e6
              <br />
              + {outTok.toLocaleString("en-US")} × ${spec.outPrice} ÷ 1e6, all × {rate} for {batch ? "batching" : "real time"}
            </p>
          </div>
        </div>

        <div className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <Big k="Cost per request" v={`$${perReq.toFixed(4)}`} sub={batch ? "batched rate applied" : "real-time rate"} icon={<Percent size={13} aria-hidden />} />
            <Big k="Cost per day" v={`$${dayCost < 1000 ? dayCost.toFixed(2) : dayCost.toLocaleString("en-US", { maximumFractionDigits: 0 })}`} sub={`${perDay.toLocaleString("en-US")} requests`} icon={<DatabaseZap size={13} aria-hidden />} />
            <Big k="Cost per month" v={`$${monthCost < 10000 ? monthCost.toFixed(0) : monthCost.toLocaleString("en-US", { maximumFractionDigits: 0 })}`} sub="30 days, all features" icon={<Layers size={13} aria-hidden />} />
            <Big k="p50 / p95 latency" v={`${(p50 / 1000).toFixed(1)} / ${(p95 / 1000).toFixed(1)} s`} sub={`${Math.round(outMs)} ms generating output`} icon={<Timer size={13} aria-hidden />} />
          </div>

          <div className="rounded-xl border border-line bg-bg/60 p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
              <Boxes size={13} aria-hidden />
              Where the cost goes, per request
            </p>
            <ul className="mt-2 space-y-2">
              {rows.map((r) => (
                <li key={r.k} className="text-xs">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-ink-2">{r.k}</span>
                    <span className="font-mono text-ink">
                      {Math.round(r.tok).toLocaleString("en-US")} tok · ${r.cost.toFixed(5)}
                      <span className="sr-only">, {Math.round((r.cost / perReq) * 100)} percent of the per-request cost</span>
                    </span>
                  </div>
                  <div className="mt-0.5 h-2 overflow-hidden rounded-full bg-surface-2">
                    <motion.div
                      className={clsx("h-full rounded-full", r.bar)}
                      initial={reduce ? false : { width: 0 }}
                      animate={{ width: `${(r.cost / maxCost) * 100}%` }}
                      transition={{ duration: reduce ? 0 : 0.5, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-ink-2">
              Output is {Math.round(((outputCost / perReq) * 100) || 0)}% of the bill on this shape. Input dominates only when the cached prefix is small or the cache is cold.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-line bg-surface p-3">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
          <Scissors size={13} aria-hidden />
          Levers. Toggle one and watch which row above moves.
        </p>
        <div className="mt-2 grid grid-cols-1 gap-2 @lg:grid-cols-2 @2xl:grid-cols-4">
          {(Object.keys(LEVERS) as LeverId[]).map((k) => (
            <div key={k} className={clsx("rounded-lg border p-2.5", levers[k] ? "border-accent-strong bg-accent-soft" : "border-line bg-bg/50")}>
              <Toggle on={levers[k]} onClick={() => toggleLever(k)} label={`Lever: ${LEVERS[k].label}`} />
              <p className="mt-1 text-[11px] leading-snug text-ink-2">{LEVERS[k].detail}</p>
            </div>
          ))}
        </div>
        <div className="mt-2.5 space-y-1.5">
          <Readout
            tone={cacheUseful ? "good" : "warn"}
            text={
              useCache
                ? hit > 0
                  ? `${hit}% of requests read the prefix at ${CACHE_READ}× instead of ${CACHE_WRITE}×. Raising the hit rate above ${hit}% saves less and less, because the write already happened.`
                  : "No hits at all: every request pays a cache write at 1.25x and gets nothing back. Caching without a stable prefix is a 25% surcharge, not a discount."
                : "Caching off: every one of those input tokens is billed at full price, on every request."
            }
          />
          <Readout
            tone={batchUseful ? "good" : "warn"}
            text={batch ? `Half price on both input and output: $${perReq.toFixed(5)} per request. Nothing is streaming and there is no latency guarantee, so this is wrong for anything a person is watching.` : "Realtime: full price, streamed, and p50 is the number your users feel."}
          />
          <Readout
            tone={levers.small ? "warn" : "muted"}
            text={levers.small ? `Now billing at ${spec.name} rates. Cheaper and faster, and the quality may have dropped. Re-run your eval before you ship it.` : "A smaller model cuts input and output together, so it is the only lever that moves latency as well as cost."}
          />
          <Readout
            tone={levers.trim ? "good" : "muted"}
            text={levers.trim ? `Context trimmed by a quarter: ${Math.round(effIn).toLocaleString("en-US")} input tokens per request, saving $${(((inTok - effIn) * spec.inPrice) / 1e6 * rate).toFixed(5)} before any caching applies. It compounds with every other lever.` : `Trimming context is a flat 25% cut in input tokens, worth $${(((inTok * 0.25) * spec.inPrice) / 1e6 * rate).toFixed(5)} a request here. No infrastructure needed, and it shortens the prompt too.`}
          />
        </div>
      </div>

      <p className="min-w-0 text-[0.95rem] text-ink-2" aria-live="polite">
        <span className="mr-2 font-display font-semibold text-ink tabular">${perReq.toFixed(5)}/req</span>
        At {perDay.toLocaleString("en-US")} requests a day this feature costs ${monthCost < 10000 ? monthCost.toFixed(0) : monthCost.toLocaleString("en-US", { maximumFractionDigits: 0 })} a month. Pull a lever, watch the breakdown move, then check the quality number on the model-selection visual before you ship it.
      </p>
    </div>
  );
}

function Readout({ tone, text }: { tone: "good" | "warn" | "muted"; text: string }) {
  return (
    <p className={clsx("flex items-start gap-1.5 rounded-lg px-2.5 py-1.5 text-xs", tone === "good" && "bg-good-soft text-good", tone === "warn" && "bg-accent-soft text-accent-text", tone === "muted" && "bg-surface-2 text-ink-2")}>
      {tone === "good" ? <Zap size={13} className="mt-0.5 shrink-0" aria-hidden /> : tone === "warn" ? <Cpu size={13} className="mt-0.5 shrink-0" aria-hidden /> : null}
      <span>{text}</span>
    </p>
  );
}

function Slider({ label, value, min, max, step, fmt, onChange, suffix }: { label: string; value: number; min: number; max: number; step: number; fmt: (n: number) => string; onChange: (n: number) => void; suffix?: string }) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-ink-2">{label}</span>
        <span className="font-mono text-ink">{fmt(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={`${label}, ${fmt(value)}${suffix ? `, ${suffix}` : ""}`}
        className="mt-1 w-full accent-[var(--accent-strong)]"
      />
      {suffix ? <span className="text-[11px] text-muted">{suffix}</span> : null}
    </label>
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

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  const reduce = useReducedMotion();
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onClick} className="flex w-full items-center gap-2 text-left text-xs font-medium text-ink">
      <span className={clsx("relative h-5 w-9 shrink-0 rounded-full transition-colors", on ? "bg-accent-strong" : "bg-line-strong")}>
        <motion.span className="absolute top-0.5 size-4 rounded-full bg-surface" animate={{ left: on ? 18 : 2 }} transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 30 }} />
      </span>
      {label}
    </button>
  );
}

function Big({ k, v, sub, icon }: { k: string; v: string; sub: string; icon: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-surface px-2.5 py-2">
      <p className="flex items-center gap-1 text-[11px] font-medium text-muted">
        <span aria-hidden>{icon}</span>
        {k}
      </p>
      <p className="font-display text-xl font-bold tabular text-ink">{v}</p>
      <p className="text-[11px] text-muted">{sub}</p>
    </div>
  );
}