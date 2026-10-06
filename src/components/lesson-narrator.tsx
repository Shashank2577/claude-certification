"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { CircleStop, Gauge, Headphones, Pause, Play } from "lucide-react";

/** Read-aloud narration for a lesson, using the browser's own speech engine. No keys, no assets, no cost. */
export interface LessonNarratorProps {
  /** The lesson's plain-English summary. Read first by default. */
  eli5?: string;
  /** Lesson markdown. Stripped to plain text before being spoken. */
  body?: string;
}

type SectionId = "summary" | "lesson";
type Speed = 1 | 1.25 | 1.5 | 2;
type Status = "idle" | "playing" | "paused";
type Support = "checking" | "ok" | "no-api" | "no-voices";

interface Section {
  id: SectionId;
  label: string;
  hint: string;
  text: string;
}

const SPEEDS: Speed[] = [1, 1.25, 1.5, 2];
const BUTTON_LABEL: Record<Status, string> = { idle: "Listen", playing: "Pause", paused: "Resume" };
const PLAY_LABEL: Record<Status, (what: string) => string> = {
  idle: (what) => `Read the ${what} aloud`,
  playing: () => "Pause narration",
  paused: () => "Resume narration",
};

/**
 * Chromium (and historically Safari) silently stops an utterance after ~15s. Speaking sentence by
 * sentence keeps every chunk short and makes resume predictable, at the cost of a small gap
 * between sentences.
 */
const CHUNK_SENTENCES = 2;

/** Split into sentence-ish groups; falls back to a character window so no chunk can run away. */
function chunkText(text: string): string[] {
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text];
  const chunks: string[] = [];
  for (let i = 0; i < sentences.length; i += CHUNK_SENTENCES) {
    let chunk = sentences.slice(i, i + CHUNK_SENTENCES).join("").trim();
    while (chunk.length > 600) {
      const cut = chunk.lastIndexOf(" ", 600) || 600;
      chunks.push(chunk.slice(0, cut).trim());
      chunk = chunk.slice(cut).trim();
    }
    if (chunk) chunks.push(chunk);
  }
  return chunks;
}

