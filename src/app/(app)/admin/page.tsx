import type { Metadata } from "next";
import Link from "next/link";
import { clsx } from "clsx";
import { Card, CardHeader, EmptyState, PageHeader, Pill } from "@/components/ui/card";
import { getCert, getCerts } from "@/lib/content";
import { certShortName, MIN_READINESS_ANSWERS, STATUS_LABEL, STATUS_ORDER, STATUS_TONE } from "@/lib/admin-status";
import { activeUsersPerDay, domainHeatmap, hardestDomains, hardestQuestions, learningMetrics, listUsers, retention3Days, summary, type HeatCell } from "@/lib/repo/admin";
import { getAdminViewer } from "@/lib/viewer";
import { ActiveChart } from "./active-chart";
import { UsersTable } from "./users-table";

export const metadata: Metadata = { title: "Admin" };

const pct = (v: number | null) => (v == null ? "–" : `${Math.round(v * 100)}%`);

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const { cert: ownCert, settings } = await getAdminViewer();
  const sp = await searchParams;
  const certs = getCerts();
  const requested = typeof sp.cert === "string" ? getCert(sp.cert) : undefined;
  const cert = requested ?? ownCert;

  const [s, users, daily, retention, learning] = await Promise.all([summary(), listUsers(), activeUsersPerDay(30, settings.tz), retention3Days(settings.tz), learningMetrics()]);
  const hard = await hardestQuestions(10, 3, cert?.id);
  const hardDomains = hard.length === 0 ? await hardestDomains(6, cert?.id) : [];
  const heat = cert ? await domainHeatmap(cert.id) : null;
  const atRisk = users.filter((u) => u.status !== "on-track").sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));

  return (
    <div className="min-w-0">
      <PageHeader title="Admin" sub="Everyone studying on this instance, and where the cohort is struggling." />
      <Link href="/admin/reviews" className="mb-5 inline-flex min-h-10 items-center rounded-lg border border-line bg-surface px-4 text-sm font-semibold hover:bg-surface-2">Open content and integrity reviews →</Link>

      <dl className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Users" value={String(s.users)} />
        <Stat label="Studied in last 7 days" value={String(s.active7)} />
        <Stat label="Practice answers" value={s.answered.toLocaleString()} />
        <Stat label="Practice accuracy" value={pct(s.accuracy)} />
        <Stat label="Mocks taken" value={String(s.mocks)} />
        <Stat label="Mock pass rate" value={pct(s.passRate)} />
      </dl>

      <Card className="mt-6 min-w-0 p-5">
        <CardHeader title="Learning outcomes" sub="Based on answers and submitted mocks, not page views or minutes online." />
        <dl className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Outcome label="First answer" value={learning.firstAnswer} base={s.users} detail="Learners who answered at least one question" />
          <Outcome label="Returned to retry" value={learning.returnedToReview} base={learning.missed} detail="Learners who retried a missed question at least a day later" />
          <Outcome label="Delayed correction" value={learning.delayedCorrection} base={learning.missed} detail="Learners who corrected a missed question at least a day later" />
          <Outcome label="Second mock improved" value={learning.improvedMock} base={learning.repeatMock} detail="Learners whose second mock beat their first on the same exam" />
        </dl>
      </Card>

      <Card className="mt-6 min-w-0 p-5">
        <CardHeader title="At risk" sub={atRisk.length ? `${atRisk.length} of ${users.length} users need a nudge` : undefined} />
        {atRisk.length === 0 ? (
          <p className="mt-4 text-sm text-muted">Everyone is on track.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {atRisk.map((u) => (
              <li key={u.id} className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
                <Pill tone={STATUS_TONE[u.status]} className="shrink-0">
                  {STATUS_LABEL[u.status]}
                </Pill>
                <Link href={`/admin/users/${u.id}`} className="max-w-full min-w-0 truncate font-medium hover:underline sm:max-w-[16rem]" title={u.name}>
                  {u.name}
                </Link>
                <span className="min-w-0 basis-full text-sm text-ink-2 sm:basis-auto sm:flex-1">{u.reasons.join("; ")}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-6 min-w-0 p-5">
        <CardHeader
          title="Users"
          sub={`Click a column to sort. Practice columns exclude mock exams (${s.mockAnswers.toLocaleString()} mock answers in total). Readiness is the predicted score on each user’s active exam, shown from ${MIN_READINESS_ANSWERS} answers.`}
        />
        <UsersTable rows={users} />
      </Card>

      <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-2">
        <Card className="min-w-0 p-5">
          <CardHeader title="Users studying per day" sub="Last 30 days. Onboarding and badges don’t count." />
          <ActiveChart data={daily} retention={retention} />
        </Card>

        <Card className="min-w-0 p-5">
          <CardHeader
            title="Hardest questions"
            sub={hard.length ? `${cert ? certShortName(cert.name) : "All exams"}: highest share of wrong answers, at least 3 attempts` : "Too few repeat attempts yet, so showing the weakest domains"}
          />
          {hard.length > 0 ? (
            <ol className="mt-4 space-y-3">
              {hard.map((q) => (
                <li key={q.questionId} className="flex gap-3">
                  <span className="w-12 shrink-0 text-right font-display text-lg font-semibold text-bad tabular">{Math.round(q.wrongRate * 100)}%</span>
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm" title={q.stem}>
                      {q.stem}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {q.domainName}, n={q.attempts}, <span className="font-mono">{q.questionId}</span>
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          ) : hardDomains.length > 0 ? (
            <ol className="mt-4 space-y-3">
              {hardDomains.map((d) => (
                <li key={`${d.certId}:${d.domainId}`} className="flex gap-3">
                  <span className="w-12 shrink-0 text-right font-display text-lg font-semibold text-bad tabular">{Math.round(d.wrongRate * 100)}%</span>
                  <div className="min-w-0">
                    <p className="text-sm">{d.domainName}</p>
                    <p className="mt-0.5 text-xs text-muted">wrong, n={d.attempts} answers</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-4 text-sm text-muted">No answers on this exam yet.</p>
          )}
        </Card>
      </div>

      <Card className="mt-6 min-w-0 p-5">
        <CardHeader
          title="Domain weakness heatmap"
          sub={cert ? `${cert.name}. Darker brick means weaker; pine means strong.` : undefined}
        />
        {certs.length > 1 ? (
          <nav aria-label="Exam" className="mt-3 inline-flex max-w-full flex-wrap gap-1 rounded-xl bg-surface-2 p-1">
            {certs.map((c) => (
              <Link
                key={c.id}
                href={`/admin?cert=${encodeURIComponent(c.id)}`}
                scroll={false}
                aria-current={c.id === cert?.id ? "page" : undefined}
                className={clsx(
                  "inline-flex min-h-8 items-center rounded-lg px-3 text-sm font-medium",
                  c.id === cert?.id ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink",
                )}
              >
                {certShortName(c.name)}
              </Link>
            ))}
          </nav>
        ) : null}
        {!heat || heat.rows.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="No practice data yet" body="The heatmap fills in once users answer questions on this exam." />
          </div>
        ) : (
          <div className="relative mt-4 min-w-0 overflow-x-auto">
            <table className="w-full min-w-[32rem] table-fixed border-separate border-spacing-1 text-sm">
              <thead>
                <tr>
                  <th className="w-36 text-left font-medium text-muted sm:w-44" scope="col">
                    User
                  </th>
                  {heat.domains.map((d) => (
                    <th key={d.id} scope="col" className="px-1 text-left align-bottom text-xs font-medium text-ink-2" title={d.name}>
                      <span className="line-clamp-2">{d.name}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heat.rows.map((r) => (
                  <tr key={r.userId}>
                    <th scope="row" className="max-w-0 pr-2 text-left font-normal">
                      <Link href={`/admin/users/${r.userId}`} className="block truncate hover:underline" title={r.name}>
                        {r.name}
                      </Link>
                    </th>
                    {r.cells.map((c, i) => (
                      <HeatTd key={heat.domains[i].id} cell={c} domain={heat.domains[i].name} />
                    ))}
                  </tr>
                ))}
              </tbody>
              {heat.rows.length > 1 ? (
                <tfoot>
                  <tr>
                    <th scope="row" className="pt-1 pr-2 text-left text-xs font-semibold text-ink-2">
                      Cohort average
                    </th>
                    {heat.average.map((c, i) => (
                      <HeatTd key={heat.domains[i].id} cell={c} domain={heat.domains[i].name} average />
                    ))}
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Outcome({ label, value, base, detail }: { label: string; value: number; base: number; detail: string }) {
  return <div className="min-w-0 rounded-xl bg-surface-2/60 p-4">
    <dt className="text-sm font-semibold text-ink">{label}</dt>
    <dd className="mt-1 font-display text-2xl font-semibold tabular">{value}<span className="text-base font-normal text-muted"> / {base}</span></dd>
    <p className="mt-1 text-xs text-ink-2">{detail}</p>
  </div>;
}

function HeatTd({ cell, domain, average }: { cell: HeatCell; domain: string; average?: boolean }) {
  return (
    <td
      className={clsx("h-9 min-w-16 rounded-md text-center text-xs font-medium tabular", average && "outline-1 -outline-offset-1 outline-line-strong")}
      style={heatStyle(cell.mastery, cell.attempts)}
      title={`${average ? "Cohort average, " : ""}${domain}: ${Math.round(cell.mastery * 100)}% mastery, ${cell.attempts} attempts`}
    >
      {cell.attempts ? `${Math.round(cell.mastery * 100)}` : "–"}
    </td>
  );
}

/**
 * Background mixes brick (weak) or pine (strong) into the surface. Strength is capped at 52% so the
 * text, always var(--ink), keeps at least 4.5:1 in both themes (worst case 4.9:1 on dark pine).
 */
function heatStyle(mastery: number, attempts: number): React.CSSProperties {
  if (!attempts) return { background: "var(--surface-2)", color: "var(--muted)" };
  // 0.25 (chance) → brick, 1 → pine.
  const t = Math.max(0, Math.min(1, (mastery - 0.25) / 0.75));
  const color = t < 0.5 ? "var(--bad)" : "var(--good)";
  const strength = Math.round((t < 0.5 ? 1 - t * 2 : (t - 0.5) * 2) * 42 + 10);
  return { background: `color-mix(in oklab, ${color} ${strength}%, var(--surface))`, color: "var(--ink)" };
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-surface px-4 py-3">
      <dd className="font-display text-2xl font-semibold tabular">{value}</dd>
      <dt className="text-xs text-muted">{label}</dt>
    </div>
  );
}
