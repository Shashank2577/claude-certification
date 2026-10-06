"use client";

import { useCallback } from "react";
import { Square, Volume2 } from "lucide-react";
import { useSpeech } from "@/lib/speech";
import { stripMarkdown } from "@/lib/speech-core";

/**
 * A play button attached to a markdown heading. On click it reads the heading plus everything
 * under it, up to the next heading of the same or higher level.
 *
 * It reads the rendered DOM rather than being handed the markdown, so a heading-level play
 * button needs no plumbing through the markdown renderer and stays correct if the content
 * around it changes.
 */
export function SectionListen({ id, heading }: { id: string; heading: string }) {
  const { supported, ready, speakingId, play, stop } = useSpeech();
  const read = useCallback(() => {
    const start = document.getElementById(`${id}-h-${slug(heading)}`) ?? findHeadingElement(heading);
    if (!start) {
      play(`${id}:${heading}`, `the section ${heading}`, `${heading}.`);
      return;
    }
    const level = Number(start.tagName.slice(1)) || 2;
    const parts: string[] = [heading];
    let node = start.nextElementSibling;
    while (node) {
      if (/^H[1-6]$/.test(node.tagName) && Number(node.tagName.slice(1)) <= level) break;
      parts.push(node.textContent ?? "");
      node = node.nextElementSibling;
    }
    play(`${id}:${heading}`, `the section ${heading}`, `${heading}. ${stripMarkdown(parts.join(" "))}`);
  }, [heading, id, play]);

  if (!supported || !ready) return null;
  const active = speakingId === `${id}:${heading}`;
  return (
    <button
      type="button"
      onClick={() => (active ? stop() : read())}
      aria-label={active ? `Stop reading ${heading}` : `Read the section ${heading} aloud`}
      title={active ? "Stop" : `Listen to ${heading}`}
      data-listen-heading={heading}
      className={
        active
          ? "mt-1 inline-grid size-11 -my-2 shrink-0 place-items-center rounded-md border border-accent-strong bg-accent-soft text-accent-text"
          : // 44px hit area around a small glyph, always visible: a control you cannot see is a
            // control you cannot find, and there is no hover on a touch screen to reveal it.
            "mt-1 inline-grid size-11 -my-2 shrink-0 place-items-center rounded-md border border-line bg-surface text-muted transition-colors hover:border-line-strong hover:text-ink"
      }
    >
      {active ? <Square size={12} aria-hidden /> : <Volume2 size={14} aria-hidden />}
    </button>
  );
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

function findHeadingElement(heading: string): HTMLElement | null {
  const wanted = heading.trim().toLowerCase();
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(".prose-lesson h2, .prose-lesson h3"))) {
    if (el.textContent?.trim().toLowerCase().startsWith(wanted)) return el;
  }
  return null;
}