# Interactive lesson visuals

Lessons reference a diagram with `visualId` (see the VISUAL REGISTRY in `CONTENT_SCHEMA.md`).
The lesson page renders `<Visual id={lesson.visualId} />` from `visual.tsx`, which looks the id up in
`registry.ts`, lazy-loads the component, and shows `placeholder.tsx` for ids that aren't built yet.

`agentic-loop.tsx` is the reference implementation. Copy its structure.

## Contract

- **Client component.** First line `"use client";`.
- **Default export, no props.** `export default function MyVisual() { ... }`. All data lives in the file.
- **One file per visual**, named after its id: `src/components/visuals/<visual-id>.tsx`. Keep it under ~400 lines.
- **Dependencies:** React, `motion/react`, `lucide-react`, `clsx`. Nothing else.

## Registering

In `registry.ts`, replace `load: null` with a loader for your id:

```ts
"mcp-architecture": {
  title: "MCP architecture",
  description: "...",
  load: () => import("./mcp-architecture"),
},
```

Never rename ids; lesson content depends on them.

## Layout and responsiveness

- Draw diagrams as SVG with a `viewBox` and `className="h-auto w-full"` so they scale. Don't set fixed pixel widths.
- Must read well at 375px wide. Put side panels (transcripts, legends) in a grid that stacks on small screens (`grid gap-4 lg:grid-cols-[1.5fr_1fr]`).
- The wrapper already provides the outer card, padding and caption. Don't add another card border at the root.

## Theme

Use CSS variables only, never hard-coded hex, so light and dark themes both work:

| Purpose | Variable |
| --- | --- |
| Text / strong strokes | `var(--ink)`, `var(--ink-2)`, `var(--muted)` |
| Surfaces | `var(--surface)`, `var(--surface-2)`, `var(--bg)` |
| Lines | `var(--line)`, `var(--line-strong)` |
| Active / highlighted | `var(--accent)`, `var(--accent-strong)`, `var(--accent-text)` (for text) |
| Success / failure | `var(--good)`, `var(--bad)` |
| Info | `var(--info)` |

In SVG `<text>`, set fonts with `style={{ font: "600 15px var(--font-display)" }}` (also `--font-sans`, `--font-mono`).
Tailwind classes such as `text-ink`, `bg-surface-2`, `border-line` work for HTML elements.

## Motion and accessibility

- Call `useReducedMotion()`. When true, jump straight to end states (duration 0, no travelling dots, no loops).
- Prefer user-driven motion: steps, toggles, sliders. Avoid looping ambient animation.
- Every control is a real `<button>` with `aria-label`; support arrow keys for step-throughs.
- Put the current explanation in an `aria-live="polite"` region and give the `<svg>` `role="img"` with an `aria-label` describing the current state.
- Text in diagrams must meet WCAG AA contrast against its fill in both themes; `--muted` on `--surface` is the lightest allowed.

## Hydration pitfall: trigonometry

Visuals are server-rendered first. `Math.cos`/`Math.sin` can differ in the last bit between Node and the
browser, which makes SVG attributes mismatch and React logs a hydration error. Import the rounded
versions instead:

```ts
import { cos, sin } from "@/lib/trig";
```

Avoid `Math.random()` and `Date.now()` during render for the same reason; use them in effects or event handlers.
