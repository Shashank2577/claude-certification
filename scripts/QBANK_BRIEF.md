# Question-writing brief

You are adding a NEW batch of practice questions to an existing study platform for
Anthropic's Claude certification exams. Repo: the current working directory.

## The contract
- `CONTENT_SCHEMA.md` — exact question schema + the VISUAL REGISTRY at the bottom.
- `scripts/validate-content.ts` — the linter that judges your work. Run it (`pnpm validate:content`); do not guess.
- 2-3 existing question files in your domain — match their depth, tone and JSON shape.

## Non-negotiable schema
File: `{ "certId": "...", "domainId": "...", "questions": [ ... ] }`, matching the folder exactly.

Each question:
- `id` — globally unique, matching `^[a-z]{1,2}-d\d+-[a-z0-9-]+$`. Use the cert prefix already in use
  in that domain (`f-`, `p-`, `a-`, `v-`) and a NEW batch marker so ids never collide (e.g. `v-d3-y4-001`).
- `taskStatementId` — MUST be one of the ids listed for your domain in `content/certs.json`. Verify it.
- `scenario` — concrete and specific (2-4 sentences): a named organisation, real constraints, a real
  failure. Not generic filler. Reuse a rich scenario across a cluster of related questions.
- `stem` — the question. Long, specific, scenario-driven. One question only.
- `options` — 4 options, ids "A".."D". Distractors must be plausible and specific: the answer a smart
  person gives who has missed one key idea.
- `correct` — `["B"]` single, or TWO entries meaning multi-select "choose two" (~25-35% of the batch).
- `explanation` — markdown, 80+ chars. Explain WHY, name the principle, cite the actual field/flag.
- `whyWrong` — for EVERY option not in `correct`, a specific sentence. Never for a correct option.
- `difficulty` — 1 easy, 2 medium, 3 hard.
- `mindset` — ONE line: the decision principle, as a rule of thumb.
- `tags` — 2-5 lowercase slugs.
- `sourceRefs` — 1-3 real URLs; prefer `platform.claude.com/docs/en/...` / `code.claude.com/docs/en/...`.
  Reuse URLs already present elsewhere in the bank (grep for them) rather than inventing.
- `visualId` — OPTIONAL, ~40-50% of the batch. MUST exist in `src/components/visuals/registry.ts`.
  Only when a diagram genuinely explains why the answer is right.

## Difficulty spread (explicitly requested: varying difficulty)
Per ~20 questions: about 4 easy, 10 medium, 6 hard.
- 1 = recall of a single documented behaviour, still scenario-framed.
- 2 = the standard case: best practice, or read a symptom and pick the fix.
- 3 = competing real trade-offs, subtle failure, or an anti-pattern that sounds correct.

## Quality bar
Professional certification exam prep. An expert should nod; a knowledgeable person should be
tempted by at least one distractor. Never invent API behaviour — if unsure whether something is true
of the Claude API / Agent SDK / Claude Code, either verify it or write the question so correctness
does not hinge on the uncertain detail. No "all of the above". Do not repeat an existing question.

## Layout
Write the exact part file(s) named in your task, each 15-28 questions (linter warns above 40).

## Verify
`pnpm validate:content 2>&1 | tail -25` — ZERO new problems, no warnings in your files.
