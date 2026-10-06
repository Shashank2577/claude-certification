"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useHydratedReducedMotion } from "@/lib/use-reduced-motion";
import clsx from "clsx";
import { ChevronLeft, ChevronRight, Cloud, Laptop, RotateCcw } from "lucide-react";

type ServerId = "github" | "postgres" | "wiki";
type Prim = "tools" | "resources" | "prompts";
type Transport = "stdio" | "http";
type Scope = "local" | "project" | "user";
type Hop = "c2s" | "s2c" | "m2c" | "c2m";
type Rect = { x: number; y: number; w: number; h: number };

const SERVERS: Record<ServerId, { label: string; tools: string[]; resource: string; prompt: string; call: { name: string; desc: string; args: Record<string, string>; result: string } }> = {
  github: {
    label: "GitHub",
    tools: ["create_issue", "list_pull_requests"],
    resource: "repo://acme/app/README.md",
    prompt: "review-pr",
    call: { name: "create_issue", desc: "Create an issue in a repository", args: { title: "Login button misaligned" }, result: "Created issue #42" },
  },
  postgres: {
    label: "Postgres",
    tools: ["run_query", "describe_table"],
    resource: "postgres://schema",
    prompt: "explain-slow-query",
    call: { name: "run_query", desc: "Run a read-only SQL query", args: { sql: "SELECT count(*) FROM orders" }, result: "count = 1284" },
  },
  wiki: {
    label: "Team wiki",
    tools: ["search_wiki", "create_ticket"],
    resource: "wiki://page-tree",
    prompt: "weekly-incident-summary",
    call: { name: "search_wiki", desc: "Search wiki pages", args: { query: "on-call rota" }, result: "3 pages found" },
  },
};
const IDS = Object.keys(SERVERS) as ServerId[];

const PRIMS: Record<Prim, { name: string; who: string; color: string; what: string; methods: string; plain: string }> = {
  tools: {
    name: "Tools",
    who: "the model",
    color: "var(--accent-text)",
    what: "Actions Claude decides to invoke.",
    methods: "tools/list · tools/call",
    plain: "Claude picks a tool by itself when a task needs an action, like filing an issue. The host can still ask you to approve the call.",
  },
  resources: {
    name: "Resources",
    who: "the application",
    color: "var(--info)",
    what: "Readable data, identified by a URI, that the host app can list and attach as context.",
    methods: "resources/list · resources/read",
    plain: "The app decides what to attach. Showing a schema or page tree up front saves Claude from guessing with exploratory tool calls.",
  },
  prompts: {
    name: "Prompts",
    who: "the user",
    color: "var(--good)",
    what: "Reusable message templates that you choose to run.",
    methods: "prompts/list · prompts/get",
    plain: "Nothing happens until a person picks one. In Claude Code, MCP prompts show up as slash commands.",
  },
};

const SCOPES: Record<Scope, { file: string; short: string; who: string; plain: string }> = {
  local: { file: "~/.claude.json (this project's entry)", short: "~/.claude.json", who: "Only you, only this project", plain: "The default. Good for a personal or experimental server. Note: not .claude/settings.local.json." },
  project: { file: ".mcp.json at the repo root", short: ".mcp.json", who: "Your whole team, via git", plain: "Committed and shared. Keep secrets out with ${VAR} expansion. Claude Code asks you to approve project servers before using them." },
  user: { file: "~/.claude.json (top level)", short: "~/.claude.json", who: "Only you, in every project", plain: "For personal servers you want everywhere, like your own notes or calendar." },
};

