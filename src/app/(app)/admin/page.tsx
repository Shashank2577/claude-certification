import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/card";
import { activeUsersPerDay, domainHeatmap, hardestQuestions, listUsers, summary } from "@/lib/repo/admin";
import { getAdminViewer } from "@/lib/viewer";
import { UsersTable } from "./users-table";

export const metadata: Metadata = { title: "Admin" };

const pct = (v: number | null) => (v == null ? "–" : `${Math.round(v * 100)}%`);

export default async function AdminPage() {
  const { cert, settings } = await getAdminViewer();
  const s = await summary();
  const users = await listUsers();
  const hard = await hardestQuestions(10);
  const heat = cert ? await domainHeatmap(cert.id) : null;
  const daily = await activeUsersPerDay(30, settings.tz);

  return (
    <>
      <PageHeader title="Admin" sub="Everyone studying on this instance, and where the cohort is struggling." />

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Users" value={String(s.users)} />
        <Stat label="Active in 7 days" value={String(s.active7)} />
        <Stat label="Practice answers" value={s.answered.toLocaleString()} />
        <Stat label="Practice accuracy" value={pct(s.accuracy)} />
        <Stat label="Mocks taken" value={String(s.mocks)} />
        <Stat label="Mock pass rate" value={pct(s.passRate)} />
      </dl>

      <Card className="mt-6 p-5">
        <CardHeader title="Users" sub="Click a column to sort. Readiness is the predicted score on each user’s active exam." />
        <UsersTable rows={users} />
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <CardHeader title="Active users per day" sub="Last 30 days" />
          <ActiveChart data={daily} />
        </Card>

        <Card className="p-5">
          <CardHeader title="Hardest questions" sub="Highest share of wrong answers, at least 3 attempts" />
          {hard.length === 0 ? (
            <p className="mt-4 text-sm text-muted">Not enough answers yet. Questions appear here after three attempts.</p>
          ) : (
            <ol className="mt-4 space-y-3">
              {hard.map((q) => (
                <li key={q.questionId} className="flex gap-3">
                  <span className="w-12 shrink-0 text-right font-display text-lg font-semibold text-bad tabular">{Math.round(q.wrongRate * 100)}%</span>
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm">{q.stem}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {q.questionId}, {q.domainName}, {q.attempts} attempts
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <Card className="mt-6 p-5">
        <CardHeader title="Domain weakness heatmap" sub={cert ? `${cert.name}. Darker brick means weaker; pine means strong.` : undefined} />
        {!heat || heat.rows.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="No practice data yet" body="The heatmap fills in once users answer questions on this exam." />
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[32rem] border-separate border-spacing-1 text-sm">
              <thead>
                <tr>
                  <th className="text-left font-medium text-muted" scope="col">
                    User
                  </th>
                  {heat.domains.map((d) => (
                    <th key={d.id} scope="col" className="max-w-32 px-1 text-left align-bottom text-xs font-medium text-ink-2" title={d.name}>
                      <span className="line-clamp-2">{d.name}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heat.rows.map((r) => (
                  <tr key={r.userId}>
                    <th scope="row" className="pr-2 text-left font-normal whitespace-nowrap">
                      <Link href={`/admin/users/${r.userId}`} className="hover:underline">
                        {r.name}
                      </Link>
                    </th>
                    {r.cells.map((c, i) => (
                      <td
                        key={heat.domains[i].id}
                        className="h-9 min-w-16 rounded-md text-center text-xs font-medium tabular"
                        style={heatStyle(c.mastery, c.attempts)}
                        title={`${heat.domains[i].name}: ${Math.round(c.mastery * 100)}% mastery, ${c.attempts} attempts`}
                      >
                        {c.attempts ? `${Math.round(c.mastery * 100)}` : "–"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function heatStyle(mastery: number, attempts: number): React.CSSProperties {
  if (!attempts) return { background: "var(--surface-2)", color: "var(--muted)" };
  // 0.25 (chance) → brick, 1 → pine.
  const t = Math.max(0, Math.min(1, (mastery - 0.25) / 0.75));
  const color = t < 0.5 ? "var(--bad)" : "var(--good)";
  const strength = Math.round((t < 0.5 ? 1 - t * 2 : (t - 0.5) * 2) * 70 + 12);
  return { background: `color-mix(in oklab, ${color} ${strength}%, var(--surface))`, color: strength > 50 ? "white" : "var(--ink)" };
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-4 py-3">
      <dd className="font-display text-2xl font-semibold tabular">{value}</dd>
      <dt className="text-xs text-muted">{label}</dt>
    </div>
  );
}

function ActiveChart({ data }: { data: { day: string; users: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.users));
  const w = 600;
  const h = 160;
  const bw = w / data.length;
  const total = data.reduce((s, d) => s + d.users, 0);
  return (
    <figure className="mt-4">
      <svg viewBox={`0 0 ${w} ${h + 20}`} className="h-auto w-full" role="img" aria-label={`Active users per day over the last 30 days, peak ${max}`}>
        <line x1={0} x2={w} y1={h} y2={h} stroke="var(--line)" />
        {data.map((d, i) => {
          const bh = (d.users / max) * (h - 12);
          return (
            <g key={d.day}>
              <rect x={i * bw + 2} y={h - bh} width={bw - 4} height={Math.max(bh, d.users ? 2 : 0)} rx={3} fill="var(--accent)">
                <title>{`${d.day}: ${d.users} active`}</title>
              </rect>
            </g>
          );
        })}
        <text x={0} y={h + 16} fontSize={11} fill="var(--muted)">
          {data[0]?.day.slice(5)}
        </text>
        <text x={w} y={h + 16} fontSize={11} fill="var(--muted)" textAnchor="end">
          Today
        </text>
        <text x={w} y={10} fontSize={11} fill="var(--muted)" textAnchor="end">
          Peak {max}
        </text>
      </svg>
      {total === 0 ? <figcaption className="mt-2 text-sm text-muted">No activity in the last 30 days.</figcaption> : null}
    </figure>
  );
}
