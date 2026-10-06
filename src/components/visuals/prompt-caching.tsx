"use client";

import { useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useHydratedReducedMotion } from "@/lib/use-reduced-motion";
import { clsx } from "clsx";
import { Bookmark, ChevronLeft, ChevronRight, PencilLine, RotateCcw } from "lucide-react";

type Level = "tools" | "system" | "messages";
type Status = "read" | "write" | "plain";

interface Block {
  level: Level;
  name: string;
  plain: string;
  tokens: number;
  volatile?: boolean;
}

const BLOCKS: Block[] = [
  { level: "tools", name: "search_orders", plain: "A tool Claude may call", tokens: 900 },
  { level: "tools", name: "issue_refund", plain: "Another tool definition", tokens: 1100 },
  { level: "system", name: "Role and rules", plain: "Who Claude is and how it behaves", tokens: 1500 },
  { level: "system", name: "Refund policy, 20 pages", plain: "Long reference material", tokens: 6000 },
  { level: "messages", name: "Earlier user turn", plain: "Conversation so far", tokens: 300 },
  { level: "messages", name: "Earlier Claude reply", plain: "Conversation so far", tokens: 400 },
  { level: "messages", name: "New question", plain: "Different on every request", tokens: 120, volatile: true },
];
const LAST = BLOCKS.length - 1;
const TOTAL = BLOCKS.reduce((s, b) => s + b.tokens, 0);
const CUM = BLOCKS.map((_, i) => BLOCKS.slice(0, i + 1).reduce((s, b) => s + b.tokens, 0));
const MAX_BP = 4;
const READ = 0.1;
const GAPS = [1, 2, 4, 6, 10, 20, 30, 45, 60, 75, 90];
const MINS = [
  { tokens: 512, label: "512", eg: "e.g. Sonnet 5.5, Opus 5.5" },
  { tokens: 1024, label: "1,024", eg: "e.g. Sonnet 5" },
  { tokens: 4096, label: "4,096", eg: "e.g. Haiku 4.5" },
];
const PHASES = ["Build the request", "Request 1", "Request 2"];
const LEVEL_COLOR: Record<Level, string> = { tools: "var(--info)", system: "var(--accent-strong)", messages: "var(--good)" };

const fmt = (n: number) => n.toLocaleString("en-US");
const statusLabel = (s: Status, writeMult: number) => (s === "read" ? `read ${READ}x` : s === "write" ? `write ${writeMult}x` : "normal 1x");

interface Result {
  status: Status[];
  read: number;
  write: number;
  plain: number;
  cost: number;
  hitBp: number;
}

function simulate(bps: number[], minLen: number, writeMult: number, req: 1 | 2, alive: boolean, firstChange: number): Result {
  const valid = bps.filter((b) => CUM[b] >= minLen);
  const lastBp = valid.length ? Math.max(...valid) : -1;
  const hits = req === 2 && alive ? valid.filter((b) => b < firstChange) : [];
  const hitBp = hits.length ? Math.max(...hits) : -1;
  const status: Status[] = BLOCKS.map((_, i) => (i <= hitBp ? "read" : i <= lastBp ? "write" : "plain"));
  const sum = (s: Status) => BLOCKS.reduce((acc, b, i) => acc + (status[i] === s ? b.tokens : 0), 0);
  const read = sum("read");
  const write = sum("write");
  const plain = sum("plain");
  return { status, read, write, plain, cost: read * READ + write * writeMult + plain, hitBp };
}

// Gap slider uses an uneven scale so 5 minutes and 60 minutes are both easy to see.
function gapPos(min: number) {
  for (let i = 0; i < GAPS.length - 1; i++) {
    if (min <= GAPS[i + 1]) return i + (min - GAPS[i]) / (GAPS[i + 1] - GAPS[i]);
  }
  return GAPS.length - 1;
}

