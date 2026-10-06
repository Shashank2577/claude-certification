// Browser speech: one engine for the whole page, so any Listen button anywhere can play
// without two of them talking over each other.

"use client";

import { useSyncExternalStore } from "react";
import { chunkText, pickVoice, voiceOptions } from "@/lib/speech-core";

export { chunkText, pickVoice, stripMarkdown, voiceOptions } from "@/lib/speech-core";

const STORAGE_KEY = "ccp-voice";

function savedVoiceName(): string | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export interface SpeechState {
  supported: boolean;
  /** True once voices have loaded; Chromium delivers them asynchronously. */
  ready: boolean;
  /** True once the initial voice query has settled, even if it came back empty. */
  loaded: boolean;
  voices: SpeechSynthesisVoice[];
  voiceName: string | null;
  setVoice: (name: string) => void;
  speakingId: string | null;
  speakingLabel: string;
  play: (id: string, label: string, text: string, rate?: number) => void;
  stop: () => void;
}

const EMPTY: SpeechState = {
  supported: false,
  ready: false,
  loaded: false,
  voices: [],
  voiceName: null,
  setVoice: () => {},
  speakingId: null,
  speakingLabel: "",
  play: () => {},
  stop: () => {},
};

let state = EMPTY;
const listeners = new Set<() => void>();

function setVoice(name: string) {
  try {
    if (name) localStorage.setItem(STORAGE_KEY, name);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private browsing; the choice just will not persist */
  }
  stop();
  emit({ voiceName: name || null });
}

let timer: number | null = null;

function emit(next: Partial<SpeechState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
  const onVoices = () => {
    const voices = voiceOptions();
    emit({
      supported: !!window.speechSynthesis,
      ready: voices.length > 0,
      loaded: true,
      voices,
      voiceName: pickVoice(savedVoiceName())?.name ?? null,
    });
    // Chromium populates getVoices() asynchronously and does not always fire
    // `voiceschanged`, so poll briefly until something usable turns up.
    if (voices.length === 0) {
      let tries = 0;
      const poll = window.setInterval(() => {
        const found = voiceOptions();
        if (found.length > 0 || ++tries > 12) {
          window.clearInterval(poll);
          onVoices();
        }
      }, 250);
    }
  };
  onVoices();
  synth?.addEventListener("voiceschanged", onVoices);
  const onHide = () => {
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
  };
  window.addEventListener("pagehide", onHide);
  return () => {
    listeners.delete(fn);
    synth?.removeEventListener("voiceschanged", onVoices);
    window.removeEventListener("pagehide", onHide);
  };
}

const getSnapshot = () => state;

function stop() {
  if (timer) window.clearTimeout(timer);
  timer = null;
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* nothing playing */
  }
  emit({ speakingId: null });
}

function play(id: string, label: string, text: string, rate = 1) {
  const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
  const clean = text.trim();
  if (!synth || !clean) return;
  stop();
  const chunks = chunkText(clean);
  const voice = pickVoice(savedVoiceName());
  emit({ speakingId: id, speakingLabel: label, voiceName: voice?.name ?? null });
  let i = 0;
  const next = () => {
    if (i >= chunks.length) {
      emit({ speakingId: null });
      return;
    }
    const u = new SpeechSynthesisUtterance(chunks[i]);
    if (voice) u.voice = voice;
    // Rate is read once when speak() is called, so it cannot be changed mid-utterance.
    u.rate = rate;
    u.onend = () => {
      i += 1;
      next();
    };
    u.onerror = () => emit({ speakingId: null });
    synth.speak(u);
  };
  // A tick before the first utterance: some engines drop an utterance queued inside an
  // event handler, and this keeps stop() responsive immediately after play().
  timer = window.setTimeout(next, 60);
}

// The server cannot know whether speechSynthesis exists, so the first render deliberately
// claims nothing: server and hydration render agree, and `subscribe` (client-only) fills in
// the truth immediately after. Claiming `supported` at module scope hydrates mismatched.
state = { ...state, setVoice, play, stop };

/** Subscribes a component to the shared engine. */
export function useSpeech(): SpeechState {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return snapshot;
}

export { play as speak, stop as stopSpeaking };