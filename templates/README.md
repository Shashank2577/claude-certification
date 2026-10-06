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
| Question id convention, batch size, missing `mindset` | `validate:content` (warns) |
| SVG text fits the viewBox | not automatable — see the template checklist |
| Clickable SVG has a keyboard twin | not automatable — see the template checklist |

The two marked *not automatable* are the two bugs that actually shipped most recently. They are
in the template header and in `.claude/skills/claude-cert-content/SKILL.md` so they are checked by
reading, not by the linter.

## After you write anything

```bash
pnpm validate:content   # the gate. Must be clean before you commit.
```

Then `pnpm typecheck && pnpm lint && pnpm test`, and for anything touching a visual, look at it
at 375px and 1280px, in both themes, with reduced motion on.