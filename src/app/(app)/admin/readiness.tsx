import { Pill } from "@/components/ui/card";

/** Readiness with its sample size; below the minimum sample it says so instead of showing a number. */
export function Readiness({ score, answers, pass }: { score: number | null; answers: number; pass: number }) {
  if (score == null) return <span className="text-muted">Too early ({answers} answer{answers === 1 ? "" : "s"})</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="font-medium">{score}</span>
      <Pill tone={score >= pass ? "good" : "bad"}>{score >= pass ? `Above ${pass}` : `Below ${pass}`}</Pill>
      <span className="text-xs text-muted">n={answers}</span>
    </span>
  );
}
