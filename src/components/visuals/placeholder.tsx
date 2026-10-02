import { Shapes } from "lucide-react";

/** Shown for visual ids that are not built yet (or unknown). */
export function VisualPlaceholder({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line-strong bg-surface-2/50 px-6 py-10 text-center">
      <svg width="88" height="40" viewBox="0 0 88 40" aria-hidden className="text-line-strong">
        <rect x="2" y="10" width="20" height="20" rx="6" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="44" cy="20" r="10" fill="none" stroke="var(--accent)" strokeWidth="2" />
        <rect x="66" y="10" width="20" height="20" rx="6" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M23 20h10M55 20h10" stroke="currentColor" strokeWidth="2" strokeDasharray="3 3" />
      </svg>
      <div>
        <p className="flex items-center justify-center gap-1.5 font-display font-semibold">
          <Shapes size={16} className="text-muted" aria-hidden />
          {title}
        </p>
        {description ? <p className="mt-1 max-w-[46ch] text-sm text-ink-2">{description}</p> : null}
        <p className="mt-2 text-xs text-muted">Interactive diagram coming soon.</p>
      </div>
    </div>
  );
}