export default function PromptCaching() {
  const reduce = useHydratedReducedMotion();
  const [phase, setPhase] = useState(0);
  const [bps, setBps] = useState<number[]>([3]);
  const [changed, setChanged] = useState<number[]>([]);
  const [ttl, setTtl] = useState<5 | 60>(5);
  const [minIdx, setMinIdx] = useState(1);
  const [gapIdx, setGapIdx] = useState(1);
  const [limitHit, setLimitHit] = useState(0);

  const gap = GAPS[gapIdx];
  const minLen = MINS[minIdx].tokens;
  const writeMult = ttl === 5 ? 1.25 : 2;
  const alive = gap <= ttl;
  const firstChange = Math.min(LAST, ...changed);
  const r1 = simulate(bps, minLen, writeMult, 1, alive, firstChange);
  const r2 = simulate(bps, minLen, writeMult, 2, alive, firstChange);
  const shown = phase === 1 ? r1 : phase === 2 ? r2 : null;
  const tooShort = bps.filter((b) => CUM[b] < minLen);

  const toggleBp = (i: number) => {
    if (bps.includes(i)) return setBps(bps.filter((b) => b !== i));
    if (bps.length >= MAX_BP) return setLimitHit((n) => n + 1);
    setBps([...bps, i].sort((a, b) => a - b));
  };
  const toggleChange = (i: number) => setChanged(changed.includes(i) ? changed.filter((c) => c !== i) : [...changed, i]);
  const reset = () => {
    setPhase(0);
    setBps([3]);
    setChanged([]);
    setTtl(5);
    setMinIdx(1);
    setGapIdx(1);
    setLimitHit(0);
  };
  const onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setPhase((p) => Math.min(2, p + 1));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setPhase((p) => Math.max(0, p - 1));
    }
  };

  const pct = (r: Result) => Math.round((r.cost / TOTAL) * 100);
  let explain: string;
  if (phase === 0) {
    explain = `Claude reads every request in a fixed order: tools, then system, then messages. A breakpoint (the bookmark) means "save everything up to here". You are using ${bps.length} of ${MAX_BP}.`;
    if (tooShort.length) explain += ` A breakpoint sits on a prefix shorter than ${MINS[minIdx].label} tokens, so that one won't cache. No error, it just silently doesn't.`;
  } else if (phase === 1) {
    explain =
      r1.write === 0
        ? bps.length === 0
          ? "No breakpoints, so nothing is cached. Every request pays full price for every token."
          : `The prefix up to your breakpoint is under this model's ${MINS[minIdx].label}-token minimum. The API raises no error; it simply doesn't cache.`
        : `First request: the cache is empty, so the prefix up to the last breakpoint is written at ${writeMult}x the normal input price. This request costs ${pct(r1)}% of sending it without caching. You pay a little extra now to save later.`;
  } else if (r2.read > 0) {
    explain = `Cache hit. The first ${fmt(r2.read)} tokens are identical, so they are read at ${READ}x the price (most models; some newer ones are cheaper still) and skip reprocessing, which makes the reply start sooner. This request costs ${pct(r2)}% of no caching.`;
    if (r2.write > 0) explain += ` Content after the hit point was new, so it was written again.`;
  } else if (r1.write === 0) {
    explain = "Nothing was cached in request 1, so there is nothing to read. Request 2 pays full price again.";
  } else if (!alive) {
    explain = `The gap (${gap} min) is longer than the ${ttl === 5 ? "5-minute" : "1-hour"} lifetime, so the cache expired. The prefix is written again at ${writeMult}x.`;
  } else {
    explain = `You changed "${BLOCKS[firstChange].name}". The cache only matches a 100% identical prefix, so that block and everything after it must be processed again. Changes early in the order cost the most.`;
  }

  const ariaSvg = shown
    ? `Request ${phase}: ${fmt(shown.read)} tokens read from cache, ${fmt(shown.write)} written to cache, ${fmt(shown.plain)} processed normally. Input cost ${pct(shown)} percent of no caching.`
    : "No request sent yet.";

  return (
    <div className="space-y-4" onKeyDown={onKey}>
      {/* Phase stepper */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Simulation steps. Left and right arrow keys move between steps.">
        {PHASES.map((p, i) => (
          <button
            key={p}
            type="button"
            onClick={() => setPhase(i)}
            aria-label={`Step ${i + 1}: ${p}`}
            aria-pressed={phase === i}
            className={clsx(
              "relative rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              phase === i ? "border-ink text-bg" : "border-line-strong bg-surface text-ink-2 hover:border-ink",
            )}
          >
            {phase === i ? (
              <motion.span layoutId="pc-phase" className="absolute inset-0 rounded-full bg-ink" transition={{ duration: reduce ? 0 : 0.3 }} />
            ) : null}
            <span className="relative tabular">
              {i + 1}. {p}
            </span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {/* Request stack */}
        <div className="min-w-0 rounded-xl bg-surface-2/50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-x-2 px-1 pb-2 text-xs font-medium text-muted">
            <span>The request, in the order Claude reads it</span>
            <span className="font-mono tabular" aria-live="polite">
              breakpoints {bps.length}/{MAX_BP}
            </span>
          </div>
          <ol className="space-y-1" aria-label="Request blocks">
            {BLOCKS.map((b, i) => {
              const st = shown?.status[i];
              const isChanged = phase === 2 && (changed.includes(i) || i === LAST);
              const newLevel = i === 0 || BLOCKS[i - 1].level !== b.level;
              const hasBp = bps.includes(i);
              return (
                <li key={b.name}>
                  {newLevel ? (
                    <p className="mt-2 mb-1 px-1 font-mono text-[11px] font-semibold tracking-wide uppercase" style={{ color: LEVEL_COLOR[b.level] }}>
                      {b.level}
                    </p>
                  ) : null}
                  <div className="group relative overflow-hidden rounded-lg border border-line bg-surface">
                    <motion.div
                      aria-hidden
                      className={clsx("absolute inset-0 origin-left", st === "read" ? "bg-good-soft" : st === "write" ? "bg-accent-soft" : "bg-transparent")}
                      initial={false}
                      animate={{ scaleX: st && st !== "plain" ? 1 : 0 }}
                      transition={{ duration: reduce ? 0 : 0.45, delay: reduce ? 0 : i * 0.07, ease: [0.22, 1, 0.36, 1] }}
                    />
                    <div className="relative flex items-center gap-2 py-1.5 pr-1.5 pl-2.5">
                      <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: LEVEL_COLOR[b.level] }} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">{b.name}</p>
                        <p className="truncate text-xs text-muted">
                          <span className="font-mono tabular">{fmt(b.tokens)} tokens</span>
                          {" · "}
                          {st ? (
                            // On narrow screens the status badge is hidden, so say it here instead of relying on colour alone.
                            <span className={clsx("font-mono font-semibold @lg:hidden", st === "read" ? "text-good" : st === "write" ? "text-accent-text" : "text-ink-2")}>
                              {statusLabel(st, writeMult)}
                            </span>
                          ) : null}
                          <span className={st ? "@max-lg:hidden" : undefined}>{b.plain}</span>
                        </p>
                      </div>
                      {st ? (
                        <span
                          className={clsx(
                            "hidden shrink-0 rounded-md px-1.5 py-0.5 font-mono text-xs font-semibold @lg:inline",
                            st === "read" ? "text-good" : st === "write" ? "text-accent-text" : "text-muted",
                          )}
                        >
                          {statusLabel(st, writeMult)}
                        </span>
                      ) : null}
                      {isChanged ? <span className="shrink-0 rounded-md bg-bad-soft px-1.5 py-0.5 font-mono text-xs font-semibold text-bad">changed</span> : null}
                      <IconToggle
                        label={b.volatile ? "This block changes on every request" : `${changed.includes(i) ? "Undo change to" : "Change"} ${b.name} before request 2`}
                        on={b.volatile || changed.includes(i)}
                        disabled={b.volatile}
                        tone="bad"
                        onClick={() => toggleChange(i)}
                      >
                        <PencilLine size={15} />
                      </IconToggle>
                      <IconToggle label={`${hasBp ? "Remove" : "Add"} cache breakpoint after ${b.name}`} on={hasBp} tone="accent" onClick={() => toggleBp(i)}>
                        <Bookmark size={15} fill={hasBp ? "currentColor" : "none"} />
                      </IconToggle>
                    </div>
                  </div>
                  <AnimatePresence initial={false}>
                    {hasBp ? (
                      <motion.div
                        initial={reduce ? false : { height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                        transition={{ duration: reduce ? 0 : 0.25 }}
                        className="overflow-hidden"
                      >
                        <div className="flex items-center gap-2 px-1 py-1">
                          <span className="h-0 min-w-4 flex-1 border-t-2 border-dashed" style={{ borderColor: CUM[i] < minLen ? "var(--bad)" : "var(--accent-strong)" }} />
                          <span className={clsx("min-w-0 font-mono text-[11px] font-semibold wrap-anywhere", CUM[i] < minLen ? "text-bad" : "text-accent-text")}>
                            cache_control · prefix {fmt(CUM[i])} tok{CUM[i] < minLen ? " · below minimum" : ""}
                          </span>
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </li>
              );
            })}
          </ol>
          <AnimatePresence>
            {limitHit > 0 && bps.length >= MAX_BP ? (
              <motion.p
                key={limitHit}
                initial={reduce ? false : { x: -6 }}
                animate={{ x: [6, -4, 2, 0] }}
                transition={{ duration: reduce ? 0 : 0.35 }}
                className="mt-2 rounded-md bg-bad-soft px-2 py-1 text-xs font-medium text-bad"
                role="status"
              >
                The API allows at most 4 breakpoints per request. Remove one first.
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>

        {/* Settings and results */}
        <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-line bg-bg/60 p-3">
          <Segmented
            label="Cache lifetime (TTL)"
            options={["5 min · write 1.25x", "1 hour · write 2x"]}
            value={ttl === 5 ? 0 : 1}
            onChange={(v) => setTtl(v === 0 ? 5 : 60)}
          />
          <Segmented label="Model's minimum cacheable length" options={MINS.map((m) => `${m.label} tok`)} value={minIdx} onChange={setMinIdx} hint={MINS[minIdx].eg} />

          <div>
            <label htmlFor="pc-gap" className="flex flex-wrap justify-between gap-x-2 text-xs font-medium text-muted">
              <span>Wait before request 2</span>
              <span className={clsx("font-mono tabular", alive ? "text-good" : "text-bad")}>
                {gap} min · {alive ? "cache alive" : "expired"}
              </span>
            </label>
            <svg viewBox="0 0 300 22" className="mt-1 h-auto w-full max-w-md" aria-hidden>
              <rect x="0" y="8" width="300" height="6" rx="3" fill="var(--surface-2)" />
              <motion.rect
                x="0"
                y="8"
                height="6"
                rx="3"
                fill="var(--good)"
                opacity={0.55}
                initial={false}
                animate={{ width: (gapPos(ttl) / (GAPS.length - 1)) * 300 }}
                transition={{ duration: reduce ? 0 : 0.4 }}
              />
              <motion.circle
                cy="11"
                r="6"
                fill={alive ? "var(--good)" : "var(--bad)"}
                stroke="var(--surface)"
                strokeWidth="2"
                initial={false}
                animate={{ cx: Math.min(294, Math.max(6, (gapIdx / (GAPS.length - 1)) * 300)) }}
                transition={{ duration: reduce ? 0 : 0.25 }}
              />
            </svg>
            <input
              id="pc-gap"
              type="range"
              min={0}
              max={GAPS.length - 1}
              value={gapIdx}
              onChange={(e) => setGapIdx(Number(e.target.value))}
              aria-valuetext={`${gap} minutes`}
              className="w-full accent-[var(--accent-strong)]"
            />
            <p className="text-xs text-muted">Green bar is the TTL. Each cache hit resets the timer for free.</p>
          </div>

          <div>
            <p className="text-xs font-medium text-muted">Input cost relative to no caching</p>
            <svg viewBox="0 0 300 92" className="mt-1 h-auto w-full max-w-md" role="img" aria-label={ariaSvg}>
              {[r1, r2].map((r, k) => {
                const visible = phase > k;
                const y = 6 + k * 40;
                const scale = 150 / TOTAL;
                const segs = [
                  { w: r.read * READ * scale, fill: "var(--good)" },
                  { w: r.write * writeMult * scale, fill: "var(--accent)" },
                  { w: r.plain * scale, fill: "var(--line-strong)" },
                ];
                let x = 0;
                return (
                  <g key={k}>
                    <text x="0" y={y + 8} fill="var(--ink-2)" style={{ font: "600 14px var(--font-sans)" }}>
                      Request {k + 1}
                    </text>
                    <text x="300" y={y + 8} textAnchor="end" fill={visible ? "var(--ink)" : "var(--muted)"} style={{ font: "600 14px var(--font-mono)" }}>
                      {visible ? `${pct(r)}%` : "not sent"}
                    </text>
                    <rect x="0" y={y + 12} width="300" height="14" rx="4" fill="var(--surface-2)" />
                    {segs.map((s, j) => {
                      const sx = x;
                      x += s.w;
                      return (
                        <motion.rect
                          key={j}
                          y={y + 12}
                          height="14"
                          fill={s.fill}
                          initial={false}
                          animate={{ x: visible ? sx : 0, width: visible ? s.w : 0 }}
                          transition={{ duration: reduce ? 0 : 0.6, ease: [0.22, 1, 0.36, 1] }}
                        />
                      );
                    })}
                  </g>
                );
              })}
              <line x1="150" x2="150" y1="14" y2="88" stroke="var(--ink)" strokeDasharray="3 3" strokeWidth="1.25" />
              <text x="154" y="90" fill="var(--ink-2)" style={{ font: "500 13px var(--font-mono)" }}>
                1x = no cache
              </text>
            </svg>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-2">
              <Legend color="var(--good)" text="read 0.1x (most models)" />
              <Legend color="var(--accent)" text={`write ${writeMult}x`} />
              <Legend color="var(--line-strong)" text="normal 1x" />
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-muted">
              <code className="font-mono">usage</code> in the API response. Both cache fields at 0 means nothing was cached.
            </p>
            <dl className="mt-1 space-y-1 font-mono text-xs" aria-label="Usage fields">
              {[
                ["cache_read_input_tokens", shown?.read, "text-good"],
                ["cache_creation_input_tokens", shown?.write, "text-accent-text"],
                ["input_tokens", shown?.plain, "text-ink"],
              ].map(([k, v, c]) => (
                <div key={k as string} className="flex items-center justify-between gap-2 rounded-md border border-line bg-surface px-2 py-1">
                  <dt className="min-w-0 wrap-anywhere text-muted">{k}</dt>
                  <dd className={clsx("shrink-0 font-semibold tabular", c as string)}>{v === undefined ? "–" : fmt(v as number)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 @lg:flex-row @lg:items-center @lg:justify-between">
        <p className="min-h-12 min-w-0 text-[0.95rem] text-ink-2" aria-live="polite">
          <span className="mr-2 font-display font-semibold text-ink tabular">{phase + 1}/3</span>
          {explain}
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          <CtrlButton label="Previous step" onClick={() => setPhase((p) => Math.max(0, p - 1))} disabled={phase === 0}>
            <ChevronLeft size={18} />
          </CtrlButton>
          <CtrlButton label="Next step" onClick={() => setPhase((p) => Math.min(2, p + 1))} disabled={phase === 2}>
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

function IconToggle(props: { label: string; on: boolean; tone: "accent" | "bad"; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  const { label, on, tone, disabled, onClick, children } = props;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={on}
      title={label}
      className={clsx(
        "grid size-8 shrink-0 place-items-center rounded-lg border transition-colors active:scale-95 disabled:cursor-not-allowed",
        on
          ? tone === "accent"
            ? "border-accent-strong bg-accent-soft text-accent-text"
            : "border-bad bg-bad-soft text-bad"
          : "border-line bg-surface text-muted hover:border-ink hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function Segmented({ label, options, value, onChange, hint }: { label: string; options: string[]; value: number; onChange: (v: number) => void; hint?: string }) {
  return (
    <div>
      <p className="flex flex-wrap justify-between gap-x-2 text-xs font-medium text-muted">
        <span>{label}</span>
        {hint ? <span>{hint}</span> : null}
      </p>
      <div
        className="mt-1 grid gap-1 rounded-lg border border-line bg-surface p-0.5"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
        role="group"
        aria-label={label}
      >
        {options.map((o, i) => (
          <button
            key={o}
            type="button"
            onClick={() => onChange(i)}
            aria-pressed={value === i}
            aria-label={`${label}: ${o}`}
            className={clsx("min-w-0 rounded-md px-2 py-1 font-mono text-xs font-semibold wrap-anywhere transition-colors", value === i ? "bg-ink text-bg" : "text-ink-2 hover:text-ink")}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

function Legend({ color, text }: { color: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="size-2.5 rounded-sm" style={{ background: color }} />
      {text}
    </span>
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
