"use client";

import { Play, Square, Volume2 } from "lucide-react";
import clsx from "clsx";
import { useState } from "react";
import { useSpeech } from "@/lib/speech";
import { stripMarkdown } from "@/lib/speech-core";

const SPEEDS = [1, 1.25, 1.5, 2] as const;
type Speed = (typeof SPEEDS)[number];

const PREVIEW =
  "This is how the lesson will sound. Pick a different voice at any time and the choice is remembered.";

/**
 * Lesson-level narration. The point of this panel is the voice picker: the browser decides
 * which voices exist, they differ wildly in quality, and the only way to know which one you
 * like is to hear it. So the picker is first and it has a preview button.
 *
 * Everything here also has a small play button beside the individual section, so a learner who
 * wants one paragraph never has to start the whole lesson.
 */
export function LessonNarrator({
  eli5,
  body,
  lessonId,
}: {
  eli5?: string;
  body?: string;
  lessonId: string;
}) {
  const { supported, ready, loaded, voices, voiceName, setVoice, speakingId, speakingLabel, play, stop } = useSpeech();
  const [speed, setSpeed] = useState<Speed>(1);

  if (!supported) {
    return (
      <p className="mt-6 flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-muted">
        <Volume2 size={16} aria-hidden />
        Read aloud is not supported in this browser.
      </p>
    );
  }
  if (!loaded || !ready) {
    return (
      <p className="mt-6 flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-muted">
        <Volume2 size={16} aria-hidden />
        {loaded && !ready
          ? "This device has no read-aloud voice installed, so narration is unavailable here."
          : "Looking for voices on this device…"}
      </p>
    );
  }

  const sections = [
    eli5?.trim() ? { id: "summary", label: "the plain-English summary", text: eli5.trim() } : null,
    body?.trim() ? { id: "lesson", label: "the whole lesson", text: stripMarkdown(body) } : null,
  ].filter((s): s is { id: string; label: string; text: string } => !!s);

  if (!sections.length) return null;

  const previewing = speakingId === `${lessonId}:preview`;

  return (
    <section className="mt-6 rounded-2xl border border-line bg-surface p-4 shadow-card" aria-labelledby="narrator-h">
      <h2 id="narrator-h" className="flex flex-wrap items-center gap-2 font-display font-semibold">
        <Volume2 size={17} className="text-accent-text" aria-hidden />
        Listen
        <span className="font-sans text-sm font-normal text-muted">or press the small play button beside any single section</span>
      </h2>

      {/* Voice first: it is the choice that decides whether any of this is worth using. */}
      <div className="mt-3 flex flex-wrap items-end gap-3 rounded-xl bg-surface-2/60 p-3">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Voice</span>
          <select
            value={voiceName ?? ""}
            onChange={(e) => setVoice(e.target.value)}
            className="h-11 w-full max-w-none rounded-lg border border-line-strong bg-surface px-2 text-[0.95rem] text-ink"
          >
            {voices.map((v) => (
              <option key={`${v.name}-${v.lang}`} value={v.name}>
                {v.name}
                {v.localService ? " · offline" : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => (previewing ? stop() : play(`${lessonId}:preview`, "a preview", PREVIEW, speed))}
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-ink px-3.5 text-sm font-medium text-bg transition-colors hover:bg-ink/90"
        >
          {previewing ? <Square size={13} aria-hidden /> : <Play size={14} aria-hidden />}
          {previewing ? "Stop" : "Preview voice"}
        </button>
      </div>
      <p className="mt-1.5 text-xs text-muted">
        {voices.length} usable {voices.length === 1 ? "voice" : "voices"} on this device. Your choice is remembered.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {sections.map((s) => {
          const active = speakingId === `${lessonId}:${s.id}`;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => (active ? stop() : play(`${lessonId}:${s.id}`, s.label, s.text, speed))}
              aria-pressed={active}
              className={clsx(
                "inline-flex min-h-11 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition-colors",
                active ? "bg-accent-soft text-accent-ink" : "bg-accent text-accent-ink hover:bg-accent-strong",
              )}
            >
              {active ? <Square size={13} aria-hidden /> : <Volume2 size={15} aria-hidden />}
              Read {s.id === "summary" ? "summary" : "whole lesson"}
            </button>
          );
        })}
        <button
          type="button"
          onClick={stop}
          disabled={!speakingId}
          aria-label="Stop reading"
          className="grid size-11 shrink-0 place-items-center rounded-xl border border-line-strong bg-surface text-ink transition-colors hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-40"
        >
          <Square size={15} aria-hidden />
        </button>

        <div className="flex items-center gap-1" role="group" aria-label="Reading speed">
          <span className="ml-1 text-sm text-muted">Speed</span>
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s)}
              aria-pressed={speed === s}
              className={clsx(
                "inline-grid min-h-11 min-w-11 place-items-center rounded-lg px-2.5 text-sm tabular transition-colors",
                speed === s ? "bg-ink text-bg" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
              )}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      <p aria-live="polite" className="sr-only">
        {speakingId ? `Reading ${speakingLabel}.` : "Narration stopped."}
      </p>
    </section>
  );
}