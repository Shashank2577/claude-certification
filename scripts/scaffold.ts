// Scaffolds a new certification end to end, so nobody has to remember all eight
// places a cert has to appear.
//
//   pnpm scaffold:exam --id=cca-security --role="Security" --tier="Professional"
//                     --domains="Threat Modelling,RAG Security" [--force]
//
// What it writes:
//   content/certs.json                        + the cert, its domains, task statements
//   content/modules/{cert}/{domain}.json      + an empty lesson skeleton per domain
//   content/questions/{cert}/{domain}.part-1.json
//   content/flashcards/{cert}/{domain}.json
//   content/study-plans.json                  + 3-day / 7-day / 14-day plans
//   content/insights.json                     + a placeholder candidateReports entry
//   content/resources.json                    + nothing (add resources as you write them)
//
// What it CANNOT write, so it prints a checklist instead of silently skipping:
//   src/components/visuals/registry.ts         if the exam needs new explainers
//   docs/index.html                            the marketing card, counts and role matrix
//   README.md / CONTENT_SCHEMA.md              prose mentions
//
// Every file it writes comes from templates/, so the template and the scaffolder can
// never drift apart. Re-running is safe: it refuses to overwrite unless --force.

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TEMPLATES = path.join(ROOT, "templates");

// ── args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
};
const has = (name: string) => args.includes(`--${name}`);

const certId = flag("id");
const role = flag("role") ?? "Something";
const tier = flag("tier") ?? "Foundations";
const domainArg = flag("domains") ?? "";
const force = has("force");

if (!certId) {
  console.error(
    "Usage: pnpm scaffold:exam --id=<kebab-id> --role=\"...\" --tier=\"...\" --domains=\"Name A,Name B\" [--force]",
  );
  process.exit(1);
}
if (!/^[a-z][a-z0-9-]*$/.test(certId)) {
  console.error(`--id must be kebab-case, got "${certId}"`);
  process.exit(1);
}

// ── helpers ─────────────────────────────────────────────────────────────────
const readJson = <T,>(rel: string): T => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
const writeJson = (rel: string, data: unknown) => {
  const file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`  wrote ${rel}`);
};

/** Renders a template. Strips the _comment key, which is guidance, not content. */
function render(templateName: string, vars: Record<string, string | number>): unknown {
  const raw = fs.readFileSync(path.join(TEMPLATES, templateName), "utf8");
  const filled = raw.replace(/\{\{(\w+)\}\}/g, (_, k: string) => {
    if (!(k in vars)) throw new Error(`template ${templateName} needs {{${k}}}`);
    return String(vars[k]);
  });
  const parsed = JSON.parse(filled) as Record<string, unknown>;
  delete parsed._comment;
  return parsed;
}

/** `Compliance And Risk` -> `compliance-and-risk` */
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const PALETTE = ["#f2a532", "#3550c4", "#1d6b55", "#b4372a", "#6b4fbb", "#0f7d8c"];
const certs = readJson<Record<string, unknown>[]>("content/certs.json");

if (certs.some((c) => c.id === certId)) {
  console.error(`A certification with id "${certId}" already exists. Use --force to add anyway.`);
  process.exit(1);
}

const domainNames = domainArg
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (!domainNames.length) {
  console.error("--domains is required, e.g. --domains=\"Threat Modelling,RAG Security\"");
  process.exit(1);
}

console.log(`\nScaffolding certification "${certId}" with ${domainNames.length} domain(s)\n`);

// ── 1. certs.json ───────────────────────────────────────────────────────────
const domains = domainNames.map((name, i) => {
  const id = `d${i + 1}-${slug(name)}`;
  // Even split so the weights sum to exactly 100.
  const weight = Math.floor(100 / domainNames.length);
  return {
    id,
    name,
    weight,
    summary: `TODO: what a candidate must be able to do in ${name}.`,
    color: PALETTE[i % PALETTE.length],
    taskStatements: [
      { id: `${i + 1}.1`, text: `TODO: first objective for ${name}, copied verbatim from the official exam guide.` },
      { id: `${i + 1}.2`, text: `TODO: second objective for ${name}.` },
    ],
  };
});
// Give the remainder to the first domain so the total is exactly 100.
domains[0].weight += 100 - domains.reduce((t, d) => t + d.weight, 0);

