"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion, type Transition } from "motion/react";
import clsx from "clsx";
import { ChevronLeft, ChevronRight, Database, ListOrdered, Quote, Scissors, Search, Sparkles, Stethoscope, type LucideIcon } from "lucide-react";

type StageId = "chunk" | "context" | "index" | "retrieve" | "rerank" | "ground" | "diagnose";
type Tone = "good" | "bad" | "info";

const STAGES: { id: StageId; label: string; icon: LucideIcon; plain: string }[] = [
  { id: "chunk", label: "Chunk", icon: Scissors, plain: "Cut long documents into small passages (chunks) that can be searched one at a time." },
  { id: "context", label: "Contextualise", icon: Sparkles, plain: "Before filing each chunk, add a line saying where it came from, so it still makes sense on its own." },
  { id: "index", label: "Index", icon: Database, plain: "File every chunk twice: by meaning (embeddings) and by exact words (BM25), with metadata such as source and date." },
  { id: "retrieve", label: "Retrieve", icon: Search, plain: "Turn the question into a search and pull back the top-k most likely chunks. Cast the net wide." },
  { id: "rerank", label: "Rerank", icon: ListOrdered, plain: "A reranker re-reads each candidate against the question and moves the best ones to the top." },
  { id: "ground", label: "Ground & cite", icon: Quote, plain: "Claude answers only from the chunks it was given, and points to the exact passage it used." },
  { id: "diagnose", label: "Diagnose", icon: Stethoscope, plain: "When an answer is wrong, check what was retrieved before blaming the model." },
];

const DOC = [
  "ACME Corp, Q2 2025 report.",
  "Section 3: Financial results.",
  "Revenue grew 3% over last quarter,",
  "driven by cloud subscriptions.",
  "Operating costs fell 2%.",
  "Section 4: Outlook.",
  "Hiring will slow in Q3.",
  "New offices open in Lisbon.",
];
const SIZES = { small: 1, medium: 3, large: 8 } as const;
type Size = keyof typeof SIZES;

const QUESTION = "What was ACME's revenue growth in Q2 2025?";
const GOLD = { title: "ACME Q2 2025 · Financial results", text: "Revenue grew 3% over the previous quarter, driven by cloud subscriptions." };
const DISTRACTORS = [
  { title: "ACME Q1 2025 · Financial results", text: "Revenue grew 5% on hardware sales." },
  { title: "Globex Q2 2025 · Results", text: "Revenue rose 4% year on year." },
  { title: "ACME Q2 2025 · Financial results", text: "Operating costs fell 2%." },
  { title: "ACME 2024 annual report", text: "We expect steady revenue growth." },
  { title: "ACME Q2 2025 · Outlook", text: "Hiring will slow in Q3." },
];
const K_OPTIONS = [5, 10, 20] as const;

// Illustrative ranks for the correct chunk; direction matches Anthropic's Contextual Retrieval findings.
const goldRank = (hybrid: boolean, contextual: boolean) => (hybrid && contextual ? 3 : contextual ? 7 : hybrid ? 8 : 14);
const TO_CLAUDE = 3; // this demo passes the top 3 to Claude; Anthropic's write-up passed the top 20

