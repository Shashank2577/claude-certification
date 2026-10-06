import type { ComponentType } from "react";

// Every visualId a lesson may reference (see CONTENT_SCHEMA.md → VISUAL REGISTRY).
// `load` is null until the component is built; the wrapper then shows a placeholder.

type Loader = () => Promise<{ default: ComponentType }>;

export interface VisualEntry {
  title: string;
  description: string;
  load: Loader | null;
}

export const VISUALS: Record<string, VisualEntry> = {
  "agentic-loop": {
    title: "The agentic loop",
    description: "Step through prompt → model → tool_use → tool_result until end_turn.",
    load: () => import("./agentic-loop"),
  },
  "orchestrator-subagents": {
    title: "Orchestrator and subagents",
    description: "A coordinator delegating to subagents with isolated context, results flowing back.",
    load: () => import("./orchestrator-subagents"),
  },
  "workflow-patterns": {
    title: "Workflow patterns",
    description: "Prompt chaining, routing, parallelization, orchestrator-workers and evaluator-optimizer.",
    load: () => import("./workflow-patterns"),
  },
  "mcp-architecture": {
    title: "MCP architecture",
    description: "Host, client and server; tools, resources and prompts; stdio versus HTTP.",
    load: () => import("./mcp-architecture"),
  },
  "tool-design": {
    title: "Tool design",
    description: "Good and bad tool definitions side by side, and how descriptions drive tool selection.",
    load: () => import("./tool-design"),
  },
  "claude-code-config": {
    title: "Claude Code configuration",
    description: "CLAUDE.md hierarchy, settings precedence, hooks, skills, slash commands and subagents.",
    load: () => import("./claude-code-config"),
  },
  "hooks-lifecycle": {
    title: "Hooks lifecycle",
    description: "When PreToolUse, PostToolUse, UserPromptSubmit, Stop and SessionStart fire, and what they can block.",
    load: () => import("./hooks-lifecycle"),
  },
  "context-window": {
    title: "Context window budget",
    description: "How system prompt, tools, history and documents fill the window, and what compaction and caching change.",
    load: () => import("./context-window"),
  },
  "prompt-caching": {
    title: "Prompt caching",
    description: "Cache prefix breakpoints and the cost and latency of hits versus misses.",
    load: () => import("./prompt-caching"),
  },
  "structured-output": {
    title: "Structured output",
    description: "JSON schemas, forced tool use and the validate-and-retry loop.",
    load: () => import("./structured-output"),
  },
  "prompt-anatomy": {
    title: "Anatomy of a prompt",
    description: "Role, context, XML tags, examples and output format, each toggleable.",
    load: () => import("./prompt-anatomy"),
  },
  "rag-pipeline": {
    title: "Retrieval pipeline",
    description: "Chunk, embed, retrieve, rerank, ground and cite.",
    load: () => import("./rag-pipeline"),
  },
  "escalation-hitl": {
    title: "Escalation and human review",
    description: "When an agent should hand off to a person, using confidence thresholds.",
    load: () => import("./escalation-hitl"),
  },
  "batch-vs-realtime": {
    title: "Batch versus real time",
    description: "Message Batches API against synchronous calls: the latency and cost trade-off.",
    load: () => import("./batch-vs-realtime"),
  },
  "error-recovery": {
    title: "Error recovery",
    description: "Retries, fallbacks, idempotency and partial failure in multi-agent systems.",
    load: () => import("./error-recovery"),
  },
  "eval-loop": {
    title: "The evaluation loop",
    description: "Test set, run, grade with code, a model or a person, then iterate.",
    load: () => import("./eval-loop"),
  },
  "security-guardrails": {
    title: "Security guardrails",
    description: "Permission modes, least-privilege tools and prompt-injection boundaries.",
    load: () => import("./security-guardrails"),
  },
  "exam-strategy": {
    title: "Exam strategy",
    description: "An elimination funnel for long scenario questions.",
    load: () => import("./exam-strategy"),
  },
  "model-selection": {
    title: "Choosing a model",
    description: "Score one task across Haiku, Sonnet and Opus, then see why the cheap model fails on the hard one.",
    load: () => import("./model-selection"),
  },
  "identity-and-pii": {
    title: "Identity, access and PII",
    description: "A request walked through classification, least privilege, redaction and injection defence, with what actually reaches the model.",
    load: () => import("./identity-and-pii"),
  },
  "deployment-topology": {
    title: "Deployment topology",
    description: "Self-hosted, managed and hybrid agent deployments, and where the sandbox boundary and the credentials sit in each.",
    load: () => import("./deployment-topology"),
  },
  "cost-model": {
    title: "Cost and latency model",
    description: "Turn request volume, token counts, cache hit rate and model tier into per-request cost and p50/p95 latency, then move the levers.",
    load: () => import("./cost-model"),
  },
  "capability-ladder": {
    title: "Capability ladder",
    description: "Prompt, Skill, built-in tool, custom tool, MCP server or subagent, and how an overloaded toolset degrades tool selection.",
    load: () => import("./capability-ladder"),
  },
  "requirements-traceability": {
    title: "Requirements traceability",
    description: "Turn a vague business ask into testable requirements, each traced to the eval case that proves it, and spot the ones with no proof.",
    load: () => import("./requirements-traceability"),
  },
  "bias-and-fairness": {
    title: "Bias and fairness",
    description: "Per-group pass rates when an overall accuracy bar hides a failing subgroup, plus what actually moves the numbers.",
    load: () => import("./bias-and-fairness"),
  },
  "stakeholder-tradeoff": {
    title: "Stakeholder trade-offs",
    description: "One architectural decision recorded properly, then reframed for an engineering manager, compliance and an executive.",
    load: () => import("./stakeholder-tradeoff"),
  },
};

export function visualInfo(id: string): VisualEntry | undefined {
  return VISUALS[id];
}
