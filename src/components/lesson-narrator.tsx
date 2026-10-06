"use client";

import { Volume2, Square } from "lucide-react";
import clsx from "clsx";
import { useSpeech } from "@/lib/speech";
import { stripMarkdown } from "@/lib/speech-core";

/**
 * Lesson-level narration, kept deliberately small: pick a voice once, then read the summary or
 * the whole page. Per-section reading is handled by the small speaker button beside each heading,
 * so this panel does not need its own preview, stop or speed controls -- pressing Read is what
 * tells you what the voice sounds like, and the button you press is the one that stops.
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

  if (!loaded || !ready) {
    return (
      <p className="mt-6 flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-muted">
        <Volume2 size={16} aria-hidden />
        {!supported
          ? "Read aloud is not supported in this browser."
          : loaded
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

  return (
    <section className="mt-6 rounded-2xl border border-line bg-surface p-4 shadow-card" aria-labelledby="narrator-h">
      <h2 id="narrator-h" className="flex items-center gap-2 font-display font-semibold">
        <Volume2 size={17} className="text-accent-text" aria-hidden />
        Listen
      </h2>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="flex min-w-0 flex-1 basis-56 max-w-72 flex-col gap-1 text-sm">
          <span className="sr-only">Voice</span>
          <select
            value={voiceName ?? ""}
            onChange={(e) => setVoice(e.target.value)}
            aria-label="Voice"
            className="h-11 w-full min-w-0 rounded-lg border border-line-strong bg-surface px-2 text-[0.95rem] text-ink"
          >
            {voices.map((v) => (
              <option key={`${v.name}-${v.lang}`} value={v.name}>
                {v.name}
                {v.localService ? " · offline" : ""}
              </option>
            ))}
          </select>
        </label>

        {sections.map((s) => {
          const active = speakingId === `${lessonId}:${s.id}`;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => (active ? stop() : play(`${lessonId}:${s.id}`, s.label, s.text))}
              aria-pressed={active}
              className={clsx(
                "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition-colors",
                active ? "bg-accent-soft text-accent-ink" : "bg-accent text-accent-ink hover:bg-accent-strong",
              )}
            >
              {active ? <Square size={13} aria-hidden /> : <Volume2 size={15} aria-hidden />}
              {active ? "Stop" : s.id === "summary" ? "Read summary" : "Read whole lesson"}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-muted">
        {voices.length} usable {voices.length === 1 ? "voice" : "voices"} on this device. Your choice is remembered.
      </p>

      <p aria-live="polite" className="sr-only">
        {speakingId ? `Reading ${speakingLabel}.` : "Narration stopped."}
      </p>
    </section>
  );
}