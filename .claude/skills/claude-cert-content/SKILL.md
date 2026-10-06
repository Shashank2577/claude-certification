---
name: claude-cert-content
description: Use when adding or changing anything in content/ or src/components/visuals/ — a new certification, domain, lesson, question batch, flashcard deck, or interactive explainer — and when fixing content or visual bugs. Triggers on: new exam, new certification, new domain, new lesson, new questions, new explainer, new diagram, new animation, question bank, flashcards, study plan, CLAUDE.md content, content validator, visual registry.
---

# Claude Certification Content

Study content is JSON under `content/`, read server-side via `fs`. Nothing is hard-coded in components.
Three rules cause nearly every defect here: a missing registration, a duplicate id that the app
silently swallows, and an explainer that looks fine but renders nothing.

Read the source of truth before guessing: `CONTENT_SCHEMA.md` (shape), `scripts/validate-content.ts`
(what is actually enforced), `templates/` (what a good entity looks like).

## 1. One-command paths

Use these before hand-writing anything. Each template is the source the scaffolder renders from, so
they cannot drift.

| Goal | Command |
| --- | --- |
| New certification | `pnpm scaffold:exam --id=cca-security --role="Security" --tier="Professional" --domains="Threat Modelling,RAG Security"` |
| New explainer | `pnpm scaffold:visual cca-rag-security "RAG security" "Where retrieval meets access control"` |
| Validate content | `pnpm validate:content` |
| Question-batch brief | Read `scripts/QBANK_BRIEF.md` before writing questions |

`pnpm scaffold:exam` flags: `--id` (required, kebab), `--role`, `--tier`, `--domains` (required,
comma-separated names), `--force` (bare flag, overwrites existing files).
It refuses to clobber an existing cert id or existing files without `--force`. Safe to re-run.

It writes `content/certs.json`, `content/modules/{cert}/{domain}.json`,
`content/questions/{cert}/{domain}.part-1.json`, `content/flashcards/{cert}/{domain}.json`,
`content/study-plans.json` (3/7/14-day), `content/insights.json`, and prints a numbered checklist of
what it cannot do. Everything it emits contains `TODO:` strings. Grep for them before you finish.

`pnpm scaffold:visual <id> "Title" "Caption"` writes `src/components/visuals/<id>.tsx` from
`templates/visual.tsx.template` (component renamed to PascalCase) and appends the entry to
`registry.ts`. Refuses to overwrite an existing `.tsx`.

## 2. The eight places a certification must appear

The scaffolder covers six. It cannot guess the last two — it prints them as a checklist.

| # | Location | Who writes it |
| --- | --- | --- |
| 1 | `content/certs.json` — the cert object: `id`, `name`, `tagline`, `description`, `examInfo`, `domains[]` (each with `id`, `name`, `weight`, `summary`, `color`, `taskStatements[]`), `scenarios[]` | `scaffold:exam` |
| 2 | `content/modules/{certId}/{domainId}.json` — `{ certId, domainId, lessons[] }` | `scaffold:exam` |
| 3 | `content/questions/{certId}/{domainId}.part-N.json` — one batch per file | `scaffold:exam` (part-1 only) |
| 4 | `content/flashcards/{certId}/{domainId}.json` — `{ certId, domainId, cards[] }` | `scaffold:exam` |
| 5 | `content/study-plans.json` — one plan per cert per length | `scaffold:exam` |
| 6 | `content/insights.json` — a `candidateReports` placeholder for the cert | `scaffold:exam` |
| 7 | `src/components/visuals/registry.ts` — an entry per new `visualId` | `scaffold:visual`, or by hand |
| 8 | `docs/index.html` — three separate edits | **by hand only** |

`docs/index.html` specifics (this is the "two structures" trap; `content/` and the landing page are
unrelated files and nothing links them):
- An `<article class="exam">` in the `.exam-grid` block: tier label, `<h3>`, the `.facts` triple
  (questions / minutes / to-pass), one `.bar-row` per domain with `<i data-w="NN">`, and a `.note`.
- The stats strip (`.strip-grid`, `.stat` blocks) — four hard-coded counts (lessons, visual
  explainers, questions, flashcards). Recount them after adding a domain; nothing derives them
  from `content/`. The fifth stat is a fixed score range and needs no edit.
- The `CERTS` array (what each exam teaches) and the `ROLES` array (role matrix, each with a
  `picks[]` entry naming the exam, a `badge`, and a `why`).

## 3. Entity to template to validator rule

