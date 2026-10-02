"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { clsx } from "clsx";
import { Check, Clock, ExternalLink, Library } from "lucide-react";
import type { Resource } from "@/lib/content-types";
import { toggleResourceDone } from "@/app/actions/resources";
import { useCelebrate } from "@/components/celebrate";
import { EmptyState, Pill } from "@/components/ui/card";

const PRIORITY_LABEL: Record<Resource["priority"], string> = { must: "Must read", should: "Should read", nice: "Nice to have" };
const PRIORITY_ORDER: Record<Resource["priority"], number> = { must: 0, should: 1, nice: 2 };

export function ResourcesPanel({ resources, domains, initialDone }: { resources: Resource[]; domains: { id: string; name: string }[]; initialDone: string[] }) {
  const [type, setType] = useState("all");
  const [domain, setDomain] = useState("all");
  const [priority, setPriority] = useState("all");
  const [hideDone, setHideDone] = useState(false);
  const [done, setDone] = useState(() => new Set(initialDone));
  const [optimisticDone, setOptimisticDone] = useOptimistic(done);
  const [, start] = useTransition();
  const { celebrate } = useCelebrate();

  const types = useMemo(() => [...new Set(resources.map((r) => r.type))].sort(), [resources]);
  const list = resources
    .filter((r) => type === "all" || r.type === type)
    .filter((r) => domain === "all" || r.domainIds.includes(domain))
    .filter((r) => priority === "all" || r.priority === priority)
    .filter((r) => !hideDone || !optimisticDone.has(r.id))
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.title.localeCompare(b.title));

  const doneCount = resources.filter((r) => optimisticDone.has(r.id)).length;

  const toggle = (id: string) => {
    const next = !optimisticDone.has(id);
    start(async () => {
      const s = new Set(optimisticDone);
      if (next) s.add(id);
      else s.delete(id);
      setOptimisticDone(s);
      const reward = await toggleResourceDone(id, next);
      setDone(s);
      if (reward) celebrate(reward);
    });
  };

  if (resources.length === 0) {
    return <EmptyState icon={<Library size={26} />} title="No resources yet" body="Curated reading will appear here once it's added to the content folder." />;
  }

  return (
    <div>
      <div className="flex flex-col gap-3 rounded-2xl bg-surface-2/70 p-4 sm:flex-row sm:flex-wrap sm:items-end">
        <Select label="Type" value={type} onChange={setType} options={[["all", "All types"], ...types.map((t) => [t, t[0].toUpperCase() + t.slice(1)] as [string, string])]} />
        <Select label="Domain" value={domain} onChange={setDomain} options={[["all", "All domains"], ...domains.map((d) => [d.id, d.name] as [string, string])]} />
        <Select
          label="Priority"
          value={priority}
          onChange={setPriority}
          options={[
            ["all", "Any priority"],
            ["must", "Must read"],
            ["should", "Should read"],
            ["nice", "Nice to have"],
          ]}
        />
        <label className="flex h-10 items-center gap-2 text-sm text-ink-2 sm:ml-auto">
          <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} className="size-4 accent-[var(--ink)]" />
          Hide finished
        </label>
      </div>
      <p className="mt-3 text-sm text-muted tabular" aria-live="polite">
        Showing {list.length} of {resources.length}. {doneCount} finished.
      </p>

      {list.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-line-strong p-8 text-center text-ink-2">Nothing matches these filters. Try widening them.</p>
      ) : (
        <ul className="mt-3 grid gap-2">
          <AnimatePresence initial={false}>
            {list.map((r) => {
              const isDone = optimisticDone.has(r.id);
              return (
                <motion.li
                  key={r.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className={clsx("flex gap-3 rounded-2xl border bg-surface p-4 transition-colors", isDone ? "border-line" : "border-line shadow-card")}
                >
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={isDone}
                    aria-label={`Mark ${r.title} as ${isDone ? "not done" : "done"}`}
                    onClick={() => toggle(r.id)}
                    className={clsx(
                      "mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg border transition-colors",
                      isDone ? "border-good bg-good text-white" : "border-line-strong hover:border-ink",
                    )}
                  >
                    {isDone ? (
                      <motion.span initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 20 }}>
                        <Check size={14} strokeWidth={3} />
                      </motion.span>
                    ) : null}
                  </button>
                  <div className="min-w-0 flex-1">
                    <a href={r.url} target="_blank" rel="noreferrer" className={clsx("font-medium hover:underline hover:underline-offset-4", isDone && "text-ink-2 line-through decoration-line-strong")}>
                      {r.title}
                      <ExternalLink size={13} className="ml-1 inline align-baseline text-muted" aria-hidden />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                    {r.description ? <p className="mt-1 text-sm text-ink-2">{r.description}</p> : null}
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                      <Pill tone={r.priority === "must" ? "accent" : "neutral"}>{PRIORITY_LABEL[r.priority]}</Pill>
                      <span className="capitalize">{r.type}</span>
                      {r.estMinutes ? (
                        <span className="inline-flex items-center gap-1 tabular">
                          <Clock size={12} /> {r.estMinutes} min
                        </span>
                      ) : null}
                      {r.verified === false ? <span>Unverified link</span> : null}
                    </div>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 min-w-40 rounded-xl border border-line-strong bg-surface px-3 text-sm text-ink focus:border-ink focus:outline-none"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
