"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import clsx from "clsx";
import { ChevronLeft, ChevronRight, Crown, FileCode, FileText, Folder, GitBranch, Lock, User } from "lucide-react";

const EASE = [0.22, 1, 0.36, 1] as const;

/* ---------- Tab 1: CLAUDE.md files ---------- */

type FileId = "managed" | "user" | "project" | "local" | "style" | "testing" | "sub";
type Row = { depth: number; name: string; id?: FileId; hint?: string; trigger?: number };

const TREE: Row[] = [
  { depth: 0, name: "/Library/Application Support/ClaudeCode/", hint: "set by IT" },
  { depth: 1, name: "CLAUDE.md", id: "managed" },
  { depth: 0, name: "~/.claude/", hint: "your home folder" },
  { depth: 1, name: "CLAUDE.md", id: "user" },
  { depth: 0, name: "my-app/", hint: "you launch claude here" },
  { depth: 1, name: "CLAUDE.md", id: "project" },
  { depth: 1, name: "CLAUDE.local.md", id: "local" },
  { depth: 1, name: ".claude/rules/" },
  { depth: 2, name: "style.md", id: "style" },
  { depth: 2, name: "testing.md", id: "testing" },
  { depth: 1, name: "src/" },
  { depth: 2, name: "Button.test.tsx", trigger: 1 },
  { depth: 1, name: "packages/api/" },
  { depth: 2, name: "CLAUDE.md", id: "sub" },
  { depth: 2, name: "routes.ts", trigger: 2 },
];

const FILES: Record<FileId, { label: string; who: string; shared: boolean; sharing: string; when: string; note: string; code?: string }> = {
  managed: { label: "Managed policy", who: "Everyone on machines where IT deploys it", shared: true, sharing: "Deployed by IT, not via git", when: "Every session, at launch", note: "Org-wide rules. Individuals cannot exclude it. Linux/WSL: /etc/claude-code/, Windows: C:\\Program Files\\ClaudeCode\\." },
  user: { label: "User memory", who: "Only you, in every project", shared: false, sharing: "Personal: home folder, never in git", when: "Every session, at launch", note: "Classic trap: a team rule put here never reaches a new teammate. Move it to the project CLAUDE.md." },
  project: { label: "Project memory", who: "Everyone who clones the repo", shared: true, sharing: "Shared: committed to git", when: "Every session, at launch", note: "Can also live at ./.claude/CLAUDE.md. Re-read from disk after /compact, so it survives compaction." },
  local: { label: "Local memory", who: "Only you, only this project", shared: false, sharing: "Personal: add it to .gitignore", when: "At launch, appended after CLAUDE.md in the same folder", note: "For your own sandbox URLs or test data that teammates don't need." },
  style: { label: "Rule, no paths", who: "Everyone who clones the repo", shared: true, sharing: "Shared: committed to git", when: "Every session, at launch (same priority as .claude/CLAUDE.md)", note: "A rule file without paths frontmatter is always loaded. It just keeps big instructions modular.", code: "# Code style\n- Prefer named exports" },
  testing: { label: "Path-scoped rule", who: "Everyone who clones the repo", shared: true, sharing: "Shared: committed to git", when: "Only when Claude reads a file matching the glob", note: "Best for conventions scattered across folders, like test files sitting next to source. A per-folder CLAUDE.md can't do that.", code: '---\npaths: ["**/*.test.tsx"]\n---\n# Testing rules' },
  sub: { label: "Subdirectory memory", who: "Everyone who clones the repo", shared: true, sharing: "Shared: committed to git", when: "On demand, when Claude reads files in packages/api/", note: "Folders below where you launched are lazy-loaded. Only the launch folder and its parents load at start." },
};

const ORDER: FileId[] = ["managed", "user", "project", "style", "local", "testing", "sub"];

const MOMENTS: { event: string; loaded: FileId[]; caption: string }[] = [
  { event: "$ cd my-app && claude", loaded: ["managed", "user", "project", "style", "local"], caption: "Session starts. Claude loads the managed policy, your user file, every CLAUDE.md from the launch folder up to the root, CLAUDE.local.md, and rules with no paths. They stack together; none replaces another." },
  { event: "Claude reads src/Button.test.tsx", loaded: ["managed", "user", "project", "style", "local", "testing"], caption: "The file matches **/*.test.tsx, so testing.md joins the context now. It stayed out until it was relevant." },
  { event: "Claude reads packages/api/routes.ts", loaded: ORDER, caption: "Claude touched a file inside packages/api/, so that folder's CLAUDE.md loads on demand and is added to the stack." },
];