| Entity | Template | Real file | The validator rule that catches the mistake |
| --- | --- | --- | --- |
| Certification | `templates/cert.json.template` | `content/certs.json` | missing `name` or `tagline`; no `domains`; `taskStatements[].id` must be `<domainNumber>.<index>` (questions key off it) |
| Domain | (shape in `templates/domain.json.template`; not used by any script) | inline in `content/certs.json` `domains[]` | every task statement with **zero** questions is a hard failure; fewer than 3 is a warning |
| Lesson | `templates/module.json.template` | `content/modules/{cert}/{domain}.json` `lessons[]` | missing `title`/`eli5`/`body`; duplicate lesson id; `visualId` not in the registry is a hard failure; unknown `taskStatementIds`; body over 1600 words warns (target 400-1200) |
| Question batch | `templates/questions.json.template` | `content/questions/{cert}/{domain}.part-N.json` | `certId`/`domainId` must match the folder; duplicate ids (per domain **and** across all certs); `taskStatementId` must exist; fewer than 3 options; duplicate option ids; empty option text; empty `correct`; a `correct` entry that is not an option; `correct.length === options.length`; missing `whyWrong` on non-answers; `whyWrong` present on a correct answer; `explanation` under 80 chars; `difficulty` not 1/2/3; `visualId` not in the registry. Over 40 questions in one file warns — keep batches 15-28 |
| Flashcard deck | `templates/flashcards.json.template` | `content/flashcards/{cert}/{domain}.json` | a domain with no flashcard file is a warning; a card missing `front` or `back` is a failure |
| Explainer | `templates/visual.tsx.template` | `src/components/visuals/<id>.tsx` + an entry in `registry.ts` | the validator greps `registry.ts` for two-space-indented `"id": {` lines and fails any `visualId` not found there |
| Study plan | none | `content/study-plans.json` | **not read by the validator at all.** Nothing enforces it — a `refId` that does not resolve to a lesson, domain, or resource id silently produces no link, so check the plan renders |

## 4. Writing questions

Read `scripts/QBANK_BRIEF.md` first; it is the brief an agent is handed. The rules that bite:

- **Difficulty mix: per ~20 questions, about 4 easy / 10 medium / 6 hard (20/50/30).** The bank sits
  at 19/50/30 and should stay there. `1` is recall of one documented behaviour, still
  scenario-framed; `2` is best practice or symptom-to-fix; `3` is competing real trade-offs, subtle
  failure, or an anti-pattern that sounds correct. The skew to medium is deliberate — `1` is a
  confidence-builder and `3` is what the real exam is made of. Do not ship a batch that is mostly
  easy; it teaches nothing.
- **Multi-select is ~25-35% of a batch** (bank is 26%). `correct` with two entries renders "choose
  two". Give it a real explanation of why the pair works together.
- **`whyWrong` for every option that is not correct; never for a correct one.** The validator
  enforces the "never for correct" half for every question, but only enforces the "required for
  non-answers" half on single-select. Treat the stricter rule as binding on multi-select too — the
  brief and the templates both require it.
- **Id convention `^[a-z]{1,2}-d\d+-[a-z0-9-]+$`** — cert prefix, domain number, batch marker, slug.
  Off-pattern is a warning, not an error, so it ships silently. Prefixes in use: `f-` foundations,
  `p-` professional, `a-` associate, `v-` developer. Batch markers already used: `b*`, `g*`, `w*`,
  `x*`, `y*`, `z*` (with `b`-suffixed variants like `y5b`). **Use a fresh marker for every new
  batch.** `src/lib/content.ts` drops any question whose id it has already seen, with no warning —
  a collision means your questions vanish from the app while the bank still reports the count.
- **Never invent API behaviour.** If you cannot verify a claim about the Claude API, Agent SDK, or
  Claude Code, either verify it against `platform.claude.com/docs/en/` / `code.claude.com/docs/en/`
  or write the question so correctness does not hinge on the uncertain detail. Put 1-3 real URLs in
  `sourceRefs`, reusing ones already in the bank. No "all of the above". No repeat of an existing
  question — read 2-3 files in the domain first.
- Every task statement needs at least 3 questions. Every batch needs a specific `scenario` (named
  organisation, real constraint, real failure) reused across a cluster, not generic filler.

## 5. Explainer checklist

`templates/visual.tsx.template` carries this list in its header comments; every item is a defect
that shipped. Re-read it before writing the SVG.

- **Text must fit the viewBox.** An SVG clips to its viewBox with no scrollbar and no warning. Two
  captions shipped this way and were invisible at every width. A full-sentence caption needs its own
  `<tspan>` line or a wrap. Measure, do not eyeball.
