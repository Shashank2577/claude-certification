"use client";

import { Volume2, Square } from "lucide-react";
import clsx from "clsx";
import { useSpeech } from "@/lib/speech";
import { stripMarkdown } from "@/lib/speech-core";

/**
 * A small play button that reads one block of text. `markdown` strips formatting first, so
 * passing lesson markdown speaks prose rather than asterisks.
 *
 * Clicking while this block is playing stops it. Clicking any other block stops that one and
 * starts this one, because every button shares one engine.
 */
export function ListenButton({
  text,
  label,
  id,
  markdown = false,
  className,
  size = "sm",
}: {
  text: string;
  /** What this is, for the accessible name and the live announcement. */
  label: string;
  /** Unique per block, so the engine knows which one is speaking. */
  id: string;
  markdown?: boolean;
  className?: string;
  size?: "xs" | "sm";
}) {
  const { supported, ready, speakingId, play, stop } = useSpeech();
  if (!supported || !ready) return null;
  const active = speakingId === id;
  const body = markdown ? stripMarkdown(text) : text;
  return (
    <button
      type="button"
      onClick={() => (active ? stop() : play(id, label, body))}
      aria-label={active ? `Stop reading ${label}` : `Read ${label} aloud`}
      title={active ? "Stop" : "Listen"}
      className={clsx(
        // 44px hit area (WCAG 2.5.5 / touch) around a deliberately small icon. The negative
        // margin stops the extra padding from shoving the surrounding prose around.
        "relative inline-grid shrink-0 place-items-center rounded-lg border transition-colors",
        size === "xs" ? "size-11 -my-1.5 -mr-2" : "size-11 -my-1",
        active ? "border-accent-strong bg-accent-soft text-accent-text" : "border-line bg-surface text-muted hover:border-line-strong hover:text-ink",
        className,
      )}
    >
      {active ? <Square size={size === "xs" ? 10 : 12} aria-hidden /> : <Volume2 size={size === "xs" ? 12 : 14} aria-hidden />}
    </button>
  );
}