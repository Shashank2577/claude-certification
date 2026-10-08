# Templates

Every content entity has one template here, and the scaffolders render from these files
rather than building content in code — so a template and its scaffolder cannot drift apart.

| Entity | Template | Lands in | Made by |
| --- | --- | --- | --- |
| Certification | `cert.json.template` | `content/certs.json` | `pnpm scaffold:exam` |
| Domain | `domain.json.template` | inside a cert in `content/certs.json` | `pnpm scaffold:exam` |
| Lesson | `module.json.template` | `content/modules/{cert}/{domain}.json` | `pnpm scaffold:exam` |
| Question batch | `questions.json.template` | `content/questions/{cert}/{domain}.part-N.json` | `pnpm scaffold:exam` |
| Flashcard deck | `flashcards.json.template` | `content/flashcards/{cert}/{domain}.json` | `pnpm scaffold:exam` |
| Explainer / animation | `visual.tsx.template` | `src/components/visuals/{id}.tsx` + `registry.ts` | `pnpm scaffold:visual` |

`domain.json.template` documents the shape of a domain entry for when you are adding one to an
existing cert by hand; `scaffold.ts` builds that object inline rather than rendering the file.

## Adding a certification

```bash
pnpm scaffold:exam --id=cca-security --role=Security --tier=Professional \
  --domains="Threat Modelling,RAG Security"
```

Writes the cert and domains into `content/certs.json`, a lesson skeleton per domain, an empty
question batch and flashcard deck per domain, three study plans, and an insights placeholder.
It then prints the things it deliberately does not do — chiefly the `docs/index.html` exam card,
the stats strip and the role matrix, which are hand-written marketing copy.

## Adding an explainer

```bash
pnpm scaffold:visual rag-security-layers "RAG security layers" "Where retrieval meets access control"
```

Copies `visual.tsx.template`, names the component after the id, and registers it. **Read the
checklist at the top of the generated file before you touch the SVG** — every rule in it is a bug
that shipped in this repo.

## The rules that matter, and where they are enforced

| Rule | Enforced by |
| --- | --- |
| Question ids unique and well-formed | `validate:content` (fails) |
| `taskStatementId` exists in `certs.json` | `validate:content` (fails) |
| `whyWrong` on every distractor, never on an answer | `validate:content` (fails) |
| Every task statement has questions | `validate:content` (fails) |
| `visualId` exists in the registry | `validate:content` (fails) |
| Study-plan `refId` resolves | `validate:content` (fails) |
| Visuals use `useHydratedReducedMotion`, not motion's hook | `validate:content` (fails) |
| No `Math.cos`/`Math.sin`, no hex in a visual | `validate:content` (fails) |
| Server component never imports a `"use client"` export | `validate:content` (fails) |
| No text play/stop glyphs in JSX — lucide icons only | `validate:content` (fails) |
| No control hidden behind `opacity-0` / `group-hover` | `validate:content` (fails) |
| Button painted under 44px carries `hit-44` | `validate:content` (fails) |
| Lesson page actually rendered (not a 500) | `verify-hydration.mjs` (fails) |
| `hit-44` overlay really delivers 44px | `verify-hydration.mjs` (fails) |
| No hydration error, no motion ignoring reduced motion | `verify-hydration.mjs` (fails) |
| Question id convention, batch size, missing `mindset` | `validate:content` (warns) |
| SVG text fits the viewBox | not automatable — see the template checklist |
| Clickable SVG has a keyboard twin | not automatable — see the template checklist |

The shared-UI rules (the middle block) apply to everything under `src/components/`, not just
explainer files, because every one of them broke the lesson page rather than a figure. The
rendered-page check exists because the sweep used to look only for `<figure>`: a 500 removes the
figure, so every other check read zero and the sweep reported a clean page that was not rendering.

## Keep the gate green

A check that fails on already-committed code is a check people learn to ignore. When the 44px rule
was added it immediately flagged 24 pre-existing buttons, and they were fixed in the same change.
Clear violations in the same commit that introduces the rule, or you have traded a silent bug for
a noisy one.

## After you write anything

```bash
pnpm validate:content   # the gate. Must be clean before you commit.
```

Then `pnpm typecheck && pnpm lint && pnpm test && pnpm build`, and for anything touching a visual,
look at it at 375px and 1280px, in both themes, with reduced motion on.

With the dev server on 3111:

```bash
node scripts/verify-hydration.mjs             # all 26 visuals, plain motion
node scripts/verify-hydration.mjs --rm        # forced prefers-reduced-motion
ONLY=eval-loop node scripts/verify-hydration.mjs   # just one, while iterating
```