/* Two diagram layouts: side-by-side when the figure is 42rem+ (@2xl), stacked below that (a 340-unit viewBox with 12.5-unit labels stays ~11px+ at 375px). */
type Pt = [number, number];
type Layout = {
  w: number; h: number; vertical: boolean;
  all: Rect; local: Rect; remote: Rect; allLabel: Pt; localLabel: Pt; remoteLabel: Pt;
  host: Rect; model: Rect; client: (i: number) => Rect; server: (i: number) => Rect;
};
const WIDE: Layout = {
  w: 640, h: 316, vertical: false,
  all: { x: 4, y: 4, w: 632, h: 308 }, local: { x: 4, y: 4, w: 286, h: 308 }, remote: { x: 418, y: 4, w: 218, h: 308 },
  allLabel: [628, 22], localLabel: [282, 22], remoteLabel: [628, 22],
  host: { x: 12, y: 30, w: 268, h: 276 }, model: { x: 28, y: 64, w: 100, h: 220 },
  client: (i) => ({ x: 150, y: 72 + 74 * i, w: 112, h: 48 }),
  server: (i) => ({ x: 440, y: 68 + 74 * i, w: 180, h: 56 }),
};
const NARROW: Layout = {
  w: 340, h: 338, vertical: true,
  all: { x: 4, y: 4, w: 332, h: 330 }, local: { x: 4, y: 4, w: 332, h: 214 }, remote: { x: 4, y: 241, w: 332, h: 93 },
  allLabel: [328, 20], localLabel: [328, 20], remoteLabel: [328, 255],
  host: { x: 12, y: 28, w: 316, h: 182 }, model: { x: 24, y: 60, w: 292, h: 44 },
  client: (i) => ({ x: 24 + 100 * i, y: 150, w: 92, h: 46 }),
  server: (i) => ({ x: 22 + 100 * i, y: 262, w: 96, h: 52 }),
};
const box = (r: Rect) => ({ x: r.x, y: r.y, width: r.w, height: r.h });

const pretty = (o: unknown) => JSON.stringify(o, null, 2);

function buildSteps(id: ServerId) {
  const s = SERVERS[id].call;
  const rpc = { jsonrpc: "2.0" };
  return [
    { hop: "c2s" as Hop, label: "initialize", caption: "The client opens a session and says which protocol version and features it supports.", body: { ...rpc, id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: { roots: {}, sampling: {} }, clientInfo: { name: "claude-code" } } } },
    { hop: "s2c" as Hop, label: "initialize result", caption: "The server replies with what it offers: tools, resources, prompts. The client confirms with notifications/initialized and the session is live.", body: { ...rpc, id: 1, result: { protocolVersion: "2025-06-18", capabilities: { tools: {}, resources: {}, prompts: {} }, serverInfo: { name: id } } } },
    { hop: "c2s" as Hop, label: "tools/list", caption: "The client asks the server which tools it has.", body: { ...rpc, id: 2, method: "tools/list" } },
    { hop: "s2c" as Hop, label: "tools/list result", caption: "Each tool arrives with a name, a description and an input schema. The host hands these to Claude as tool definitions.", body: { ...rpc, id: 2, result: { tools: [{ name: s.name, description: s.desc, inputSchema: { type: "object", properties: Object.fromEntries(Object.keys(s.args).map((k) => [k, { type: "string" }])) } }] } } },
    { hop: "m2c" as Hop, label: "Claude decides", caption: "Claude reads the task, picks the tool and fills in the arguments. That's what model-controlled means.", body: { type: "tool_use", id: "toolu_01", name: s.name, input: s.args } },
    { hop: "c2s" as Hop, label: "tools/call", caption: "The host routes the call through the one client that owns this server.", body: { ...rpc, id: 3, method: "tools/call", params: { name: s.name, arguments: s.args } } },
    { hop: "s2c" as Hop, label: "tools/call result", caption: "The server runs the tool and returns content. A failure would also come back as a result, marked isError: true, so Claude can see it and react.", body: { ...rpc, id: 3, result: { content: [{ type: "text", text: s.result }], isError: false } } },
    { hop: "c2m" as Hop, label: "back to Claude", caption: "The host gives Claude the output as a tool_result. It is data to reason about, not instructions to follow.", body: { type: "tool_result", tool_use_id: "toolu_01", content: s.result } },
  ];
}

function framing(t: Transport, hop: Hop, step: number) {
  if (hop === "m2c" || hop === "c2m") return "Inside the host. No transport involved.";
  if (t === "stdio") return hop === "c2s" ? "Written to the server's stdin as one line of JSON (no embedded newlines)." : "Read from the server's stdout. Logs must go to stderr, or they corrupt the stream.";
  if (hop === "c2s") return step === 0 ? "POST /mcp  ·  Accept: application/json, text/event-stream" : "POST /mcp  ·  Mcp-Session-Id and MCP-Protocol-Version headers attached";
  return step === 1 ? "HTTP response. The server may assign an Mcp-Session-Id here." : "Reply as a JSON body or as an SSE stream.";
}