/** Markdown to speakable text: drop fences, images, link targets and decoration. */
function toPlain(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " Code example omitted. ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_~|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Reads one section aloud. Progress is tracked by sentence index rather than word-boundary events,
 * which Chrome only fires for some voices.
 */
export function LessonNarrator({ eli5, body }: LessonNarratorProps) {
  const [support, setSupport] = useState<Support>("checking");
  const [section, setSection] = useState<SectionId>("summary");
  const [status, setStatus] = useState<Status>("idle");
  const [speed, setSpeed] = useState<Speed>(1);
  const [spoken, setSpoken] = useState(0);

  // The queue is read inside callbacks only; `plan` is the render-safe view of the same chunks.
  const index = useRef(0);
  const chunks = useRef<string[]>([]);
  const speakRef = useRef<(i: number) => void>(() => {});

  const sections = useMemo<Section[]>(() => {
    const out: Section[] = [];
    if (eli5?.trim()) out.push({ id: "summary", label: "Summary", hint: "the one-paragraph version", text: eli5.trim() });
    if (body?.trim()) out.push({ id: "lesson", label: "Full lesson", hint: "the whole lesson, code samples skipped", text: toPlain(body) });
    return out;
  }, [eli5, body]);

  const active = sections.find((s) => s.id === section) ?? sections[0];
  const plan = useMemo(() => (active ? chunkText(active.text) : []), [active]);
  // Count the in-flight chunk so the bar leaves 0% the moment narration starts, and
// cap it at 99 while playing so a single-chunk section doesn't read 100% early.
  const done = status === "playing" ? spoken + 1 : spoken;
  const progress =
    plan.length > 0 && done > 0
      ? Math.min(status === "playing" ? 99 : 100, Math.round((done / plan.length) * 100))
      : 0;

  // Prefer an offline OS voice in a major English variant. macOS lists voices alphabetically, so
  // "first en match" would pick an en-IN or en-AU voice over US/GB; local beats network so the
  // learner gets audio even with no connection.
  const pickVoice = useCallback(() => {
    const list = window.speechSynthesis?.getVoices?.() ?? [];
    if (!list.length) return null;
    const en = list.filter((v) => /^en(-|_|$)/i.test(v.lang));
    if (!en.length) return list.find((v) => v.localService) ?? list[0] ?? null;
    const major = en.filter((v) => /^(en[-_]US|en[-_]GB|en[-_]AU)/i.test(v.lang));
    const pool = major.length ? major : en;
    return pool.find((v) => v.localService) ?? pool[0] ?? null;
  }, []);

  // Voices arrive asynchronously in Chromium, so probe once and then listen for the update.
  useEffect(() => {
    const probe = () => {
      const synth = window.speechSynthesis;
      setSupport(!synth ? "no-api" : pickVoice() ? "ok" : "no-voices");
    };
    probe();
    window.speechSynthesis?.addEventListener("voiceschanged", probe);
    return () => window.speechSynthesis?.removeEventListener("voiceschanged", probe);
  }, [pickVoice]);

  const halt = useCallback(() => {
    try {
      window.speechSynthesis?.cancel();
    } catch {}
  }, []);

  const finish = useCallback(() => {
    halt();
    setStatus("idle");
    setSpoken(0);
  }, [halt]);

  // Leaving the page mid-sentence must not leave a voice talking behind the learner.
  useEffect(() => () => halt(), [halt]);

  const speakAt = useCallback(
    (i: number) => {
      const synth = window.speechSynthesis;
      const chunk = chunks.current[i];
      if (!synth || !chunk) {
        finish();
        return;
      }
      const u = new SpeechSynthesisUtterance(chunk);
      u.rate = speed;
      const v = pickVoice();
      if (v) u.voice = v;
      u.onend = () => {
        if (index.current !== i) return; // superseded by a newer click
        if (i + 1 >= chunks.current.length) {
          finish();
          return;
        }
        setSpoken(i + 1);
        speakRef.current(i + 1);
      };
      u.onerror = finish;
      index.current = i;
      try {
        synth.speak(u);
      } catch {
        finish();
      }
    },
    [finish, pickVoice, speed],
  );

  // Lets each utterance's onend hand off to the next one without re-creating callbacks.
  useEffect(() => {
    speakRef.current = speakAt;
  }, [speakAt]);

  const start = useCallback(() => {
    if (!plan.length) return;
    halt();
    chunks.current = plan;
    index.current = 0;
    setSpoken(0);
    setStatus("playing");
    speakRef.current(0);
  }, [halt, plan]);

  const toggle = useCallback(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    if (status === "playing") {
      synth.pause();
      setStatus("paused");
    } else if (status === "paused") {
      synth.resume();
      setStatus("playing");
    } else {
      start();
    }
  }, [start, status]);

  const choose = useCallback(
    (id: SectionId) => {
      setSection(id);
      halt(); // restarting beats trying to re-queue mid-sentence
      setStatus("idle");
      setSpoken(0);
    },
    [halt],
  );

  const busy = status !== "idle";
  const liveMessage =
    support === "no-api"
      ? "Read aloud is not supported in this browser."
      : support === "no-voices"
        ? "No speech voices are installed on this device."
        : support === "checking"
          ? "Checking for speech voices."
          : status === "playing"
            ? `Reading the ${active?.label.toLowerCase() ?? "lesson"} aloud.`
            : status === "paused"
              ? "Narration paused."
              : "Narration stopped.";

  if (!sections.length) return null;

  return (
    <section className="mt-6 rounded-2xl border border-line bg-surface p-4 shadow-card" aria-labelledby="narrator-h">
      <h2 id="narrator-h" className="flex items-center gap-2 font-display font-semibold">
        <Headphones size={17} className="text-accent-text" aria-hidden />
        Listen
        <span className="font-sans text-sm font-normal text-muted">have this lesson read aloud</span>
      </h2>

      {support !== "ok" ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted">
          <Headphones size={16} aria-hidden />
          {support === "checking" ? "Checking for speech voices…" : liveMessage}
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1" role="group" aria-label="What to read">
              {sections.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => choose(s.id)}
                  aria-pressed={section === s.id}
                  className={clsx(
                    "min-h-9 rounded-lg px-2.5 text-sm font-medium transition-colors",
                    section === s.id ? "bg-accent-soft text-accent-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={toggle}
                aria-label={PLAY_LABEL[status](active?.label.toLowerCase() ?? "lesson")}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-3.5 text-sm font-semibold text-accent-ink transition-[background-color,transform] hover:bg-accent-strong active:scale-[0.97]"
              >
                {status === "playing" ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
                {BUTTON_LABEL[status]}
              </button>
              <button
                type="button"
                onClick={finish}
                disabled={!busy}
                aria-label="Stop narration"
                className="grid size-11 shrink-0 place-items-center rounded-xl border border-line-strong bg-surface text-ink transition-colors hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-40"
              >
                <CircleStop size={17} aria-hidden />
              </button>
            </div>

            <div className="flex items-center gap-1" role="group" aria-label="Reading speed">
              <Gauge size={15} className="ml-1 shrink-0 text-muted" aria-hidden />
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setSpeed(s);
                    if (busy) start(); // rate is fixed per utterance, so restart to apply
                  }}
                  aria-pressed={speed === s}
                  className={clsx(
                    "min-h-9 rounded-lg px-2 text-sm tabular transition-colors",
                    speed === s ? "bg-ink text-bg" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                  )}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            {busy ? (
              <div className="flex min-w-40 flex-1 items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-track">
                  <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${progress}%` }} />
                </div>
                <span className="text-xs text-muted tabular">{progress}%</span>
              </div>
            ) : (
              <p className="min-w-0 flex-1 text-sm text-muted">Reads {active?.hint}. Nothing plays until you press Listen.</p>
            )}
            <p className="text-xs text-muted">Uses your device&apos;s own voice. Works offline.</p>
          </div>
        </>
      )}

      <p aria-live="polite" className="sr-only">
        {liveMessage}
      </p>
    </section>
  );
}

export default LessonNarrator;