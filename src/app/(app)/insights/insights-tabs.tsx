"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { clsx } from "clsx";

export interface InsightsTab {
  id: string;
  label: string;
  content: ReactNode;
}

/**
 * One section at a time. The tab id doubles as the URL hash, so links such as
 * /insights#resources (from Today) open that tab.
 */
export function InsightsTabs({ tabs }: { tabs: InsightsTab[] }) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");
  const list = useRef<HTMLDivElement>(null);

  const fromHash = useCallback(() => {
    const id = window.location.hash.slice(1);
    if (!tabs.some((t) => t.id === id)) return;
    setActive(id);
    requestAnimationFrame(() => list.current?.scrollIntoView({ block: "start" }));
  }, [tabs]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing with the URL hash on mount
    fromHash();
    window.addEventListener("hashchange", fromHash);
    window.addEventListener("popstate", fromHash);
    return () => {
      window.removeEventListener("hashchange", fromHash);
      window.removeEventListener("popstate", fromHash);
    };
  }, [fromHash]);

  const select = (id: string, focus = false) => {
    setActive(id);
    try {
      history.replaceState(history.state, "", `#${id}`);
    } catch {}
    if (focus) document.getElementById(`tab-${id}`)?.focus();
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = tabs.findIndex((t) => t.id === active);
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    select(tabs[next].id, true);
  };

  return (
    <div>
      <div
        ref={list}
        role="tablist"
        aria-label="Insights sections"
        onKeyDown={onKey}
        className="-mx-4 mb-8 flex scroll-mt-20 gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0"
      >
        {tabs.map((t) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              id={`tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={t.id}
              tabIndex={on ? 0 : -1}
              onClick={() => select(t.id)}
              className={clsx(
                "shrink-0 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors",
                on ? "border-ink bg-ink text-bg" : "border-line-strong bg-surface text-ink-2 hover:border-ink hover:text-ink",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div key={t.id} id={t.id} role="tabpanel" aria-labelledby={`tab-${t.id}`} hidden={t.id !== active} tabIndex={0} className="scroll-mt-20 outline-none">
          {t.content}
        </div>
      ))}
    </div>
  );
}

/** Clamps its content to roughly three lines, with an accessible "Read more" toggle when it overflows. */
export function Clamp({ children, maxHeight = "5rem", className }: { children: ReactNode; maxHeight?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 2);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className={className}>
      <div
        ref={box}
        id={id}
        className={clsx("relative overflow-hidden", !open && overflows && "[mask-image:linear-gradient(to_bottom,black_60%,transparent)]")}
        style={open ? undefined : { maxHeight }}
      >
        {children}
      </div>
      {overflows || open ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
          className="mt-1.5 text-sm font-medium text-accent-text underline-offset-4 hover:underline"
        >
          {open ? "Show less" : "Read more"}
        </button>
      ) : null}
    </div>
  );
}