export default function McpArchitecture() {
  const reduce = useHydratedReducedMotion();
  const [server, setServer] = useState<ServerId>("github");
  const [hover, setHover] = useState<ServerId | null>(null);
  const [prim, setPrim] = useState<Prim>("tools");
  const [transport, setTransport] = useState<Transport>("stdio");
  const [scope, setScope] = useState<Scope>("project");
  const [step, setStep] = useState(0);

  const steps = buildSteps(server);
  const cur = steps[step];
  const last = steps.length - 1;
  const S = SERVERS[server];
  const P = PRIMS[prim];
  const T = transport === "stdio";

  const next = () => setStep((s) => Math.min(last, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      next();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      back();
    }
  };
  const pick = (id: ServerId) => {
    setServer(id);
    setStep(0);
  };

  const config = T
    ? { type: "stdio", command: "npx", args: ["-y", `@example/${server}-mcp`], env: { API_TOKEN: "${API_TOKEN}" } }
    : { type: "http", url: `https://${server}.example.com/mcp`, headers: { Authorization: "Bearer ${API_TOKEN}" } };
  const cmd = `claude mcp add --transport ${T ? "stdio" : "http"} --scope ${scope} ${server} ${T ? `-- npx -y @example/${server}-mcp` : `https://${server}.example.com/mcp`}`;
  const diagram = { transport, server, lit: hover ?? server, hop: cur.hop, stepLabel: cur.label, stepKey: `${server}-${step}`, reduce: !!reduce, onHover: setHover, onPick: pick };

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex flex-col gap-3 @xl:flex-row @xl:items-center @xl:justify-between">
        <Segmented
          label="Transport"
          value={transport}
          onChange={(v) => setTransport(v as Transport)}
          options={[
            { v: "stdio", text: "stdio", icon: <Laptop size={14} /> },
            { v: "http", text: "Streamable HTTP", icon: <Cloud size={14} /> },
          ]}
        />
        <Segmented label="Server" value={server} onChange={(v) => pick(v as ServerId)} options={IDS.map((id) => ({ v: id, text: SERVERS[id].label }))} />
      </div>
      <p className="text-[0.95rem] text-ink-2" aria-live="polite">
        <span className="font-display font-semibold text-ink">{T ? "stdio: " : "Streamable HTTP: "}</span>
        {T
          ? "the host launches each server as a local subprocess on your machine and talks to it through stdin and stdout."
          : "each server listens at one HTTP endpoint, usually on a remote host, so a whole team can share it. The older HTTP+SSE transport is deprecated."}
      </p>

      {/* Side by side only when the figure is 48rem+; narrower, the diagram text would drop below ~11px. */}
      <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {/* Diagram: stacked layout on phones, side-by-side from sm up */}
        <div className="min-w-0 rounded-xl bg-surface-2/50 p-2">
          <div className="hidden @2xl:block"><Diagram L={WIDE} {...diagram} /></div>
          <div className="mx-auto max-w-[26rem] @2xl:hidden"><Diagram L={NARROW} {...diagram} /></div>
        </div>

        {/* Primitives */}
        <div className="flex min-w-0 flex-col rounded-xl border border-line bg-bg/60 p-3">
          <p className="px-1 text-xs font-medium text-muted">What the {S.label} server exposes</p>
          <div className="mt-2 grid grid-cols-3 gap-1.5" role="group" aria-label="Server primitives">
            {(Object.keys(PRIMS) as Prim[]).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={prim === k}
                aria-label={`${PRIMS[k].name}, controlled by ${PRIMS[k].who}`}
                onClick={() => setPrim(k)}
                className={clsx(
                  "rounded-lg border px-2 py-1.5 text-left transition-colors active:scale-[0.98]",
                  prim === k ? "border-ink bg-surface" : "border-line bg-transparent hover:border-line-strong",
                )}
              >
                <span className="block text-sm font-semibold text-ink">{PRIMS[k].name}</span>
                <span className="block text-xs" style={{ color: PRIMS[k].color }}>{PRIMS[k].who}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 flex-1" aria-live="polite">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${prim}-${server}`}
                initial={reduce ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0, y: -4 }}
                transition={{ duration: reduce ? 0 : 0.2 }}
                className="space-y-2.5"
              >
                <p className="text-sm text-ink">
                  <span className="font-semibold" style={{ color: P.color }}>Controlled by {P.who}.</span> {P.what}
                </p>
                <ul className="flex flex-wrap gap-1.5">
                  {(prim === "tools" ? S.tools : prim === "resources" ? [S.resource] : [`/mcp__${server}__${S.prompt}`]).map((t) => (
                    <li key={t} className="rounded-md border border-line bg-surface px-2 py-1 font-mono text-xs break-all text-ink">{t}</li>
                  ))}
                </ul>
                <p className="font-mono text-xs text-muted">{P.methods}</p>
                <p className="text-sm text-ink-2">{P.plain}</p>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* JSON-RPC flow */}
      <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]" onKeyDown={onKey}>
        <div className="flex min-w-0 flex-col justify-between gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-accent" tabIndex={0} role="group" aria-label="JSON-RPC message flow. Use left and right arrow keys to step.">
          <div>
            <p className="text-xs font-medium text-muted">JSON-RPC 2.0 on the wire · {S.label}</p>
            <ol className="mt-2 flex flex-wrap gap-1" aria-label="Messages">
              {steps.map((s, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => setStep(i)}
                    aria-label={`Step ${i + 1}: ${s.label}`}
                    aria-current={i === step ? "step" : undefined}
                    className={clsx(
                      "rounded-md border px-1.5 py-0.5 font-mono text-xs transition-colors",
                      i === step ? "border-accent-strong bg-accent-soft text-ink" : i < step ? "border-line text-ink-2" : "border-line text-muted",
                    )}
                  >
                    {s.label}
                  </button>
                </li>
              ))}
            </ol>
            <p className="mt-3 min-h-16 text-[0.95rem] text-ink-2" aria-live="polite">
              <span className="tabular mr-2 font-display font-semibold text-ink">{step + 1}/{steps.length}</span>
              {cur.caption}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <CtrlButton label="Previous message" onClick={back} disabled={step === 0}><ChevronLeft size={18} /></CtrlButton>
            <CtrlButton label="Next message" onClick={next} disabled={step === last}><ChevronRight size={18} /></CtrlButton>
            <CtrlButton label="Restart flow" onClick={() => setStep(0)}><RotateCcw size={16} /></CtrlButton>
          </div>
        </div>
        <div className="min-w-0 rounded-xl border border-line bg-bg/60 p-3">
          <span className="px-1 font-mono text-xs font-semibold text-accent-text">
            {cur.hop === "c2s" ? "client → server" : cur.hop === "s2c" ? "server → client" : cur.hop === "m2c" ? "Claude → client" : "client → Claude"}
          </span>
          <p className="mt-1 px-1 font-mono text-xs wrap-anywhere text-muted">{framing(transport, cur.hop, step)}</p>
          <AnimatePresence mode="wait" initial={false}>
            <motion.pre
              key={`${server}-${step}`}
              initial={reduce ? false : { opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduce ? undefined : { opacity: 0, x: -8 }}
              transition={{ duration: reduce ? 0 : 0.18 }}
              className="mt-2 max-h-56 overflow-auto rounded-lg border border-line bg-surface p-2.5 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap text-ink"
            >
              {pretty(cur.body)}
            </motion.pre>
          </AnimatePresence>
        </div>
      </div>

      {/* Claude Code scopes */}
      <div className="rounded-xl border border-line bg-bg/60 p-3">
        <div className="flex flex-col gap-2 @xl:flex-row @xl:items-center @xl:justify-between">
          <p className="px-1 text-xs font-medium text-muted">Where Claude Code stores this server</p>
          <Segmented label="Configuration scope" value={scope} onChange={(v) => setScope(v as Scope)} options={(["local", "project", "user"] as Scope[]).map((v) => ({ v, text: v }))} />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 @2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="min-w-0 space-y-1.5 px-1" aria-live="polite">
            <p className="font-mono text-sm wrap-anywhere text-ink">{SCOPES[scope].file}</p>
            <p className="text-sm font-semibold text-accent-text">{SCOPES[scope].who}</p>
            <p className="text-sm text-ink-2">{SCOPES[scope].plain}</p>
            <p className="text-xs text-muted">Same server name in several scopes? Local beats project, project beats user. Fields are not merged.</p>
          </div>
          <div className="min-w-0 space-y-2">
            <pre className="overflow-x-auto rounded-lg border border-line bg-surface p-2.5 font-mono text-xs break-all whitespace-pre-wrap text-ink">{cmd}</pre>
            <pre className="overflow-x-auto rounded-lg border border-line bg-surface p-2.5 font-mono text-xs leading-relaxed text-ink">
              <span className="text-muted">{`// ${SCOPES[scope].short}\n`}</span>
              {pretty({ mcpServers: { [server]: config } })}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

function Diagram({ L, transport, server, lit, hop, stepLabel, stepKey, reduce, onHover, onPick }: {
  L: Layout; transport: Transport; server: ServerId; lit: ServerId; hop: Hop; stepLabel: string; stepKey: string; reduce: boolean;
  onHover: (id: ServerId | null) => void; onPick: (id: ServerId) => void;
}) {
  const T = transport === "stdio";
  const V = L.vertical;
  const sel = IDS.indexOf(server);
  // Ports: where edges attach to each box (right/left edges when side by side, bottom/top edges when stacked).
  const modelOut = (c: Rect): Pt => (V ? [c.x + c.w / 2, L.model.y + L.model.h] : [L.model.x + L.model.w, c.y + c.h / 2]);
  const clientIn = (c: Rect): Pt => (V ? [c.x + c.w / 2, c.y] : [c.x, c.y + c.h / 2]);
  const clientOut = (c: Rect): Pt => (V ? [c.x + c.w / 2, c.y + c.h] : [c.x + c.w, c.y + c.h / 2]);
  const serverIn = (s: Rect): Pt => (V ? [s.x + s.w / 2, s.y] : [s.x, s.y + s.h / 2]);
  const C = L.client(sel);
  const Sv = L.server(sel);
  const pts: Record<Hop, [Pt, Pt]> = {
    c2s: [clientOut(C), serverIn(Sv)],
    s2c: [serverIn(Sv), clientOut(C)],
    m2c: [modelOut(C), clientIn(C)],
    c2m: [clientIn(C), modelOut(C)],
  };
  const [[x1, y1], [x2, y2]] = pts[hop];
  const inHost = hop === "m2c" || hop === "c2m";
  const fade = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: reduce ? 0 : 0.35 } };

  return (
    <svg viewBox={`0 0 ${L.w} ${L.h}`} className="h-auto w-full" role="img" aria-label={`Host Claude Code with three MCP clients, each connected one to one with a server over ${T ? "stdio" : "Streamable HTTP"}. Selected: ${SERVERS[server].label}. Message: ${stepLabel}.`}>
      <AnimatePresence initial={false}>
        {T ? (
          <motion.g key="local" {...fade}>
            <rect {...box(L.all)} rx={18} fill="none" stroke="var(--line-strong)" strokeDasharray="5 6" />
            <Label x={L.allLabel[0]} y={L.allLabel[1]} size={V ? 12.5 : 11} end>your machine · subprocesses</Label>
          </motion.g>
        ) : (
          <motion.g key="remote" {...fade}>
            <rect {...box(L.local)} rx={18} fill="none" stroke="var(--line-strong)" strokeDasharray="5 6" />
            <rect {...box(L.remote)} rx={18} fill="var(--info-soft)" fillOpacity={0.5} stroke="var(--info)" strokeDasharray="5 6" />
            <Label x={L.localLabel[0]} y={L.localLabel[1]} size={V ? 12.5 : 11} end>your machine</Label>
            <Label x={L.remoteLabel[0]} y={L.remoteLabel[1]} size={V ? 12.5 : 11} end>remote · HTTPS</Label>
          </motion.g>
        )}
      </AnimatePresence>

      {/* Host */}
      <rect {...box(L.host)} rx={16} fill="var(--surface)" stroke="var(--line-strong)" strokeWidth={1.25} />
      <text x={L.host.x + 14} y={L.host.y + 20} fill="var(--ink)" style={{ font: "600 13px var(--font-display)" }}>Host · Claude Code</text>
      <rect {...box(L.model)} rx={14} fill="var(--ink)" stroke={inHost ? "var(--accent-strong)" : "none"} strokeWidth={2.5} />
      <text x={L.model.x + L.model.w / 2} y={L.model.y + L.model.h / 2 - 3} textAnchor="middle" fill="var(--bg)" style={{ font: "600 16px var(--font-display)" }}>Claude</text>
      <text x={L.model.x + L.model.w / 2} y={L.model.y + L.model.h / 2 + 14} textAnchor="middle" fill="var(--line)" style={{ font: `400 ${V ? 13.5 : 12}px var(--font-sans)` }}>the model</text>

      {IDS.map((id, i) => {
        const on = id === lit;
        const c = L.client(i);
        const s = L.server(i);
        const [m0, m1] = modelOut(c);
        const [ax, ay] = clientIn(c);
        const [bx, by] = clientOut(c);
        const [sx, sy] = serverIn(s);
        const mx = (bx + sx) / 2;
        const my = (by + sy) / 2;
        return (
          <g key={id} onMouseEnter={() => onHover(id)} onMouseLeave={() => onHover(null)} onClick={() => onPick(id)} style={{ cursor: "pointer" }}>
            <line x1={m0} y1={m1} x2={ax} y2={ay} stroke="var(--line-strong)" strokeWidth={1} />
            <line x1={bx} y1={by} x2={sx} y2={sy} stroke={on ? "var(--accent-strong)" : "var(--line-strong)"} strokeWidth={on ? 2.5 : 1.25} strokeDasharray={T ? undefined : "6 4"} style={{ transition: "stroke 200ms ease" }} />
            {on ? (
              <g>
                {V ? <rect x={mx - 58} y={my - 10} width={116} height={20} rx={6} fill="var(--surface)" /> : null}
                <text x={mx} y={V ? my + 4.5 : my - 8} textAnchor="middle" fill="var(--ink-2)" style={{ font: `500 ${V ? 12.5 : 11}px var(--font-mono)` }}>
                  {T ? "stdin ⇄ stdout" : "POST /mcp"}
                </text>
              </g>
            ) : null}
            <rect {...box(c)} rx={12} fill="var(--surface-2)" stroke={on ? "var(--accent-strong)" : "var(--line-strong)"} strokeWidth={on ? 2 : 1} />
            <text x={c.x + c.w / 2} y={c.y + c.h / 2 - 3} textAnchor="middle" fill="var(--ink)" style={{ font: "600 13px var(--font-display)" }}>Client</text>
            <text x={c.x + c.w / 2} y={c.y + c.h / 2 + 14} textAnchor="middle" fill="var(--ink-2)" style={{ font: `400 ${V ? 12.5 : 11}px var(--font-sans)` }}>
              {V ? "1:1" : `1:1 with ${SERVERS[id].label}`}
            </text>
            <rect {...box(s)} rx={14} fill="var(--surface)" stroke={on ? "var(--accent-strong)" : "var(--line-strong)"} strokeWidth={on ? 2.5 : 1.25} />
            <text x={s.x + s.w / 2} y={s.y + 23} textAnchor="middle" fill="var(--ink)" style={{ font: "600 14px var(--font-display)" }}>{SERVERS[id].label}{V ? "" : " server"}</text>
            <text x={s.x + s.w / 2} y={s.y + 42} textAnchor="middle" fill="var(--ink-2)" style={{ font: `400 ${V ? 12.5 : 11}px var(--font-mono)` }}>
              {T ? (V ? "subprocess" : "local subprocess") : V ? "HTTP /mcp" : `${id}.example.com/mcp`}
            </text>
          </g>
        );
      })}
      {T ? (
        <text x={Sv.x + Sv.w / 2} y={Sv.y + Sv.h + 13} textAnchor="middle" fill="var(--ink-2)" style={{ font: `500 ${V ? 12.5 : 11}px var(--font-mono)` }}>logs → stderr only</text>
      ) : null}

      <motion.circle
        key={stepKey}
        r={7}
        fill="var(--accent)"
        stroke="var(--accent-ink)"
        strokeWidth={1.5}
        initial={reduce ? { cx: x2, cy: y2 } : { cx: x1, cy: y1, opacity: 0 }}
        animate={{ cx: x2, cy: y2, opacity: 1 }}
        transition={{ duration: reduce ? 0 : 0.8, ease: [0.22, 1, 0.36, 1] }}
      />
    </svg>
  );
}

