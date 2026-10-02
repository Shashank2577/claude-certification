import { clsx } from "clsx";
import type { ComponentProps, ReactNode } from "react";

/** Primary content surface. Use `tone="sunken"` for secondary groupings inside a page. */
export function Card({ className, tone = "raised", ...props }: ComponentProps<"section"> & { tone?: "raised" | "sunken" | "plain" }) {
  return (
    <section
      className={clsx(
        "rounded-2xl",
        tone === "raised" && "border border-line bg-surface shadow-card",
        tone === "sunken" && "bg-surface-2/70",
        tone === "plain" && "border border-line",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ title, action, sub }: { title: ReactNode; action?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-display text-[1.05rem] font-semibold tracking-tight">{title}</h2>
        {sub ? <p className="mt-0.5 text-sm text-muted">{sub}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, sub, action }: { title: ReactNode; sub?: ReactNode; action?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8">
      <div className="min-w-0">
        <h1 className="font-display text-3xl font-semibold tracking-[-0.025em] sm:text-[2.5rem] sm:leading-[1.05]">{title}</h1>
        {sub ? <p className="mt-2 max-w-[62ch] text-ink-2">{sub}</p> : null}
      </div>
      {action}
    </header>
  );
}

export function Pill({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "accent" | "good" | "bad" | "info"; className?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        tone === "neutral" && "bg-surface-2 text-ink-2",
        tone === "accent" && "bg-accent-soft text-accent-text",
        tone === "good" && "bg-good-soft text-good",
        tone === "bad" && "bg-bad-soft text-bad",
        tone === "info" && "bg-info-soft text-info",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center">
      {icon ? <div className="mb-3 text-muted">{icon}</div> : null}
      <p className="font-display text-lg font-semibold">{title}</p>
      {body ? <div className="mt-1 max-w-[46ch] text-sm text-ink-2">{body}</div> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