export default function RagPipeline() {
  const reduce = !!useReducedMotion();
  const [stage, setStage] = useState(0);
  const [size, setSize] = useState<Size>("small");
  const [overlap, setOverlap] = useState(false);
  const [contextual, setContextual] = useState(false);
  const [hybrid, setHybrid] = useState(true);
  const [k, setK] = useState<number>(5);
  const [reranked, setReranked] = useState(false);
  const [allowIdk, setAllowIdk] = useState(true);

  const rank = goldRank(hybrid, contextual);
  const hit = rank <= k;
  const inPrompt = hit && (reranked || rank <= TO_CLAUDE);
  const s = STAGES[stage];
  const go = (i: number) => setStage(Math.max(0, Math.min(STAGES.length - 1, i)));
  const onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      go(stage + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(stage - 1);
    }
  };
  const spring: Transition = reduce ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 32 };

  return (
    <div className="space-y-4" onKeyDown={onKey}>
      {/* Stage rail */}
      <div tabIndex={0} role="group" aria-label="Retrieval pipeline stages. Use left and right arrow keys to move between stages." className="relative rounded-xl bg-surface-2/50 p-2">
        <div className="absolute top-[29px] h-0.5 bg-line @lg:top-[33px]" style={{ left: "calc(0.5rem + 7.14%)", width: "calc(85.7% - 1rem)" }} aria-hidden />
        <motion.div
          aria-hidden
          className="absolute top-[29px] h-0.5 origin-left bg-accent-strong @lg:top-[33px]"
          style={{ left: "calc(0.5rem + 7.14%)", width: "calc(85.7% - 1rem)" }}
          initial={false}
          animate={{ scaleX: stage / (STAGES.length - 1) }}
          transition={spring}
        />
        <ol className="relative grid grid-cols-7 gap-0.5 @lg:gap-1">
          {STAGES.map((st, i) => {
            const Icon = st.icon;
            const on = i === stage;
            const done = i < stage;
            return (
              <li key={st.id} className="flex justify-center">
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-label={`Stage ${i + 1}: ${st.label}`}
                  title={st.label}
                  aria-current={on ? "step" : undefined}
                  className="group flex flex-col items-center gap-1.5 rounded-lg px-0.5 py-1 @lg:px-1"
                >
                  <span
                    className={clsx(
                      "relative grid size-9 place-items-center rounded-full border transition-colors @lg:size-11",
                      on ? "border-accent-strong bg-ink text-bg" : done ? "border-accent-strong bg-accent-soft text-accent-text" : "border-line-strong bg-surface text-muted group-hover:border-ink group-hover:text-ink",
                    )}
                  >
                    {on && !reduce ? (
                      <motion.span layoutId="rag-halo" className="absolute -inset-1.5 rounded-full border-2 border-accent/60" transition={spring} />
                    ) : null}
                    <Icon size={18} />
                  </span>
                  <span className={clsx("hidden text-center text-xs leading-tight @lg:block", on ? "font-semibold text-ink" : "text-muted")}>{st.label}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="flex flex-col gap-3 @lg:flex-row @lg:items-start @lg:justify-between">
        <p className="text-[0.95rem] text-ink-2" aria-live="polite">
          <span className="mr-2 font-display font-semibold text-ink tabular">
            {stage + 1}/{STAGES.length} {s.label}
          </span>
          {s.plain}
        </p>
        <div className="flex shrink-0 gap-1.5">
          <CtrlButton label="Previous stage" onClick={() => go(stage - 1)} disabled={stage === 0}>
            <ChevronLeft size={18} />
          </CtrlButton>
          <CtrlButton label="Next stage" onClick={() => go(stage + 1)} disabled={stage === STAGES.length - 1}>
            <ChevronRight size={18} />
          </CtrlButton>
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={s.id}
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, y: -6 }}
          transition={{ duration: reduce ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="min-h-72 rounded-xl border border-line bg-bg/60 p-3 @lg:p-4"
        >
          {s.id === "chunk" && <ChunkStage size={size} setSize={setSize} overlap={overlap} setOverlap={setOverlap} reduce={reduce} />}
          {s.id === "context" && <ContextStage on={contextual} set={setContextual} reduce={reduce} />}
          {s.id === "index" && <IndexStage hybrid={hybrid} setHybrid={setHybrid} />}
          {s.id === "retrieve" && (
            <RetrieveStage k={k} setK={setK} rank={rank} hybrid={hybrid} setHybrid={setHybrid} contextual={contextual} setContextual={setContextual} reduce={reduce} />
          )}
          {s.id === "rerank" && <RerankStage rank={rank} k={k} reranked={reranked} setReranked={setReranked} spring={spring} />}
          {s.id === "ground" && <GroundStage inPrompt={inPrompt} hit={hit} allowIdk={allowIdk} setAllowIdk={setAllowIdk} reduce={reduce} />}
          {s.id === "diagnose" && <DiagnoseStage />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ---------- Stages ---------- */

function ChunkStage({ size, setSize, overlap, setOverlap, reduce }: { size: Size; setSize: (s: Size) => void; overlap: boolean; setOverlap: (b: boolean) => void; reduce: boolean }) {
  const n = SIZES[size];
  const chunks: number[][] = [];
  for (let start = 0; start < DOC.length; start += n) {
    const end = Math.min(DOC.length, start + n + (overlap && start + n < DOC.length ? 1 : 0));
    chunks.push(Array.from({ length: end - start }, (_, j) => start + j));
  }
  // The chunk that best holds the fact: both halves if any chunk has them, else the one with the first half.
  const answer = chunks.find((c) => c.includes(2) && c.includes(3)) ?? chunks.find((c) => c.includes(2)) ?? [];
  const hasWho = answer.includes(0);
  const hasWhy = answer.includes(3);
  const diluted = answer.length >= 6;
  const [tone, text]: [Tone, string] = diluted
    ? ["bad", "Too large: one chunk holds finance, hiring and offices. Its embedding averages every topic, so it matches lots of questions weakly and wastes context."]
    : !hasWhy
      ? ["bad", "A fact got split across a boundary: \"revenue grew 3%\" is cut off from \"driven by cloud subscriptions\". Try adding overlap."]
      : !hasWho
        ? ["info", "Overlap kept the fact together, but the chunk never says whose revenue or which quarter. Contextualising (next stage) fixes that."]
        : ["good", "Balanced: the revenue chunk keeps the company, the quarter and the cause together without dragging in unrelated topics."];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Seg label="Chunk size" options={["small", "medium", "large"]} value={size} onChange={(v) => setSize(v as Size)} />
        <Toggle label="Overlap" on={overlap} onClick={() => setOverlap(!overlap)} />
      </div>
      {/* One grid row per line; two lanes of chunk bars on the right (alternating lanes so overlapping chunks don't collide). */}
      <ol className="grid grid-cols-[minmax(0,1fr)_10px_10px_auto] gap-x-1.5 rounded-lg border border-line bg-surface p-2 font-mono text-xs @lg:text-[13px]" aria-label={`Report split into ${chunks.length} chunks. ${text}`}>
        {DOC.map((line, i) => {
          const inAnswer = answer.includes(i);
          const starts = chunks.findIndex((c) => c[0] === i);
          return (
            <li key={`${size}-${overlap}-${i}`} className="contents">
              <span className={clsx("min-h-6 rounded-sm px-1.5 py-0.5 leading-5", inAnswer && "bg-accent-soft/60", i === 2 || i === 3 ? "text-ink" : "text-ink-2", (i < 2 || i === 5) && "font-semibold")}>{line}</span>
              {[0, 1].map((lane) => {
                const c = chunks.find((ch, ci) => ci % 2 === lane && ch.includes(i));
                const isAnswer = !!c && c === answer;
                return (
                  <span key={lane} className="relative">
                    {c ? (
                      <motion.span
                        aria-hidden
                        initial={reduce ? false : { scaleY: 0 }}
                        animate={{ scaleY: 1 }}
                        transition={{ duration: reduce ? 0 : 0.3, delay: reduce ? 0 : chunks.indexOf(c) * 0.05 }}
                        className={clsx("absolute inset-y-0.5 left-1/2 w-1 -translate-x-1/2 origin-top", isAnswer ? "bg-accent-strong" : "bg-line-strong", i === c[0] && "rounded-t-full", i === c[c.length - 1] && "rounded-b-full")}
                      />
                    ) : null}
                  </span>
                );
              })}
              <span className={clsx("self-center whitespace-nowrap text-xs font-semibold leading-5", starts >= 0 && chunks[starts] === answer ? "text-accent-text" : "text-muted")}>
                {starts >= 0 ? (
                  <>
                    <span className="hidden @lg:inline">chunk </span>
                    <span className="@lg:hidden">#</span>
                    {starts + 1}
                    {chunks[starts] === answer ? " ★" : ""}
                  </>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>
      <Verdict tone={tone}>{text}</Verdict>
      <p className="text-xs text-muted">
        There are no official chunk sizes: test size, boundaries and overlap on your own data. Corpus under about 200k tokens? You may not need RAG at all; put it in a cached prompt.
      </p>
    </div>
  );
}

function ContextStage({ on, set, reduce }: { on: boolean; set: (b: boolean) => void; reduce: boolean }) {
  const bars = [
    { label: "Contextual embeddings", v: 35 },
    { label: "+ contextual BM25", v: 49 },
    { label: "+ reranking", v: 67 },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div className="space-y-3">
        <Toggle label="Prepend context with Claude" on={on} onClick={() => set(!on)} />
        <div className="rounded-lg border border-line bg-surface p-3 font-mono text-[13px] leading-relaxed">
          <AnimatePresence initial={false}>
            {on ? (
              <motion.p
                key="ctx"
                initial={reduce ? false : { opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={reduce ? undefined : { opacity: 0, height: 0 }}
                className="overflow-hidden rounded bg-accent-soft px-1.5 text-accent-text"
              >
                This chunk is from ACME Corp&apos;s Q2 2025 report, Section 3 (Financial results).
              </motion.p>
            ) : null}
          </AnimatePresence>
          <p className="mt-1 text-ink">{GOLD.text}</p>
        </div>
        <Verdict tone={on ? "good" : "info"}>
          {on
            ? "Now a search for \"ACME Q2 2025 revenue\" can find this chunk by meaning and by exact words. Prompt caching keeps the whole document cached while Claude writes a line for each chunk, so this stays affordable."
            : "On its own the chunk never names ACME or Q2 2025, so a search for those words may miss it. Turn the toggle on."}
        </Verdict>
      </div>
      <div className="space-y-2" aria-label="Reduction in retrieval failures, from Anthropic's Contextual Retrieval study">
        <p className="text-xs font-medium text-muted">Fewer top-20 retrieval failures (Anthropic&apos;s Contextual Retrieval tests){on ? "" : " · turn the toggle on"}</p>
        {bars.map((b, i) => (
          <div key={b.label}>
            <div className="flex justify-between text-xs text-ink-2">
              <span>{b.label}</span>
              <span className="font-semibold text-ink tabular">−{b.v}%</span>
            </div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-surface-2">
              <motion.div
                className="h-full rounded-full bg-accent-strong"
                initial={reduce ? false : { width: 0 }}
                animate={{ width: on ? `${b.v}%` : "4%" }}
                transition={{ duration: reduce ? 0 : 0.6, delay: reduce ? 0 : i * 0.12, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const QUERIES = {
  code: { q: 'error "TS-999"', vector: false, bm25: true, why: "Exact identifiers: embeddings blur TS-999 with TS-998, but BM25 matches the exact token." },
  meaning: { q: "did sales go up?", vector: true, bm25: false, why: "Paraphrase: no shared words with \"revenue grew\", so BM25 misses it, but embeddings match the meaning." },
};

function IndexStage({ hybrid, setHybrid }: { hybrid: boolean; setHybrid: (b: boolean) => void }) {
  const [qk, setQk] = useState<keyof typeof QUERIES>("code");
  const q = QUERIES[qk];
  const found = hybrid || q.vector;
  const lanes = [
    { name: "Vector index", sub: "matches meaning", ok: q.vector, active: true },
    { name: "BM25 index", sub: "matches exact words", ok: q.bm25, active: hybrid },
  ];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Seg label="Query type" options={["code", "meaning"]} names={{ code: "Exact code", meaning: "Paraphrase" }} value={qk} onChange={(v) => setQk(v as keyof typeof QUERIES)} />
        <Toggle label="Hybrid (add BM25)" on={hybrid} onClick={() => setHybrid(!hybrid)} />
      </div>
      <p className="font-mono text-sm text-ink">
        <span className="text-muted">query › </span>
        {q.q}
      </p>
      <div className="grid grid-cols-1 gap-2 @lg:grid-cols-2">
        {lanes.map((l) => (
          <div key={l.name} className={clsx("rounded-lg border p-3 transition-opacity", l.active ? "border-line-strong bg-surface" : "border-dashed border-line opacity-50")}>
            <p className="font-display text-sm font-semibold text-ink">{l.name}</p>
            <p className="text-xs text-muted">{l.sub}</p>
            <p className={clsx("mt-2 font-mono text-xs font-semibold", !l.active ? "text-muted" : l.ok ? "text-good" : "text-bad")}>{!l.active ? "off" : l.ok ? "✓ finds the chunk" : "✗ misses it"}</p>
          </div>
        ))}
      </div>
      <Verdict tone={found ? "good" : "bad"}>
        {q.why} {hybrid ? "Hybrid search merges both result lists, so either kind of query works." : found ? "" : "Vector-only search fails here."}
      </Verdict>
      <p className="text-xs text-muted">Every chunk also carries metadata (source, section, version, date, access labels) for filtering and for citations.</p>
    </div>
  );
}

function RetrieveStage(p: { k: number; setK: (k: number) => void; rank: number; hybrid: boolean; setHybrid: (b: boolean) => void; contextual: boolean; setContextual: (b: boolean) => void; reduce: boolean }) {
  const hit = p.rank <= p.k;
  return (
    <div className="space-y-3">
      <p className="font-mono text-sm text-ink">
        <span className="text-muted">question › </span>
        {QUESTION}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Seg label="Top-k" options={K_OPTIONS.map(String)} names={{ 5: "k = 5", 10: "k = 10", 20: "k = 20" }} value={String(p.k)} onChange={(v) => p.setK(Number(v))} />
        <Toggle label="Hybrid" on={p.hybrid} onClick={() => p.setHybrid(!p.hybrid)} />
        <Toggle label="Contextual" on={p.contextual} onClick={() => p.setContextual(!p.contextual)} />
      </div>
      <div role="img" aria-label={`Ranked results 1 to 20. The right chunk is at rank ${p.rank}; the top ${p.k} are retrieved, so it is ${hit ? "retrieved" : "missed"}.`} className="relative">
        <motion.div
          aria-hidden
          className="absolute inset-y-0 left-0 rounded-lg bg-accent-soft/70"
          initial={false}
          animate={{ width: `${(p.k / 20) * 100}%` }}
          transition={{ duration: p.reduce ? 0 : 0.4, ease: [0.22, 1, 0.36, 1] }}
        />
        <div className="relative grid grid-cols-[repeat(20,minmax(0,1fr))] gap-0.5 px-0.5 pt-2 pb-1 @lg:gap-1">
          {Array.from({ length: 20 }, (_, i) => {
            const gold = i + 1 === p.rank;
            const tick = i === 0 || (i + 1) % 5 === 0;
            return (
              <div key={i} className="flex flex-col items-center gap-1">
                <span className={clsx("h-8 w-full max-w-4 rounded-sm border", gold ? "border-good bg-good" : "border-line-strong bg-surface")} />
                <span className={clsx("h-4 text-center font-mono text-[11px] leading-4 tabular @lg:text-xs", gold ? "font-semibold text-ink" : "text-muted")}>{gold || tick ? i + 1 : ""}</span>
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-xs text-muted" aria-hidden>
        <span className="mr-1 inline-block size-2.5 rounded-sm bg-accent-soft align-middle" /> shaded = top {p.k} retrieved <span className="mx-1">·</span>
        <span className="mr-1 inline-block size-2.5 rounded-sm bg-good align-middle" /> green = the chunk with the answer
      </p>
      <Verdict tone={hit ? "good" : "bad"}>
        {hit
          ? `Retrieved: the chunk with the answer sits at rank ${p.rank}, inside the top ${p.k}. Cast the net wide: in Anthropic's tests, passing 20 chunks to the model beat 10 or 5 (their reranker had screened 150 candidates first).`
          : `Retrieval miss: the answer is at rank ${p.rank}, outside the top ${p.k}. Nothing downstream can recover it. Raise k, or improve ranking with hybrid search and contextual chunks.`}
      </Verdict>
    </div>
  );
}

function RerankStage({ rank, k, reranked, setReranked, spring }: { rank: number; k: number; reranked: boolean; setReranked: (b: boolean) => void; spring: Transition }) {
  const hit = rank <= k;
  type Row = { id: string; title: string; text: string; gold?: boolean; r: number };
  const pool: Row[] = DISTRACTORS.map((d, i) => ({ id: `d${i}`, ...d, r: i + 1 >= rank ? i + 2 : i + 1 }));
  if (hit) pool.push({ id: "gold", ...GOLD, gold: true, r: rank });
  const before = [...pool].sort((a, b) => a.r - b.r).slice(0, 6);
  const rows = reranked && hit ? [before.find((r) => r.gold)!, ...before.filter((r) => !r.gold)] : before;
  return (
    <div className="space-y-3">
      <Toggle label="Apply reranker" on={reranked} onClick={() => setReranked(!reranked)} />
      <ol className="space-y-1.5" aria-label="Candidate chunks in current order">
        {rows.map((r, i) => (
          <motion.li
            key={r.id}
            layout
            transition={spring}
            className={clsx("flex items-start gap-2 rounded-lg border px-2.5 py-1.5", r.gold ? "border-good bg-good-soft" : "border-line bg-surface", i < TO_CLAUDE ? "" : "opacity-60")}
          >
            <span className="w-8 shrink-0 font-mono text-xs text-muted tabular">#{r.r}</span>
            <span className="min-w-0 flex-1 text-xs">
              <span className="font-semibold text-ink">{r.title}</span>
              <span className="block text-ink-2">{r.text}</span>
            </span>
            {i < TO_CLAUDE ? <span className="shrink-0 rounded bg-ink px-1.5 py-0.5 font-mono text-[11px] text-bg">to Claude</span> : null}
          </motion.li>
        ))}
      </ol>
      <Verdict tone={!hit ? "bad" : reranked || rank <= TO_CLAUDE ? "good" : "info"}>
        {!hit
          ? "The right chunk was never retrieved, so there is nothing to promote. A reranker can only reorder what retrieval found. Go back and raise k."
          : reranked
            ? `The reranker read each candidate next to the question and moved the true answer to the top. In this demo only the top ${TO_CLAUDE} go into Claude's prompt (Anthropic's setup passed the top 20).`
            : rank <= TO_CLAUDE
              ? `Already in the top ${TO_CLAUDE}, but similar-looking chunks (Q1, Globex) sit beside it. Try the reranker.`
              : `Retrieved at #${rank}, but only the top ${TO_CLAUDE} reach Claude here, so it would be left out. Turn on the reranker.`}
      </Verdict>
    </div>
  );
}

function GroundStage({ inPrompt, hit, allowIdk, setAllowIdk, reduce }: { inPrompt: boolean; hit: boolean; allowIdk: boolean; setAllowIdk: (b: boolean) => void; reduce: boolean }) {
  const [peek, setPeek] = useState(false);
  const [hover, setHover] = useState(false);
  const show = peek || hover;
  return (
    <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-2">
        <Toggle label={'Allow "I don\'t know"'} on={allowIdk} onClick={() => setAllowIdk(!allowIdk)} />
        <p className="text-xs font-medium text-muted">What Claude receives (documents first, question last)</p>
        <pre className="overflow-x-auto rounded-lg border border-line bg-surface p-2.5 font-mono text-xs leading-relaxed whitespace-pre-wrap text-ink-2">
          {`{"type": "document",\n "source": {"type": "text", "media_type": "text/plain",\n            "data": "${inPrompt ? "Revenue grew 3% over last quarter…" : "Revenue grew 5% on hardware sales…"}"},\n "title": "${inPrompt ? GOLD.title : DISTRACTORS[0].title}",\n "citations": {"enabled": true}}\n\n"Answer only from the documents above.${allowIdk ? " If the answer is not there, say you don't know." : ""}\n${QUESTION}"`}
        </pre>
        <p className="text-xs text-muted">Citations return pointers into your documents; the cited text doesn&apos;t count toward output tokens.</p>
      </div>
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted">Claude&apos;s answer</p>
        <div className="rounded-lg border border-line bg-surface p-3 text-sm text-ink">
          {inPrompt ? (
            <>
              ACME&apos;s revenue grew 3% in Q2 2025, driven by cloud subscriptions{" "}
              <button
                type="button"
                aria-label="Show cited source 1"
                aria-expanded={show}
                onClick={() => setPeek(!peek)}
                onPointerEnter={(e) => e.pointerType === "mouse" && setHover(true)}
                onPointerLeave={(e) => e.pointerType === "mouse" && setHover(false)}
                className="rounded bg-accent-soft px-1.5 font-mono text-xs font-semibold text-accent-text"
              >
                [1]
              </button>
              .
              <AnimatePresence>
                {show ? (
                  <motion.p initial={reduce ? false : { opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0 }} className="mt-2 rounded border-l-2 border-accent-strong bg-surface-2 px-2 py-1 font-mono text-xs text-ink-2">
                    cited_text: &quot;{GOLD.text}&quot; · {GOLD.title}
                  </motion.p>
                ) : null}
              </AnimatePresence>
            </>
          ) : allowIdk ? (
            "The provided documents don't give ACME's Q2 2025 revenue growth."
          ) : (
            <span className="text-bad">ACME&apos;s revenue grew 5% in Q2 2025.</span>
          )}
        </div>
        <Verdict tone={inPrompt ? "good" : allowIdk ? "info" : "bad"}>
          {inPrompt
            ? "Grounded: the answer comes from a chunk in the prompt, and the citation shows exactly which one. Hover or tap [1]."
            : allowIdk
              ? `Honest gap: the right chunk ${hit ? "was retrieved but not passed to Claude" : "was never retrieved"}, and Claude was allowed to say so.`
              : "Confident and wrong: with no permission to say \"I don't know\", Claude used the Q1 figure. The model is fine; the context was wrong."}
        </Verdict>
      </div>
    </div>
  );
}

const CASES = {
  a: { chunk: "Returns accepted within 30 days. (policy v1, 2024)", contains: false, layer: "Retrieval miss", fix: "Fix ingestion and retrieval: did the re-index finish? Are old and new versions both indexed? Same embedding model for documents and queries? Are metadata filters hiding the new policy?" },
  b: { chunk: "Returns accepted within 14 days. (policy v2, 2026)", contains: true, layer: "Generation error", fix: "Fix the prompt and grounding: ask Claude to quote the relevant passage first, allow \"I don't know\", turn on Citations, and add a \"context contains the answer\" check to your evals." },
};
const MOVES = [
  { id: "model", label: "Upgrade the model", ok: false, why: "The model and latency haven't changed; what changed is the context. A bigger model can't read a passage it was never given." },
  { id: "prompt", label: "Rewrite the prompt", ok: false, why: "Maybe later, but you don't yet know which layer broke. Look at the evidence first." },
  { id: "inspect", label: "Inspect retrieved chunks", ok: true, why: "Right. Log the chunks with every answer and ask one question: does the context contain the answer?" },
];

function DiagnoseStage() {
  const [move, setMove] = useState<string | null>(null);
  const [c, setC] = useState<keyof typeof CASES>("a");
  const m = MOVES.find((x) => x.id === move);
  const cs = CASES[c];
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-line bg-surface p-3 text-sm">
        <p className="text-ink">
          After a policy-document refresh, the bot says <b>&quot;You have 30 days to return an item.&quot;</b> The new policy says 14. Model and latency are unchanged.
        </p>
        <p className="mt-1 text-xs text-muted">What do you check first?</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {MOVES.map((x) => (
            <button
              key={x.id}
              type="button"
              aria-label={x.label}
              aria-pressed={move === x.id}
              onClick={() => setMove(x.id)}
              className={clsx("rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors", move === x.id ? (x.ok ? "border-good bg-good-soft text-ink" : "border-bad bg-bad-soft text-ink") : "border-line-strong bg-bg text-ink hover:border-ink")}
            >
              {x.label}
            </button>
          ))}
        </div>
      </div>
      {m ? <Verdict tone={m.ok ? "good" : "bad"}>{m.why}</Verdict> : <Verdict tone="info">Pick a first move. The clue is in the story: what changed, and what didn&apos;t?</Verdict>}
      {m?.ok ? (
        <div className="space-y-2">
          <Seg label="Retrieved evidence" options={["a", "b"]} names={{ a: "Case A", b: "Case B" }} value={c} onChange={(v) => setC(v as keyof typeof CASES)} />
          <p className="rounded-lg border border-line bg-surface px-2.5 py-2 font-mono text-xs text-ink">
            <span className="text-muted">retrieved › </span>
            {cs.chunk}
          </p>
          <p className="text-sm text-ink">
            Does the context contain the answer (14 days)?{" "}
            <b className={cs.contains ? "text-good" : "text-bad"}>{cs.contains ? "Yes" : "No"}</b> → <b>{cs.layer}</b>
          </p>
          <Verdict tone="info">{cs.fix}</Verdict>
        </div>
      ) : null}
    </div>
  );
}

/* ---------- Small controls ---------- */

function Verdict({ tone, children }: { tone: Tone; children: ReactNode }) {
  const color = { good: "var(--good)", bad: "var(--bad)", info: "var(--info)" }[tone];
  return (
    <p aria-live="polite" className="rounded-lg border-l-[3px] bg-surface px-3 py-2 text-sm text-ink-2" style={{ borderLeftColor: color }}>
      {children}
    </p>
  );
}

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      onClick={onClick}
      className={clsx("inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors", on ? "border-accent-strong bg-accent-soft text-ink" : "border-line-strong bg-surface text-ink-2 hover:border-ink")}
    >
      <span className={clsx("relative h-3.5 w-6 rounded-full transition-colors", on ? "bg-accent-strong" : "bg-line-strong")}>
        <span className={clsx("absolute top-0.5 size-2.5 rounded-full bg-surface transition-[left] motion-reduce:transition-none", on ? "left-3" : "left-0.5")} />
      </span>
      {label}
    </button>
  );
}

function Seg({ label, options, names, value, onChange }: { label: string; options: string[]; names?: Record<string, string>; value: string; onChange: (v: string) => void }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-full border border-line-strong bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={o === value}
          aria-label={`${label}: ${names?.[o] ?? o}`}
          onClick={() => onChange(o)}
          className={clsx("rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors", o === value ? "bg-ink text-bg" : "text-ink-2 hover:text-ink")}
        >
          {names?.[o] ?? o}
        </button>
      ))}
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