- **Every clickable SVG node needs a keyboard-reachable twin.** `<g onClick>` is mouse-only; a tier
  selector and a stage selector shipped unreachable to keyboard users. Add a real `<button>` that
  does the same thing.
- **`useHydratedReducedMotion` from `@/lib/use-reduced-motion`, never `useReducedMotion` from
  `motion/react`.** Motion's version answers the true value on the first client render, so anything
  fed into `initial`, `style`, or a branch mismatches the server output and React logs a hydration
  error. The local hook returns `false` during SSR and the hydration render, then the real value
  after mount. (`src/components/visuals/README.md` still says to call `useReducedMotion()`; that
  line is stale. All 26 built visuals use the hydrated hook.)
- **Import `cos`/`sin` from `@/lib/trig`.** `Math.cos`/`Math.sin` differ in the last bit between Node
  and V8, and a differing SVG attribute is a hydration mismatch. Never `Math.random()` or
  `Date.now()` during render.
- **Colour via CSS variables only, no hex literals.** Available: `--ink`, `--ink-2`, `--muted`,
  `--surface`, `--surface-2`, `--bg`, `--line`, `--line-strong`, `--accent`, `--accent-strong`,
  `--accent-ink`, `--accent-text`, `--accent-soft`, `--good`, `--good-soft`, `--bad`, `--bad-soft`,
  `--info`, `--info-soft`. Fonts in SVG `<text>`: `style={{ font: "600 15px var(--font-display)" }}`
  (`--font-sans`, `--font-mono` also exist).
- **`viewBox` plus `className="h-auto w-full"`.** Never a fixed pixel width. Panels holding text
  need `min-w-0`; grid tracks need `minmax(0, 1fr)` or long labels widen the figure on a phone.
- **Must read at 375px.** Side panels go in a grid that stacks. If a single SVG genuinely cannot
  stack, give it a `min-w` and let the existing `overflow-x-auto` pan it, and comment why.
- **Every control is a `<button>` with an `aria-label`** (lucide icons are `aria-hidden`, so the
  accessible name goes on the wrapper). Arrow keys drive the step-through, so the wrapper needs
  `tabIndex={0}` and `role="group"`. The `<svg>` needs `role="img"` and an `aria-label` describing
  the **current** state, not a generic title.
- **An `aria-live="polite"` region holds the current explanation**, and that region's text is what
  the Listen button reads aloud — write it as a plain sentence per step, no bare `1/3` counters.
- **Prefer user-driven motion; no looping ambient animation.** It fights reduced motion and
  distracts while reading. When `reduce` is true, jump to end states: duration 0, no travelling dots.
- Contract: `"use client"`, `export default function`, **no props**, all data in the file (no fetch,
  no context, no content imports). Keep it under ~400 lines. Dependencies: React, `motion/react`,
  `lucide-react`, `clsx`. Do not add another card border at the root — the wrapper supplies it.
- Register under the same id in `registry.ts`. Never rename an id; lesson content depends on it.
  `load: null` is legal and renders `placeholder.tsx`, so you can register before building.

## 6. Verify before you commit

```
pnpm validate:content
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

`pnpm validate:content` must be **clean** — zero problems *and* zero new warnings in files you
touched. It prints a per-domain table (total / easy / med / hard / multi / scen); use it to confirm
your batch landed and the difficulty mix held. For a single visual, the scaffolder suggests
`npx tsc --noEmit -p tsconfig.json` and `npx eslint src/components/visuals/<id>.tsx`.

For an explainer, also check visually: 375px and 1280px, light and dark, reduced motion on, and
confirm every SVG caption is actually visible inside the frame.

## 7. Sub-agent split

Fan out when the work is genuinely independent; keep it serial when it is not.

- **One agent per domain for question batches.** Domains share no files, and the validator catches
  collisions, so parallel agents are safe. Name each agent's exact part file
  (`content/questions/<cert>/<domain>.part-N.json`), give it a **fresh batch marker reserved for
  that agent**, and point it at `scripts/QBANK_BRIEF.md`.
- **One agent per explainer.** Each writes its own `.tsx` and its own `registry.ts` entry. Note that
  concurrent edits to `registry.ts` can clobber each other — have agents return the entry text and
  add it yourself, or run them sequentially.
- **Parallel agents must each re-read the existing files in their domain before writing.** Nobody
  has shared context; without reading, two agents write the same batch marker or repeat a question.
- **The validator is the only thing that catches id collisions.** It runs after everything lands, not
  during. Run `pnpm validate:content` after **every** batch, and re-run after merging agent output.
- **Serial by nature:** `certs.json` task statements must be final before questions are written,
  since every question keys off them. Write and vet the task statements first, then fan out.
