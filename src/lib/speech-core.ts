// Pure helpers shared by the speech engine and by server components. No "use client" here,
// because the markdown renderer is a server component and cannot call client exports.

/** Markdown to speakable prose: drop fences, link targets and decoration. */
export function stripMarkdown(md: string): string {
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

/** Two-sentence chunks keep every utterance short, so stop and resume stay predictable. */
export function chunkText(text: string): string[] {
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text];
  const chunks: string[] = [];
  for (let i = 0; i < sentences.length; i += 2) {
    let chunk = sentences.slice(i, i + 2).join("").trim();
    while (chunk.length > 600) {
      const cut = chunk.lastIndexOf(" ", 600) || 600;
      chunks.push(chunk.slice(0, cut).trim());
      chunk = chunk.slice(cut).trim();
    }
    if (chunk) chunks.push(chunk);
  }
  return chunks;
}

/**
 * macOS ships novelty voices that are technically en-US and technically local. Alphabetically
 * "Albert" comes first and it is the flattest voice on the machine, so picking "the first local
 * English voice" lands on it. These are the ones to refuse outright.
 */
const REFUSE = [
  "albert", "bahh", "bells", "boing", "bubbles", "cellos", "deranged", "fred", "good news",
  "bad news", "jester", "junior", "kathy", "organ", "ralph", "superstar", "trinoids",
  "vicki", "whisper", "wobble", "zarvox", "pipe organ", "hysterical",
];

/** Ranked best-first by how natural the voice sounds for long-form reading. */
const PREFERRED = [
  "Samantha", "Google UK English Female", "Microsoft Aria", "Microsoft Jenny",
  "Microsoft Sonia", "Daniel", "Karen", "Moira", "Tessa", "Ava", "Allison", "Serena",
  "Tom", "Google US English", "Microsoft Guy", "Microsoft Ryan", "Nicky", "Fiona",
];

/** Higher is better; negative means unusable. */
export function scoreVoice(v: SpeechSynthesisVoice): number {
  const name = v.name.toLowerCase();
  if (REFUSE.some((bad) => name.includes(bad))) return -1;
  const rank = PREFERRED.findIndex((p) => name.includes(p.toLowerCase()));
  if (rank !== -1) return 1000 - rank;
  if (!/^en/i.test(v.lang)) return -1;
  let s = 100;
  if (/^en[-_](US|GB|AU)/i.test(v.lang)) s += 40;
  else if (/^en[-_]/i.test(v.lang)) s += 20;
  if (v.localService) s += 30;
  return s;
}

/** Voices worth offering: readable English, novelty voices filtered out, best first. */
export function voiceOptions(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined") return [];
  return (window.speechSynthesis?.getVoices() ?? [])
    .map((v) => ({ v, s: scoreVoice(v) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.v);
}

/** Best usable voice, honouring a saved choice when that voice is still present. */
export function pickVoice(preferredName?: string | null): SpeechSynthesisVoice | null {
  const opts = voiceOptions();
  if (!opts.length) return null;
  if (preferredName) {
    const saved = opts.find((v) => v.name === preferredName);
    if (saved) return saved;
  }
  return opts[0];
}
