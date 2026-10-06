// Content linter for content/**. Run with: pnpm tsx scripts/validate-content.ts
// Checks the contracts in CONTENT_SCHEMA.md plus study-quality rules that are easy
// to break when adding question batches by hand.

import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), "content");

type Json = Record<string, unknown>;
type Arr = unknown[];

/** Narrow an unknown field to an array, defaulting to empty. */
function arr(v: unknown): Arr {
  return Array.isArray(v) ? v : [];
}

const problems: string[] = [];
const warnings: string[] = [];

function fail(file: string, msg: string) {
  problems.push(`${file}: ${msg}`);
}
function warn(file: string, msg: string) {
  warnings.push(`${file}: ${msg}`);
}

function read(rel: string): Json | null {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as Json;
  } catch (err) {
    fail(rel, `invalid JSON: ${(err as Error).message}`);
    return null;
  }
}

function questionFiles(certId: string, domainId: string): string[] {
  const dir = path.join(ROOT, "questions", certId);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((n) => n === `${domainId}.json` || new RegExp(`^${domainId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.part-\\d+\\.json$`).test(n))
    .sort()
    .map((n) => `questions/${certId}/${n}`);
}

const VISUAL_IDS = new Set(
  fs
    .readFileSync(path.join(process.cwd(), "src/components/visuals/registry.ts"), "utf8")
    .split("\n")
    .map((l) => /^ {2}"([a-z0-9-]+)":\s*\{/.exec(l)?.[1])
    .filter((x): x is string => !!x),
);

const certs = (read("certs.json") as unknown as Json[] | null) ?? [];
if (!certs.length) fail("certs.json", "no certifications found");

const certIds = new Set<string>();
const stats: { label: string; n: number; easy: number; med: number; hard: number; multi: number; scen: number }[] = [];

for (const cert of certs) {
  const certId = String(cert.id);
  certIds.add(certId);
  if (!cert.name || !cert.tagline) fail("certs.json", `cert ${certId} missing name or tagline`);
  const domains = arr(cert.domains);
  if (!domains.length) fail("certs.json", `cert ${certId} has no domains`);

  for (const domain of domains as Json[]) {
    const domainId = String(domain.id);
    const label = `${certId}/${domainId}`;
    const taskIds = new Set(arr(domain.taskStatements).map((t) => String((t as Json).id)));

    // ---- lessons
    const mod = read(`modules/${certId}/${domainId}.json`);
    if (!mod) fail(label, "no module file");
    const lessons = arr(mod?.lessons) as Json[];
    const lessonIds = new Set<string>();
    for (const lesson of lessons) {
      const id = String(lesson.id);
      if (lessonIds.has(id)) fail(`${label} module`, `duplicate lesson id ${id}`);
      lessonIds.add(id);
      for (const field of ["title", "eli5", "body"]) {
        if (!lesson[field]) fail(`${label} ${id}`, `missing ${field}`);
      }
      if (lesson.visualId && !VISUAL_IDS.has(String(lesson.visualId))) {
        fail(`${label} ${id}`, `visualId "${lesson.visualId}" is not in the visual registry`);
      }
      for (const tsId of arr(lesson.taskStatementIds) as string[]) {
        if (!taskIds.has(tsId)) fail(`${label} ${id}`, `unknown taskStatementId ${tsId}`);
      }
      const words = String(lesson.body ?? "").split(/\s+/).length;
      if (words > 1600) warn(`${label} ${id}`, `lesson body is ${words} words (target 400-1200)`);
    }

    // ---- flashcards
    const fc = read(`flashcards/${certId}/${domainId}.json`);
    if (!fc) warn(label, "no flashcard file");
    for (const card of arr(fc?.cards) as Json[]) {
      if (!card.front || !card.back) fail(`${label} flashcards`, `card ${card.id} missing front or back`);
    }

    // ---- questions
    const files = questionFiles(certId, domainId);
    if (!files.length) fail(label, "no question files");
    const ids = new Set<string>();
    const easy = { 1: 0, 2: 0, 3: 0 };
    let n = 0;
    let multi = 0;
    let withScenario = 0;
    const byTask = new Map<string, number>();
    const optIdsSeen: string[] = [];

    for (const rel of files) {
      const doc = read(rel);
      if (!doc) continue;
      if (doc.certId !== certId || doc.domainId !== domainId) {
        fail(rel, `certId/domainId should be "${certId}"/"${domainId}"`);
      }
      const questions = arr(doc.questions) as Json[];
      if (!questions.length) fail(rel, "no questions");
      if (questions.length > 40) warn(rel, `${questions.length} questions in one file (keep batches at 15-25)`);
      for (const q of questions) {
        const id = String(q.id);
        optIdsSeen.push(id);
        if (ids.has(id)) fail(rel, `duplicate question id ${id}`);
        ids.add(id);
        n++;
        if (!/^[a-z]{1,2}-d\d+-[a-z0-9-]+$/.test(id)) warn(rel, `question id "${id}" does not follow the cert-prefix-dN-slug convention`);
        if (!taskIds.has(String(q.taskStatementId))) fail(rel, `${id}: unknown taskStatementId ${q.taskStatementId}`);
        byTask.set(String(q.taskStatementId), (byTask.get(String(q.taskStatementId)) ?? 0) + 1);

        const options = arr(q.options) as Json[];
        const correct = arr(q.correct).map(String);
        const whyWrong = (q.whyWrong ?? {}) as Record<string, string>;
        if (options.length < 3) fail(rel, `${id}: needs at least 3 options`);
        const optionIds = options.map((o) => String(o.id));
        if (new Set(optionIds).size !== optionIds.length) fail(rel, `${id}: duplicate option ids`);
        for (const o of options) if (!String(o.text ?? "").trim()) fail(rel, `${id}: empty option ${o.id}`);
        if (!correct.length) fail(rel, `${id}: no correct answer`);
        for (const c of correct) if (!optionIds.includes(String(c))) fail(rel, `${id}: correct answer ${c} is not an option`);
        if (correct.length > 1) multi++;
        if (correct.length === options.length) fail(rel, `${id}: every option is correct`);
        // Every option the candidate could have picked and shouldn't have needs a reason.
        // Gating this on single-select let multi-select questions omit whyWrong entirely.
        if (optionIds.length > 2) {
          for (const o of optionIds) {
            if (correct.includes(o)) continue;
            if (!whyWrong || !(o in whyWrong)) fail(rel, `${id}: missing whyWrong for option ${o}`);
          }
        }
        for (const c of correct) {
          if (whyWrong && String(c) in whyWrong) fail(rel, `${id}: whyWrong given for correct option ${c}`);
        }
        if (!q.explanation || String(q.explanation).length < 80) fail(rel, `${id}: explanation too short`);
        if (!q.mindset) warn(rel, `${id}: no mindset line`);
        const d = Number(q.difficulty);
        if (![1, 2, 3].includes(d)) fail(rel, `${id}: difficulty must be 1, 2 or 3`);
        else easy[d as 1 | 2 | 3]++;
        if (q.scenario) withScenario++;
        if (q.visualId) {
          if (!VISUAL_IDS.has(String(q.visualId))) fail(rel, `${id}: visualId "${q.visualId}" is not in the visual registry`);
        }
      }
    }

    for (const tsId of taskIds) {
      if (!byTask.has(tsId)) fail(label, `task statement ${tsId} has no questions`);
    }
    const uneven = [...byTask.entries()].filter(([, c]) => c < 3);
    if (uneven.length) warn(label, `task statements with fewer than 3 questions: ${uneven.map(([k, c]) => `${k}(${c})`).join(", ")}`);

    stats.push({ label, n, easy: easy[1], med: easy[2], hard: easy[3], multi, scen: withScenario });

    // ---- id collisions across files
    const dupes = optIdsSeen.filter((id, i) => optIdsSeen.indexOf(id) !== i);
    if (dupes.length) fail(label, `duplicate ids: ${[...new Set(dupes)].join(", ")}`);
  }
}

// ── explainer source rules ───────────────────────────────────────────────────
// These encode bugs that actually shipped: a hydration mismatch from the wrong
// reduced-motion hook, Math.cos/sin differing in the last bit between Node and
// the browser, and hard-coded hex that breaks one of the two themes.
const visualSrc = path.join(process.cwd(), "src/components/visuals");
const VISUAL_SOURCE_RULES: { re: RegExp; msg: string }[] = [
  { re: /useReducedMotion[\s\S]{0,40}?from ["']motion\/react["']/, msg: "imports useReducedMotion from motion/react; use useHydratedReducedMotion from @/lib/use-reduced-motion instead" },
  { re: /Math\.(cos|sin)\(/, msg: "calls Math.cos/Math.sin; import cos/sin from @/lib/trig so SSR and client agree" },
  { re: /#[0-9a-fA-F]{6}\b/, msg: "contains a hard-coded hex colour; use the CSS variables (--ink, --accent, --line…)" },
  { re: /useState\([^)]*Math\.random/, msg: "initialises state with Math.random, which differs between server and client" },
  { re: /style=\{\{[^}]*(Date\.now|Math\.random)/, msg: "computes a style from Date.now/Math.random, which differs between server and client" },
];
// Only the diagram components themselves; visual.tsx/placeholder.tsx/registry.ts are infrastructure.
const NOT_DIAGRAMS = new Set(["visual.tsx", "placeholder.tsx"]);
for (const entry of fs.readdirSync(visualSrc)) {
  if (!entry.endsWith(".tsx") || entry.endsWith(".template") || NOT_DIAGRAMS.has(entry)) continue;
  const rel = `src/components/visuals/${entry}`;
  const src = fs.readFileSync(path.join(visualSrc, entry), "utf8");
  if (!src.trimStart().startsWith('"use client"')) fail(rel, "must start with \"use client\"");
  if (!/export default function/.test(src)) fail(rel, "must have a default export");
  for (const rule of VISUAL_SOURCE_RULES) {
    if (rule.re.test(src)) fail(rel, rule.msg);
  }
  // A visual may draw with HTML instead of SVG, so only require a labelled graphic or a
  // live region that the Listen button can read.
  if (!/<svg|role="img"/.test(src) && !/aria-live/.test(src)) {
    warn(rel, "has neither an SVG/role=img graphic nor an aria-live region");
  }
}

// ── shared UI source rules ───────────────────────────────────────────────────
// The explainer rules above only ever looked inside src/components/visuals. Everything that
// broke the lesson page itself lived outside that directory, so the same classes of bug are
// checked across the whole component tree, plus the one import boundary that turns a working
// page into a 500.
const CLIENT_ONLY_LIBS: Record<string, string> = {
  "@/lib/speech": "@/lib/speech-core",
};

const SHARED_SOURCE_RULES: { re: RegExp; msg: string }[] = [
  // A bare glyph is not an icon: it renders in whatever font the OS picks, sits at the mercy of
  // baseline alignment, and cannot carry a stroke weight to match the rest of the UI.
  { re: />\s*[▶◀►■◼◻▸◾]\s*</, msg: "uses a text play/stop glyph in JSX; use a lucide icon (Volume2, Play, Square) so it matches the rest of the UI" },
  { re: /["'`]▶|▶["'`]/, msg: "uses a text play/stop glyph; use a lucide icon instead" },
  // A control hidden until hover cannot be found on a touchscreen, which has no hover.
  { re: /<button[^>]*className=\{?["'`][^"'`]*\bopacity-0\b/, msg: "renders a button at opacity-0; there is no hover on touch, so it is invisible there. Reveal on focus-visible instead, or keep it visible." },
  // Same idea, spelled as a class on a wrapper that only shows on group-hover.
  { re: /\bgroup-hover\/[a-z0-9]+:opacity-100\b/, msg: "reveals a control only on group-hover; it stays invisible on touch. Prefer always-visible or a focus-visible fallback." },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const compRoot = path.join(process.cwd(), "src/components");
for (const file of walk(compRoot)) {
  const rel = path.relative(process.cwd(), file);
  const src = fs.readFileSync(file, "utf8");
  const isClient = src.trimStart().startsWith('"use client"');
  for (const rule of SHARED_SOURCE_RULES) {
    if (rule.re.test(src)) fail(rel, rule.msg);
  }
  // A server component cannot call an export of a "use client" module -- React throws while
  // rendering and the page 500s. Importing a *client component* from one is fine; calling a
  // plain helper is not, which is why the helpers live in a sibling non-client module.
  if (!isClient) {
    for (const [lib, safe] of Object.entries(CLIENT_ONLY_LIBS)) {
      if (new RegExp(`from ["']${lib.replace("/", "\\/")}["']`).test(src)) {
        fail(rel, `is a server component but imports "${lib}", which is "use client". Import "${safe}" instead -- a server component cannot call a client export.`);
      }
    }
  }
}

// A small control is only acceptable if its 44px tap area comes from the shared `hit-44`
// overlay. Without it the painted box is the whole target, which is how the section listen
// buttons first shipped at 24px.
//
// This needs a real scan rather than a regex: an opening tag can contain `>` inside an
// onClick arrow, and a naive `<button[\s\S]{0,400}?className` happily runs past the end of the
// tag and blames the next element's className instead.
function openingTags(src: string, name: string): string[] {
  const tags: string[] = [];
  const re = new RegExp(`<${name}\\b`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length;
    let depth = 0;
    let quote: string | null = null;
    while (i < src.length) {
      const c = src[i];
      if (quote) {
        if (c === "\\") i++;
        else if (c === quote) quote = null;
      } else if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
      i++;
    }
    tags.push(src.slice(m.index, i + 1));
  }
  return tags;
}

for (const file of walk(compRoot)) {
  const rel = path.relative(process.cwd(), file);
  const src = fs.readFileSync(file, "utf8");
  for (const tag of openingTags(src, "button")) {
    // Tailwind's default scale: size-11 / h-11 is 2.75rem = 44px, so 6 through 10 are all short.
    if (!/\b(?:size|h)-(?:6|7|8|9|10)\b/.test(tag)) continue;
    if (/\bhit-44\b/.test(tag)) continue;
    fail(rel, "has a button painted under 44px without the `hit-44` overlay; add hit-44 or make the control 44px");
  }
}

// ── study plans ─────────────────────────────────────────────────────────────
// The linter never opened this file, so an unresolvable refId silently produced a
// plan with dead links.
function readJson<T>(rel: string, fallback: T): T {
  const file = path.join(ROOT, rel);
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

const plans = readJson<{ id?: string; certId?: string; days?: { day?: number; blocks?: { kind?: string; refId?: string | null }[] }[] }[]>("study-plans.json", []);
const certIdSet = new Set(certs.map((c) => String(c.id)));
// refIds are ids scoped to the plan's own cert, e.g. "f-agentic-loop" and "d1-agentic".
const lessonsByCert = new Map<string, Set<string>>();
const domainsByCert = new Map<string, Set<string>>();
for (const cert of certs) {
  const cid = String(cert.id);
  lessonsByCert.set(cid, new Set());
  domainsByCert.set(cid, new Set());
  for (const domain of arr(cert.domains) as Json[]) {
    domainsByCert.get(cid)!.add(String(domain.id));
    const mod = readJson(`modules/${cid}/${String(domain.id)}.json`, {}) as Json;
    for (const lesson of arr(mod.lessons)) lessonsByCert.get(cid)!.add(String((lesson as Json).id));
  }
}
if (!plans.length) fail("study-plans.json", "no study plans");
for (const plan of plans) {
  if (!plan.certId || !certIdSet.has(plan.certId)) {
    fail("study-plans.json", `plan ${plan.id} points at unknown certId "${plan.certId}"`);
    continue;
  }
  if (!arr(plan.days).length) fail("study-plans.json", `plan ${plan.id} has no days`);
  for (const day of arr(plan.days) as { blocks?: { kind?: string; refId?: string | null } }[]) {
    for (const block of arr(day.blocks) as { kind?: string; refId?: string | null }[]) {
      if (!block.refId) continue;
      if (block.kind === "lesson" && !lessonsByCert.get(plan.certId!)?.has(block.refId)) {
        fail("study-plans.json", `plan ${plan.id} references lesson "${block.refId}", which does not exist in ${plan.certId}`);
      }
      // "weak" is a sentinel the plan builder uses for the adaptive weakest-areas quiz.
      if ((block.kind === "quiz" || block.kind === "flashcards") && block.refId !== "weak" && !domainsByCert.get(plan.certId!)?.has(block.refId)) {
        fail("study-plans.json", `plan ${plan.id} references domain "${block.refId}", which does not exist in ${plan.certId}`);
      }
    }
  }
}

// ── cross-cert question id uniqueness (the loader dedupes silently) ──────────
const allQ: { id: string; label: string }[] = [];
for (const cert of certs) {
  for (const domain of arr(cert.domains) as Json[]) {
    for (const rel of questionFiles(String(cert.id), String(domain.id))) {
      const doc = read(rel);
      for (const q of arr(doc?.questions) as Json[]) allQ.push({ id: String(q.id), label: rel });
    }
  }
}
const seenIds = new Map<string, string>();
for (const q of allQ) {
  const prev = seenIds.get(q.id);
  if (prev) fail(q.label, `question id ${q.id} also used in ${prev}`);
  seenIds.set(q.id, q.label);
}

console.log("\nQuestion bank by domain\n");
console.log("domain".padEnd(44) + "  total   easy   med  hard  multi  scen");
for (const s of stats.sort((a, b) => a.label.localeCompare(b.label))) {
  console.log(
    s.label.padEnd(44) +
      String(s.n).padStart(6) +
      String(s.easy).padStart(7) +
      String(s.med).padStart(6) +
      String(s.hard).padStart(6) +
      String(s.multi).padStart(7) +
      String(s.scen).padStart(6),
  );
}
const total = stats.reduce((a, s) => a + s.n, 0);
console.log(
  "TOTAL".padEnd(44) +
    String(total).padStart(6) +
    String(stats.reduce((a, s) => a + s.easy, 0)).padStart(7) +
    String(stats.reduce((a, s) => a + s.med, 0)).padStart(6) +
    String(stats.reduce((a, s) => a + s.hard, 0)).padStart(6) +
    String(stats.reduce((a, s) => a + s.multi, 0)).padStart(7) +
    String(stats.reduce((a, s) => a + s.scen, 0)).padStart(6),
);
const thin = stats.filter((s) => s.n < 90);
if (thin.length) console.log(`\n${thin.length} domain(s) below 90 questions: ${thin.map((s) => `${s.label}(${s.n})`).join(", ")}`);

if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const w of warnings.slice(0, 40)) console.log("  ~ " + w);
  if (warnings.length > 40) console.log(`  ... and ${warnings.length - 40} more`);
}
if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems.slice(0, 60)) console.log("  x " + p);
  if (problems.length > 60) console.log(`  ... and ${problems.length - 60} more`);
  process.exit(1);
}
console.log("\nAll content checks passed.");