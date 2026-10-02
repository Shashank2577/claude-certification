import { AppShell } from "@/components/shell/app-shell";
import { CelebrationProvider } from "@/components/celebrate";
import { FocusProvider } from "@/components/focus-timer";
import { levelFor } from "@/lib/gamification";
import { streakFor, totalXp } from "@/lib/repo/activity";
import { getViewer } from "@/lib/viewer";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user, settings } = await getViewer();
  const xp = await totalXp(user.id);
  const lvl = levelFor(xp);
  const streak = await streakFor(user.id, settings.tz);
  return (
    <CelebrationProvider>
      <FocusProvider workMinutes={settings.pomodoroWork} breakMinutes={settings.pomodoroBreak}>
        <AppShell
          data={{
            name: user.name,
            isAdmin: user.role === "admin",
            xp,
            level: lvl.level,
            levelName: lvl.name,
            levelProgress: lvl.progress,
            streak: streak.current,
            activeToday: streak.activeToday,
            freezes: settings.freezes,
          }}
        >
          {children}
        </AppShell>
      </FocusProvider>
    </CelebrationProvider>
  );
}
