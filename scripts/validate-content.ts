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
        if (correct.length === 1 && optionIds.length > 2) {
          for (const c of correct) {
            // multi-select needs whyWrong on the un-picked distractors; single-select on all non-answers
            for (const o of optionIds) {
              if (o === c) continue;
                if (!whyWrong || !(o in whyWrong)) fail(rel, `${id}: missing whyWrong for option ${o}`);
            }
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

// ---- cross-cert question id uniqueness (the loader dedupes silently)
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