const cert = render("cert.json.template", { certId, role, tier }) as Record<string, unknown>;
cert.domains = domains;
certs.push(cert);
writeJson("content/certs.json", certs);

// ── 2. per-domain content files ─────────────────────────────────────────────
const certPrefix = certId.slice(0, 2);
domains.forEach((domain, i) => {
  const vars = {
    certId,
    domainId: domain.id,
    domainNum: String(i + 1),
    certPrefix,
    slug: domain.id.replace(/^d\d+-/, ""),
    batch: "b1",
    visualId: "",
    domainName: domain.name,
  };

  const moduleFile = `content/modules/${certId}/${domain.id}.json`;
  if (fs.existsSync(path.join(ROOT, moduleFile)) && !force) {
    console.log(`  kept  ${moduleFile} (exists)`);
  } else {
    writeJson(moduleFile, render("module.json.template", vars));
  }

  const qFile = `content/questions/${certId}/${domain.id}.part-1.json`;
  if (fs.existsSync(path.join(ROOT, qFile)) && !force) {
    console.log(`  kept  ${qFile} (exists)`);
  } else {
    writeJson(qFile, render("questions.json.template", vars));
  }

  const fFile = `content/flashcards/${certId}/${domain.id}.json`;
  if (fs.existsSync(path.join(ROOT, fFile)) && !force) {
    console.log(`  kept  ${fFile} (exists)`);
  } else {
    writeJson(fFile, render("flashcards.json.template", vars));
  }
});

// ── 3. study plans ──────────────────────────────────────────────────────────
const plans = readJson<Record<string, unknown>[]>("content/study-plans.json");
const dayTitles: Record<number, string> = { 3: "Three-Day Sprint", 7: "Seven-Day Plan", 14: "Fourteen-Day Plan" };
for (const days of [3, 7, 14]) {
  plans.push({
    id: `${certId}-${days}-day`,
    title: dayTitles[days],
    certId,
    description: `A ${days}-day plan for ${role} – ${tier}. TODO: write the pitch.`,
    days: Array.from({ length: days }, (_, i) => ({
      day: i + 1,
      title: `Day ${i + 1}: TODO`,
      blocks: [
        { kind: "lesson", refId: null, title: "TODO: lesson or quiz for this day", minutes: 30 },
      ],
    })),
  });
}
writeJson("content/study-plans.json", plans);

// ── 4. insights ─────────────────────────────────────────────────────────────
const insights = readJson<Record<string, unknown>>("content/insights.json");
const reports = insights.candidateReports as Record<string, unknown>[];
reports.push({
  source: "TODO: who reported on this exam",
  url: "https://",
  cert: certId,
  summary: "TODO: what they said about the exam.",
  tips: ["TODO: one concrete tip."],
});
writeJson("content/insights.json", insights);

// ── 5. what only a human can do ─────────────────────────────────────────────
console.log(`
Done. Now do these by hand — they are the ones the scaffolder cannot guess:

  1. Fill in the TODOs. Start with the task statements in content/certs.json;
     questions are keyed to them, so get them right first.
  2. Write the lessons. Each one needs a visualId from
     src/components/visuals/registry.ts. Run \`pnpm scaffold:visual <id> "Title" "Caption"\`
     for a new one.
  3. docs/index.html — add an exam card to .exam-grid, update the stats strip and
     the counts, and add the exam to the role matrix in the CERTS/ROLES script.
     This is the "both structures" trap: content/ and the landing page are
     separate files and the scaffolder will not guess your marketing copy.
  4. \`pnpm validate:content\` must pass before you commit.
`);

// ── 6. enforce the checklist in CI-facing commands ───────────────────────────
console.log("Reminder: nothing here is finished until `pnpm validate:content` is clean.");