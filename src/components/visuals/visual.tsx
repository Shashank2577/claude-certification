"use client";

import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from "react";
import clsx from "clsx";
import { VISUALS } from "./registry";
import { VisualPlaceholder } from "./placeholder";

// Built once at module scope so React sees stable component identities.
const LAZY: Partial<Record<string, LazyExoticComponent<ComponentType>>> = Object.fromEntries(
  Object.entries(VISUALS)
    .filter(([, v]) => v.load)
    .map(([id, v]) => [id, lazy(v.load!)]),
);

function Loading() {
  return <div className="h-64 animate-pulse rounded-xl bg-surface-2/70" aria-label="Loading diagram" />;
}

/** Renders a registered interactive visual inside a captioned frame. */
export function Visual({ id, compact }: { id: string; compact?: boolean }) {
  const info = VISUALS[id];
  const Component = LAZY[id];
  if (!Component && !info) return null;
  return (
    <figure
      className={clsx(
        "not-prose @container my-2 max-w-full min-w-0 overflow-x-clip rounded-2xl border border-line bg-surface shadow-card",
        compact ? "p-2 sm:p-3" : "p-3 sm:p-5",
      )}
    >
      {Component ? (
        <Suspense fallback={<Loading />}>
          <Component />
        </Suspense>
      ) : (
        <VisualPlaceholder title={info?.title ?? "Diagram"} description={info?.description} />
      )}
      {info && Component ? <figcaption className={clsx("px-1 text-muted", compact ? "mt-2 text-xs" : "mt-3 text-sm")}>{info.description}</figcaption> : null}
    </figure>
  );
}
