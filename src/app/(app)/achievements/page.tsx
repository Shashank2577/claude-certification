import type { Metadata } from "next";
import { clsx } from "clsx";
import { Lock } from "lucide-react";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { NamedIcon, TIER_COLORS } from "@/components/ui/icon";
import { ProgressBar } from "@/components/ui/progress";
import { ACHIEVEMENTS, LEVEL_NAMES, levelFor, xpForLevel } from "@/lib/gamification";
import { ownedAchievements, totalXp } from "@/lib/repo/activity";
import { leaderboard } from "@/lib/repo/leaderboard";
import { getViewer } from "@/lib/viewer";
import { Leaderboard } from "./leaderboard";

export const metadata: Metadata = { title: "Achievements" };

const fmtDate = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" });

export default async function AchievementsPage() {
  const { user, settings } = await getViewer();
  const xp = await totalXp(user.id);
  const lvl = levelFor(xp);
  const owned = new Map((await ownedAchievements(user.id)).map((a) => [a.id, a.unlockedAt]));
  const [week, all] = await Promise.all([leaderboard(7), leaderboard(null)]);

  return (
    <>
      <PageHeader title="Achievements" sub={`${owned.size} of ${ACHIEVEMENTS.length} badges unlocked. Level ${lvl.level}, ${lvl.name}.`} />

      <section aria-labelledby="badges-h">
        <h2 id="badges-h" className="mb-3 font-display text-xl font-semibold tracking-tight">
          Badges
        </h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {ACHIEVEMENTS.map((a) => {
            const at = owned.get(a.id);
            const color = TIER_COLORS[a.tier];
            return (
              <li
                key={a.id}
                className={clsx("flex flex-col rounded-2xl border p-4", at ? "border-line bg-surface shadow-card" : "border-dashed border-line-strong bg-transparent")}
              >
                <span
                  className="grid size-11 place-items-center rounded-full"
                  style={at ? { background: `color-mix(in oklab, ${color} 24%, transparent)`, color: "var(--ink)" } : { background: "var(--surface-2)", color: "var(--muted)" }}
                >
                  {at ? <NamedIcon name={a.icon} size={20} /> : <Lock size={16} aria-hidden />}
                </span>
                <p className={clsx("mt-3 font-display font-semibold", !at && "text-ink-2")}>{a.title}</p>
                <p className="mt-0.5 text-sm text-muted">{a.description}</p>
                <p className="mt-auto pt-3 text-xs text-muted">
                  {at ? (
                    <>
                      <span className="font-medium" style={{ color: "var(--ink-2)" }}>
                        {a.tier[0].toUpperCase() + a.tier.slice(1)}
                      </span>
                      , unlocked {fmtDate.format(at)}
                    </>
                  ) : (
                    <span className="sr-only">Locked</span>
                  )}
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <CardHeader title="Levels" sub={`${(lvl.ceiling - xp).toLocaleString()} XP to level ${lvl.level + 1}`} />
          <div className="mt-3">
            <ProgressBar value={lvl.progress} label="Progress to next level" />
          </div>
          <ol className="mt-5 space-y-1">
            {LEVEL_NAMES.map((name, i) => {
              const level = i + 1;
              const current = level === lvl.level;
              const reached = level <= lvl.level;
              return (
                <li
                  key={name}
                  aria-current={current ? "step" : undefined}
                  className={clsx("flex items-center gap-3 rounded-xl px-3 py-2", current && "bg-accent-soft")}
                >
                  <span
                    className={clsx(
                      "grid size-7 shrink-0 place-items-center rounded-full font-display text-sm font-semibold tabular",
                      reached ? "bg-ink text-bg" : "bg-surface-2 text-muted",
                    )}
                  >
                    {level}
                  </span>
                  <span className={clsx("flex-1", current ? "font-semibold" : reached ? "text-ink" : "text-muted")}>{name}</span>
                  <span className="text-sm text-muted tabular">{xpForLevel(level).toLocaleString()} XP</span>
                </li>
              );
            })}
          </ol>
        </Card>

        <Leaderboard week={week} all={all} meId={user.id} optedOut={settings.leaderboardOptOut} />
      </div>
    </>
  );
}