function Label({ x, y, end, size, children }: { x: number; y: number; end?: boolean; size: number; children: ReactNode }) {
  return (
    <text x={x} y={y} textAnchor={end ? "end" : "start"} fill="var(--ink-2)" style={{ font: `500 ${size}px var(--font-mono)` }}>
      {children}
    </text>
  );
}

function Segmented({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { v: string; text: string; icon?: ReactNode }[] }) {
  const reduce = useHydratedReducedMotion();
  return (
    <div role="group" aria-label={label} className="inline-flex w-fit flex-wrap gap-0.5 rounded-xl border border-line-strong bg-surface p-0.5">
      {options.map((o) => {
        const on = o.v === value;
        return (
          <button
            key={o.v}
            type="button"
            aria-pressed={on}
            aria-label={`${label}: ${o.text}`}
            onClick={() => onChange(o.v)}
            className={clsx("relative flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-sm font-medium transition-colors", on ? "text-accent-ink" : "text-ink-2 hover:text-ink")}
          >
            {on ? <motion.span layoutId={`mcp-seg-${label}`} className="absolute inset-0 rounded-[10px] bg-accent" transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 38 }} /> : null}
            <span className="relative flex items-center gap-1.5">
              {o.icon}
              {o.text}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function CtrlButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid size-9 place-items-center rounded-xl border border-line-strong bg-surface text-ink transition-colors hover:border-ink active:scale-95 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