function MemoryTab({ reduce }: { reduce: boolean }) {
  const [moment, setMoment] = useState(0);
  const [sel, setSel] = useState<FileId>("project");
  const loaded = MOMENTS[moment].loaded;
  const f = FILES[sel];
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") { e.preventDefault(); setMoment((m) => Math.min(2, m + 1)); }
    if (e.key === "ArrowLeft") { e.preventDefault(); setMoment((m) => Math.max(0, m - 1)); }
  };
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-xl bg-surface-2/50 p-3" role="group" aria-label="CLAUDE.md file tree. Click a file for details.">
          <ul className="space-y-0.5 font-mono text-xs sm:text-[12.5px]">
            {TREE.map((r, i) => {
              const on = r.id ? loaded.includes(r.id) : false;
              const hot = r.trigger !== undefined && r.trigger === moment;
              return (
                <li key={i} style={{ paddingLeft: r.depth * 16 }}>
                  {r.id ? (
                    <button
                      type="button"
                      onClick={() => setSel(r.id!)}
                      aria-label={`${r.name}, ${FILES[r.id].label}${on ? ", in context" : ", not loaded yet"}`}
                      aria-pressed={sel === r.id}
                      className={clsx("relative flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors", sel === r.id ? "text-ink" : "text-ink-2 hover:bg-surface")}
                    >
                      {sel === r.id && <motion.span layoutId="ccc-sel" className="absolute inset-0 rounded-lg border border-accent-strong bg-surface" transition={{ duration: reduce ? 0 : 0.3, ease: EASE }} />}
                      <motion.span
                        className={clsx("relative size-2.5 shrink-0 rounded-full border-2 transition-colors", on ? "border-accent-strong bg-accent" : "border-line-strong bg-transparent")}
                        animate={{ scale: on ? [1.7, 1] : 1 }}
                        transition={{ duration: reduce ? 0 : 0.45, ease: EASE }}
                      />
                      <FileText size={14} className="relative shrink-0 text-muted" />
                      <span className="relative truncate">{r.name}</span>
                      <span className="relative ml-auto hidden shrink-0 font-sans text-xs text-muted sm:inline">{FILES[r.id].label}</span>
                    </button>
                  ) : r.trigger !== undefined ? (
                    <div className={clsx("flex items-center gap-2 rounded-lg px-2 py-1 transition-colors", hot ? "bg-accent-soft text-ink" : "text-muted")} aria-current={hot ? "step" : undefined}>
                      <span className="size-2.5 shrink-0" />
                      <FileCode size={14} className="shrink-0" />
                      <span className="truncate">{r.name}</span>
                      {hot && <span className="ml-auto shrink-0 font-sans text-xs font-medium text-accent-text">Claude reads this</span>}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 px-2 py-1 text-muted">
                      <Folder size={14} className="shrink-0" />
                      <span className="truncate font-semibold text-ink-2">{r.name}</span>
                      {r.hint && <span className="ml-auto shrink-0 font-sans text-xs italic">{r.hint}</span>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={sel}
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -4 }}
            transition={{ duration: reduce ? 0 : 0.22 }}
            className="flex flex-col gap-3 rounded-xl border border-line bg-bg/60 p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-display text-lg font-semibold text-ink">{f.label}</p>
              <Badge tone={f.shared ? "info" : "good"}>{f.shared ? <GitBranch size={12} /> : <User size={12} />}{f.shared ? "Shared" : "Personal"}</Badge>
            </div>
            <Fact k="Who it affects" v={f.who} />
            <Fact k="How it travels" v={f.sharing} />
            <Fact k="When it loads" v={f.when} />
            {f.code && <pre className="rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs whitespace-pre-wrap text-ink-2">{f.code}</pre>}
            <p className="text-sm text-ink-2">{f.note}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-2">
          <div className="flex items-center gap-2" role="group" aria-label="Session moments. Use the left and right arrow keys to step." tabIndex={0} onKeyDown={onKey}>
            <Ctrl label="Previous moment" onClick={() => setMoment((m) => Math.max(0, m - 1))} disabled={moment === 0}><ChevronLeft size={18} /></Ctrl>
            <div className="flex-1 truncate rounded-xl border border-line bg-surface px-3 py-2 font-mono text-xs text-ink">{MOMENTS[moment].event}</div>
            <Ctrl label="Next moment" onClick={() => setMoment((m) => Math.min(2, m + 1))} disabled={moment === 2}><ChevronRight size={18} /></Ctrl>
          </div>
          <p className="min-h-16 text-[0.95rem] text-ink-2" aria-live="polite">
            <span className="mr-2 font-display font-semibold text-ink tabular">{moment + 1}/3</span>
            {MOMENTS[moment].caption}
          </p>
        </div>
        <div className="rounded-xl border border-line bg-bg/60 p-3">
          <p className="px-1 text-xs font-medium text-muted">Claude&apos;s context: stacked, broadest first</p>
          <ol className="mt-2 space-y-1">
            <AnimatePresence initial={false}>
              {ORDER.filter((id) => loaded.includes(id)).map((id) => (
                <motion.li
                  key={id}
                  layout={!reduce}
                  initial={reduce ? false : { opacity: 0, x: 16, backgroundColor: "var(--accent-soft)" }}
                  animate={{ opacity: 1, x: 0, backgroundColor: "var(--surface)" }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduce ? 0 : 0.5, ease: EASE }}
                  className="flex items-center justify-between rounded-md border border-line px-2.5 py-1 text-xs"
                >
                  <span className="text-ink">{FILES[id].label}</span>
                  <span className="font-mono text-xs text-muted">{id === "testing" || id === "sub" ? "on demand" : "launch"}</span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
        </div>
      </div>
    </div>
  );
}

/* ---------- Tab 2: settings precedence ---------- */

type Mode = "scalar" | "list";
const RUNGS = [
  { id: "managed", label: "Managed settings", file: "managed-settings.json", who: "Set by IT for the whole org", model: "sonnet", allow: "WebFetch(domain:docs.acme.dev)" },
  { id: "cli", label: "Command line", file: "claude --model opus", listFile: 'claude --allowedTools "Read(./logs/**)"', who: "This one session only", model: "opus", allow: "Read(./logs/**)" },
  { id: "local", label: "Local project", file: ".claude/settings.local.json", who: "Only you, this repo (gitignored)", model: "haiku", allow: "Bash(npm run dev)" },
  { id: "project", label: "Shared project", file: ".claude/settings.json", who: "Whole team, committed to git", model: "sonnet", allow: "Bash(npm test)" },
  { id: "user", label: "User", file: "~/.claude/settings.json", who: "Only you, every project", model: "opus", allow: "Bash(git status)" },
];

function SettingsTab({ reduce }: { reduce: boolean }) {
  const [mode, setMode] = useState<Mode>("scalar");
  const [on, setOn] = useState<Record<string, boolean>>({ managed: false, cli: false, local: true, project: true, user: true });
  const active = RUNGS.filter((r) => on[r.id]);
  const winner = active[0];
  const caption = !active.length
    ? "No file sets this key, so Claude Code falls back to its built-in default."
    : mode === "scalar"
      ? `${winner.label} wins: it sets model to "${winner.model}". ${active.length > 1 ? `The ${active.length - 1} lower value${active.length > 2 ? "s are" : " is"} ignored for this key.` : ""} Higher on the ladder always beats lower.`
      : `Lists merge: all ${active.length} allow rule${active.length > 1 ? "s" : ""} apply together. Nothing is overridden. (A deny rule anywhere still beats an allow.)`;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Key type" onKeyDown={(e) => radioKeys(e, ["scalar", "list"] as Mode[], mode, setMode)}>
        {(["scalar", "list"] as Mode[]).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} tabIndex={mode === m ? 0 : -1} onClick={() => setMode(m)} className={clsx("rounded-full border px-3 py-1.5 text-sm transition-colors", mode === m ? "border-accent-strong bg-accent-soft text-ink" : "border-line-strong bg-surface text-ink-2 hover:border-ink")}>
            {m === "scalar" ? 'Single value: "model"' : 'List: "permissions.allow"'}
          </button>
        ))}
        <span className="text-xs text-muted">Tap a step to make that file set the key.</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <ol className="space-y-2" aria-label="Settings precedence, highest first">
          {RUNGS.map((r, i) => {
            const isOn = on[r.id];
            const wins = mode === "scalar" && winner?.id === r.id;
            const lost = mode === "scalar" && isOn && !wins;
            const file = mode === "list" && r.listFile ? r.listFile : r.file;
            return (
              <li key={r.id} style={{ marginLeft: `${i * 3}%` }}>
                <button
                  type="button"
                  aria-pressed={isOn}
                  aria-label={`${r.label}, ${file}. ${isOn ? "Sets the key" : "Does not set the key"}${wins ? ", winning value" : ""}`}
                  onClick={() => setOn((s) => ({ ...s, [r.id]: !s[r.id] }))}
                  className={clsx("relative flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors", isOn ? "border-line-strong bg-surface" : "border-dashed border-line bg-transparent hover:border-line-strong")}
                >
                  {wins && <motion.span layoutId="ccc-win" className="absolute inset-0 rounded-xl border-2 border-accent-strong" transition={{ duration: reduce ? 0 : 0.35, ease: EASE }} />}
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ink font-display text-xs font-semibold text-bg tabular">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">{r.label}{r.id === "managed" && <Lock size={12} className="text-muted" aria-label="cannot be overridden" />}</span>
                    <span className="block truncate font-mono text-xs text-muted">{file}</span>
                    <span className="block text-xs text-ink-2">{r.who}</span>
                  </span>
                  <span className={clsx("max-w-[42%] min-w-0 rounded-md px-2 py-1 text-right font-mono text-xs break-all", !isOn ? "text-muted" : wins ? "bg-accent-soft text-accent-text" : lost ? "text-muted line-through" : "bg-good-soft text-good")}>
                    {isOn ? (mode === "scalar" ? `"${r.model}"` : `+ ${r.allow}`) : "not set"}
                  </span>
                  {wins && <Crown size={16} className="relative shrink-0 text-accent-text" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ol>

        <div className="flex flex-col rounded-xl border border-line bg-bg/60 p-4">
          <p className="text-xs font-medium text-muted">What Claude Code actually uses</p>
          <pre className="mt-2 flex-1 overflow-x-auto rounded-lg border border-line bg-surface p-3 font-mono text-xs text-ink">
            {mode === "scalar" ? (
              <>{"{\n  \"model\": "}<motion.span key={winner?.id ?? "none"} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} className="text-accent-text">{winner ? `"${winner.model}"` : "(default)"}</motion.span>{"\n}"}</>
            ) : (
              <>{"{\n  \"permissions\": {\n    \"allow\": [\n"}
                <AnimatePresence initial={false}>
                  {active.map((r) => (
                    <motion.span key={r.id} className="block text-good" initial={reduce ? false : { opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.25 }}>{`      "${r.allow}",`}</motion.span>
                  ))}
                </AnimatePresence>
                {"    ]\n  }\n}"}</>
            )}
          </pre>
          <p className="mt-3 text-xs text-ink-2">Managed sits on top and can&apos;t be overridden (a few security keys still honour a stricter value from lower down). Environment variables are not a step on this ladder.</p>
        </div>
      </div>
      <p className="min-h-12 text-[0.95rem] text-ink-2" aria-live="polite">{caption}</p>
    </div>
  );
}

/* ---------- Tab 3: where things live ---------- */

const KINDS = [
  { id: "skills", label: "Skills", team: ".claude/skills/<name>/SKILL.md", me: "~/.claude/skills/<name>/SKILL.md", plain: "Saved procedures. Only the name and description sit in context; the full SKILL.md loads when you type /name or Claude decides it's relevant.", gotcha: "Same name in both places: personal beats project (enterprise beats both)." },
  { id: "commands", label: "Slash commands", team: ".claude/commands/<name>.md", me: "~/.claude/commands/<name>.md", plain: "A markdown file whose text becomes the prompt when you type /name. Commands are now merged into skills; both forms create /name.", gotcha: "A team /review belongs in the repo's .claude/commands/, not your home folder." },
  { id: "agents", label: "Subagents", team: ".claude/agents/<name>.md", me: "~/.claude/agents/<name>.md", plain: "Helpers with their own fresh context and tool list. They don't see your conversation, so pass what they need in the task prompt.", gotcha: "Same name: project beats user." },
  { id: "hooks", label: "Hooks", team: '.claude/settings.json → "hooks"', me: '~/.claude/settings.json → "hooks"', plain: "Scripts that run at set moments (e.g. PreToolUse, PostToolUse). They run every time, so they enforce rules; CLAUDE.md only advises.", gotcha: "Exit code 2 from a PreToolUse hook blocks the tool call. Exit code 1 does not." },
  { id: "mcp", label: "MCP servers", team: ".mcp.json (repo root, project scope)", me: "~/.claude.json (user scope)", plain: "Connections to outside tools and data. Team servers go in .mcp.json; personal or experimental ones stay in ~/.claude.json.", gotcha: "Keep secrets out of git with ${VAR}. The default 'local' scope is also stored in ~/.claude.json, not in settings.local.json." },
];

function PlacesTab({ reduce }: { reduce: boolean }) {
  const [sel, setSel] = useState(KINDS[0].id);
  const k = KINDS.find((x) => x.id === sel)!;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Choose a feature" onKeyDown={(e) => radioKeys(e, KINDS.map((x) => x.id), sel, setSel)}>
        {KINDS.map((x) => (
          <button key={x.id} type="button" role="radio" aria-checked={sel === x.id} tabIndex={sel === x.id ? 0 : -1} onClick={() => setSel(x.id)} className={clsx("relative rounded-full px-3 py-1.5 text-sm transition-colors", sel === x.id ? "text-accent-ink" : "text-ink-2 hover:text-ink")}>
            {sel === x.id && <motion.span layoutId="ccc-kind" className="absolute inset-0 rounded-full bg-accent" transition={{ duration: reduce ? 0 : 0.3, ease: EASE }} />}
            <span className="relative">{x.label}</span>
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {([["team", "Team", "In the repo, committed to git. Everyone who clones gets it.", GitBranch, "info"], ["me", "Just you", "In your home folder. Follows you to every project, reaches no one else.", User, "good"]] as const).map(([key, title, desc, Icon, tone]) => (
          <div key={key} className="rounded-xl border border-line bg-surface-2/50 p-4">
            <div className="flex items-center gap-2"><Badge tone={tone}><Icon size={12} />{title}</Badge></div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.p key={sel} initial={reduce ? false : { opacity: 0, y: 6, filter: "blur(3px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={reduce ? undefined : { opacity: 0, y: -6 }} transition={{ duration: reduce ? 0 : 0.25 }} className="mt-3 rounded-lg border border-line bg-surface px-3 py-2.5 font-mono text-xs break-all text-ink sm:text-[12.5px]">
                {k[key]}
              </motion.p>
            </AnimatePresence>
            <p className="mt-2 text-xs text-muted">{desc}</p>
          </div>
        ))}
      </div>
      <div aria-live="polite" className="space-y-1">
        <p className="text-[0.95rem] text-ink-2"><span className="mr-2 font-display font-semibold text-ink">{k.label}.</span>{k.plain}</p>
        <p className="text-sm text-accent-text">Exam tip: {k.gotcha}</p>
      </div>
    </div>
  );
}

/* ---------- Shell ---------- */

const TABS = [
  { id: "memory", label: "CLAUDE.md files" },
  { id: "settings", label: "Settings precedence" },
  { id: "places", label: "Skills, agents, hooks" },
] as const;

export default function ClaudeCodeConfig() {
  const reduce = !!useReducedMotion();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("memory");
  const onTabKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    e.stopPropagation();
    const n = TABS[(i + d + TABS.length) % TABS.length].id;
    setTab(n);
    document.getElementById(`ccc-tab-${n}`)?.focus();
  };
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Claude Code configuration views" className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface-2/50 p-1">
        {TABS.map((t, i) => (
          <button key={t.id} id={`ccc-tab-${t.id}`} type="button" role="tab" aria-selected={tab === t.id} aria-controls="ccc-panel" tabIndex={tab === t.id ? 0 : -1} onKeyDown={(e) => onTabKey(e, i)} onClick={() => setTab(t.id)} className={clsx("relative flex-1 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors", tab === t.id ? "font-semibold text-ink" : "text-ink-2 hover:text-ink")}>
            {tab === t.id && <motion.span layoutId="ccc-tab" className="absolute inset-0 rounded-lg bg-surface shadow-[var(--shadow)]" transition={{ duration: reduce ? 0 : 0.3, ease: EASE }} />}
            <span className="relative">{t.label}</span>
          </button>
        ))}
      </div>
      <div id="ccc-panel" role="tabpanel" aria-labelledby={`ccc-tab-${tab}`}>
        {tab === "memory" && <MemoryTab reduce={reduce} />}
        {tab === "settings" && <SettingsTab reduce={reduce} />}
        {tab === "places" && <PlacesTab reduce={reduce} />}
      </div>
    </div>
  );
}

/* Arrow-key support for role="radiogroup" pill selectors (roving focus). */
function radioKeys<T extends string>(e: KeyboardEvent, ids: readonly T[], cur: T, set: (v: T) => void) {
  const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
  if (!d) return;
  e.preventDefault();
  e.stopPropagation();
  const next = ids[(ids.indexOf(cur) + d + ids.length) % ids.length];
  set(next);
  const btns = (e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="radio"]');
  btns[ids.indexOf(next)]?.focus();
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <p className="text-xs font-medium tracking-wide text-muted uppercase">{k}</p>
      <p className="text-sm text-ink">{v}</p>
    </div>
  );
}

function Badge({ tone, children }: { tone: "info" | "good"; children: ReactNode }) {
  return <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", tone === "info" ? "bg-info-soft text-info" : "bg-good-soft text-good")}>{children}</span>;
}

function Ctrl({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} className="grid size-9 shrink-0 place-items-center rounded-xl border border-line-strong bg-surface text-ink transition-colors hover:border-ink active:scale-95 disabled:opacity-40">
      {children}
    </button>
  );
}
