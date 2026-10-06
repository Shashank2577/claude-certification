// Copies templates/visual.tsx.template into src/components/visuals/<id>.tsx with the
// placeholders filled in and the component named, and registers it in registry.ts if
// it is not there yet.
//
//   pnpm scaffold:visual cca-rag-security "RAG security" "Where retrieval meets access control"

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith("--"));
const [id, title, caption] = positional;

if (!id || !title || !caption) {
  console.error('Usage: pnpm scaffold:visual <visual-id> "Title" "One-line caption"');
  process.exit(1);
}
if (!/^[a-z][a-z0-9-]*$/.test(id)) {
  console.error(`visual id must be kebab-case, got "${id}"`);
  process.exit(1);
}

const target = path.join(ROOT, "src/components/visuals", `${id}.tsx`);
if (fs.existsSync(target)) {
  console.error(`${path.relative(ROOT, target)} already exists. Delete it first or pick another id.`);
  process.exit(1);
}

const raw = fs.readFileSync(path.join(ROOT, "templates/visual.tsx.template"), "utf8");
const pascal = id
  .split("-")
  .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
  .join("");

const filled = raw
  .replace(/\bMyVisual\b/g, pascal)
  .replace(/STEP ONE: the caption sentence\./g, caption)
  .replace(/\{\{title\}\}/g, title);

fs.writeFileSync(target, filled);
console.log(`  wrote src/components/visuals/${id}.tsx  (component ${pascal})`);

// ── register ────────────────────────────────────────────────────────────────
const registryPath = path.join(ROOT, "src/components/visuals/registry.ts");
const registry = fs.readFileSync(registryPath, "utf8");

if (new RegExp(`^ {2}"${id}":`, "m").test(registry)) {
  console.log(`  kept  registry.ts (${id} already registered)`);
} else {
  const entry = `  "${id}": {\n    title: ${JSON.stringify(title)},\n    description: ${JSON.stringify(caption)},\n    load: () => import("./${id}"),\n  },\n`;
  const anchor = registry.lastIndexOf("\n};");
  if (anchor === -1) {
    console.error("Could not find the end of the VISUALS object in registry.ts. Add the entry by hand.");
  } else {
    fs.writeFileSync(registryPath, registry.slice(0, anchor + 1) + entry + registry.slice(anchor + 1));
    console.log("  wrote registry.ts");
  }
}

console.log(`
Next:
  1. Replace the STEPS array and the diagram with your own content.
  2. Read the checklist at the top of the file before you touch the SVG. Every
     rule in it is a bug that actually shipped here.
  3. Verify at 375px AND 1280px, in light and dark, and with reduced motion on:
       npx tsc --noEmit -p tsconfig.json
       npx eslint src/components/visuals/${id}.tsx
  4. Reference it from a lesson with "visualId": "${id}".
`);