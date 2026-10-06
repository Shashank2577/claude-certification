/** A conservative triage signal using server timestamps; it does not establish cheating. */
export function integritySignal(a: { score: number | null; total: number | null; startedAt: number; submittedAt: number | null; endsAt: number }) {
  if (a.score == null || a.total == null || a.total < 10 || a.submittedAt == null) return null;
  const elapsed = Math.max(0, a.submittedAt - a.startedAt);
  const allowed = Math.max(1, a.endsAt - a.startedAt);
  if (a.score >= 900 && elapsed < Math.min(5 * 60_000, allowed * 0.15)) {
    return `Score ${a.score} on ${a.total} questions in ${Math.round(elapsed / 1000)} seconds (${Math.round(elapsed / allowed * 100)}% of allotted time).`;
  }
  return null;
}
