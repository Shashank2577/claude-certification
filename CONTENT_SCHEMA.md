# Content Contract (shared by app + content agents)

All study content lives in `content/` as JSON. The app reads it at build/run time (server side, `fs`). Never hard-code content in components.

## content/certs.json
```json
[{
  "id": "foundations",                 // "foundations" | "professional"
  "name": "Claude Certified Architect – Foundations",
  "tagline": "string",
  "description": "string (markdown ok)",
  "examInfo": {
    "questionCount": 60, "durationMinutes": 120, "passingScore": 720, "scoreScale": "100-1000",
    "format": "string", "delivery": "string", "cost": "string", "prerequisites": "string",
    "retakePolicy": "string", "sourceUrl": "https://...", "verified": true, "notes": "string"
  },
  "domains": [{
    "id": "d1-agentic",                // kebab, unique within cert
    "name": "Agentic Architecture & Orchestration",
    "weight": 27,                      // percent of exam
    "summary": "string",
    "color": "#hex",
    "taskStatements": [{ "id": "1.1", "text": "string" }]
  }],
  "scenarios": [{ "id": "s1", "title": "string", "description": "string" }]   // exam scenario contexts, if any
}]
```

## content/modules/{certId}/{domainId}.json
```json
{
  "certId": "foundations", "domainId": "d1-agentic",
  "lessons": [{
    "id": "agentic-loop-basics",       // unique within cert
    "title": "string",
    "estMinutes": 8,
    "level": "core" ,                  // "core" | "deep" (deep = optional depth)
    "taskStatementIds": ["1.1"],
    "eli5": "1-3 sentence plain-English explanation for non-technical learners",
    "body": "markdown. Use ## headings, lists, tables, ```code``` blocks. 400-1200 words.",
    "visualId": "agentic-loop",        // optional; MUST be an id from VISUAL REGISTRY below
    "keyTakeaways": ["string"],
    "examTips": ["how the exam tests this / how to pick the right answer"],
    "commonTraps": ["distractor patterns that look right but are wrong"],
    "resources": [{ "title": "string", "url": "https://...", "type": "docs|video|blog|repo|course" }]
  }]
}
```

## content/questions/{certId}/{domainId}.json
```json
{
  "certId": "foundations", "domainId": "d1-agentic",
  "questions": [{
    "id": "f-d1-001",                  // globally unique
    "taskStatementId": "1.1",
    "scenario": "optional shared scenario paragraph (context setup)",
    "stem": "the question",
    "options": [{ "id": "A", "text": "..." }, { "id": "B", "text": "..." }, { "id": "C", "text": "..." }, { "id": "D", "text": "..." }],
    "correct": ["B"],                  // >1 entry => multi-select ("choose two")
    "explanation": "why the correct answer is correct (markdown)",
    "whyWrong": { "A": "...", "C": "...", "D": "..." },
    "difficulty": 2,                   // 1 easy, 2 medium, 3 hard
    "visualId": "agentic-loop",        // optional; MUST be an id from VISUAL REGISTRY. Rendered with the explanation.
    "mindset": "the architect-thinking principle this tests, one line",
    "tags": ["string"],
    "sourceRefs": ["https://docs.claude.com/..."]
  }]
}
```

## content/flashcards/{certId}/{domainId}.json
```json
{ "certId": "foundations", "domainId": "d1-agentic",
  "cards": [{ "id": "f-d1-fc-001", "front": "string", "back": "string (markdown ok)", "tags": [] }] }
```

## content/resources.json
```json
[{ "id": "string", "title": "string", "url": "https://...", "type": "docs|video|blog|repo|course|community",
   "certIds": ["foundations"], "domainIds": [], "description": "string", "priority": "must|should|nice",
   "verified": true, "estMinutes": 30 }]
```

## content/insights.json  (what past candidates say + mindset)
```json
{
  "candidateReports": [{ "source": "string", "url": "https://...", "cert": "foundations", "summary": "string", "tips": ["string"] }],
  "mindsetPrinciples": [{ "id": "string", "title": "string", "body": "string", "example": "string" }],
  "examDayChecklist": ["string"],
  "commonMistakes": ["string"]
}
```

## content/study-plans.json
```json
[{ "id": "3-day", "title": "3-Day Sprint", "certId": "foundations", "description": "string",
   "days": [{ "day": 1, "title": "string", "blocks": [{ "kind": "lesson|quiz|flashcards|mock|review|resource",
      "refId": "lesson id / domain id / resource id / null", "title": "string", "minutes": 30 }] }] }]
```

## VISUAL REGISTRY (interactive React components in `src/components/visuals/`)
Lessons may only reference these `visualId`s. Each is a self-contained client component, default export, no props required.
- `agentic-loop` – animated agent loop: prompt → model → tool_use → tool_result → … → end_turn (step-through)
- `orchestrator-subagents` – hub & spoke coordinator delegating to subagents, context isolation, results flowing back
- `workflow-patterns` – toggle between prompt chaining / routing / parallelization / orchestrator-workers / evaluator-optimizer
- `mcp-architecture` – host ↔ client ↔ server; tools/resources/prompts; stdio vs HTTP transports
- `tool-design` – good vs bad tool definitions side-by-side; description quality → tool selection accuracy
- `claude-code-config` – CLAUDE.md hierarchy (user/project/local/dir), settings precedence, hooks lifecycle, skills, slash commands, subagents
- `hooks-lifecycle` – timeline of PreToolUse/PostToolUse/UserPromptSubmit/Stop/SessionStart etc. with block/allow
- `context-window` – context budget filler: system, tools, history, docs; compaction/caching effects
- `prompt-caching` – cache prefix breakpoints, hit vs miss cost/latency
- `structured-output` – JSON schema / tool_use forcing, validation-retry loop
- `prompt-anatomy` – parts of a strong prompt (role, context, XML tags, examples, output format) toggleable
- `rag-pipeline` – chunk → embed → retrieve → rerank → ground → cite
- `escalation-hitl` – human-in-the-loop / escalation decision flow, confidence thresholds
- `batch-vs-realtime` – Message Batches API vs synchronous; latency/cost tradeoff slider
- `error-recovery` – retries, fallbacks, idempotency, partial failure in multi-agent systems
- `eval-loop` – evals: test set → run → grade (code / LLM-judge / human) → iterate
- `security-guardrails` – permission modes, least privilege tools, prompt injection boundaries
- `exam-strategy` – elimination funnel for scenario questions
