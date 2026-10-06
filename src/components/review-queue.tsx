import Link from "next/link";
import { ArrowRight, RotateCcw } from "lucide-react";
import type { ReviewPlan } from "@/lib/review-plan";
import { Card, CardHeader } from "./ui/card";

export function ReviewQueue({ plan, compact = false }: { plan: ReviewPlan; compact?: boolean }) {
  return <Card className="min-w-0 p-5 sm:p-6">
    <CardHeader title="Your next review" sub={plan.mock ? `After your ${plan.mock.score} mock: focus on ${plan.mock.domain}.` : "A short queue that changes as you improve."} />
    <ol className="mt-4 grid min-w-0 gap-2">
      {plan.tasks.map((task, index) => <li key={task.id} className="min-w-0">
        <Link href={task.href} className="group flex min-w-0 items-center gap-3 rounded-xl border border-line bg-bg/60 p-3 transition-colors hover:border-accent-strong hover:bg-accent-soft/40">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 font-display font-semibold tabular">{index + 1}</span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold wrap-anywhere text-ink">{task.title}</span>
            {!compact && <span className="mt-0.5 block text-sm text-ink-2">{task.reason}</span>}
          </span>
          <span className="shrink-0 text-xs text-muted tabular">~{task.minutes} min</span>
          <ArrowRight size={16} className="shrink-0 text-ink-2 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
      </li>)}
    </ol>
    {compact && <Link href="/review" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"><RotateCcw size={15} aria-hidden /> See your review plan</Link>}
  </Card>;
}
