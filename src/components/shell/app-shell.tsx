"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { clsx } from "clsx";
import {
  BookOpen,
  ClipboardCheck,
  Gauge,
  Hourglass,
  Layers,
  Lightbulb,
  LogOut,
  Menu,
  Pause,
  Play,
  Settings,
  Shield,
  Target,
  Trophy,
  X,
} from "lucide-react";
import { logOut } from "@/app/actions/auth";
import { StreakFlame } from "../streak-flame";
import { ThemeToggle } from "./theme-toggle";
import { formatClock, useFocus } from "../focus-timer";

export interface ShellData {
  name: string;
  isAdmin: boolean;
  xp: number;
  level: number;
  levelName: string;
  levelProgress: number;
  streak: number;
  activeToday: boolean;
  freezes: number;
}

const NAV = [
  { href: "/today", label: "Today", icon: Gauge },
  { href: "/learn", label: "Learn", icon: BookOpen },
  { href: "/practice", label: "Practice", icon: Target },
  { href: "/mock", label: "Mock exam", icon: ClipboardCheck },
  { href: "/flashcards", label: "Flashcards", icon: Layers },
  { href: "/insights", label: "Insights", icon: Lightbulb },
  { href: "/focus", label: "Focus", icon: Hourglass },
  { href: "/achievements", label: "Achievements", icon: Trophy },
];

const MOBILE_TABS = NAV.slice(0, 5);

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ data, children }: { data: ShellData; children: ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  // Close the drawer whenever the route changes.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setMenuOpen(false);
  }

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  const nav = data.isAdmin ? [...NAV, { href: "/admin", label: "Admin", icon: Shield }] : NAV;

  return (
    <div className="canvas-grid min-h-dvh">
      <a href="#main" className="sr-only z-[100] rounded-lg bg-ink px-3 py-2 text-bg focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Skip to content
      </a>

      {/* Desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-line bg-bg/85 px-3 py-5 backdrop-blur lg:flex">
        <Wordmark />
        <nav className="mt-8 flex flex-1 flex-col gap-0.5" aria-label="Main">
          {nav.map((item) => (
            <NavLink key={item.href} {...item} active={isActive(pathname, item.href)} />
          ))}
        </nav>
        <LevelCard data={data} />
      </aside>

      <div className="lg:pl-60">
        <TopBar data={data} onMenu={() => setMenuOpen(true)} />
        <motion.main
          id="main"
          key={pathname}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto w-full max-w-6xl px-4 pt-6 pb-28 sm:px-6 lg:px-10 lg:pt-8 lg:pb-16"
        >
          {children}
        </motion.main>
        <footer className="mx-auto max-w-6xl px-4 pb-28 text-xs text-muted sm:px-6 lg:px-10 lg:pb-8">
          Unofficial study aid, not affiliated with or endorsed by Anthropic. Exam details may change; check the official exam guide.
        </footer>
      </div>

      {/* Mobile tab bar */}
      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <ul className="grid grid-cols-5">
          {MOBILE_TABS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={clsx("flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium", active ? "text-ink" : "text-muted")}
                >
                  <Icon size={20} strokeWidth={active ? 2.4 : 1.8} />
                  {label === "Mock exam" ? "Mock" : label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Mobile drawer */}
      <AnimatePresence>
        {menuOpen ? (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div className="absolute inset-0 bg-ink/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMenuOpen(false)} />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
              className="absolute inset-y-0 right-0 flex w-[84%] max-w-xs flex-col bg-bg px-4 py-5"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 400, damping: 40 }}
            >
              <div className="flex items-center justify-between">
                <Wordmark />
                <button onClick={() => setMenuOpen(false)} className="rounded-lg p-2 text-muted hover:bg-surface-2" aria-label="Close menu" autoFocus>
                  <X size={20} />
                </button>
              </div>
              <nav className="mt-6 flex flex-col gap-0.5">
                {nav.map((item) => (
                  <NavLink key={item.href} {...item} active={isActive(pathname, item.href)} />
                ))}
                <NavLink href="/settings" label="Settings" icon={Settings} active={isActive(pathname, "/settings")} />
              </nav>
              <div className="mt-auto">
                <LevelCard data={data} />
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function Wordmark() {
  return (
    <Link href="/today" className="flex items-center gap-2.5 px-2">
      <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
        <rect x="1" y="1" width="24" height="24" rx="7" fill="var(--ink)" />
        <path d="M7 18 L13 7 L19 18" stroke="var(--accent)" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9.6 14h6.8" stroke="var(--bg)" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className="font-display text-[1.05rem] font-semibold tracking-tight">Architect Prep</span>
    </Link>
  );
}

function NavLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof Gauge; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={clsx(
        "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-[0.95rem] transition-colors",
        active ? "font-semibold text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
      )}
    >
      {active ? (
        <motion.span layoutId="nav-active" className="absolute inset-0 rounded-xl bg-surface shadow-card" transition={{ type: "spring", stiffness: 500, damping: 40 }} />
      ) : null}
      <Icon size={18} className="relative" strokeWidth={active ? 2.3 : 1.8} />
      <span className="relative">{label}</span>
    </Link>
  );
}

function LevelCard({ data }: { data: ShellData }) {
  return (
    <Link href="/achievements" className="block rounded-2xl border border-line bg-surface p-3.5 transition-colors hover:border-line-strong">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-muted">Level {data.level}</span>
        <span className="text-xs text-muted tabular">{data.xp.toLocaleString()} XP</span>
      </div>
      <p className="mt-0.5 font-display font-semibold">{data.levelName}</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <motion.div
          className="h-full rounded-full bg-accent"
          style={{ originX: 0 }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: data.levelProgress }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </Link>
  );
}

function TopBar({ data, onMenu }: { data: ShellData; onMenu: () => void }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:px-6 lg:px-10">
        <div className="lg:hidden">
          <Wordmark />
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <FocusChip />
          <Link
            href="/today"
            className="flex items-center gap-1.5 rounded-xl px-2 py-1.5 hover:bg-surface-2"
            title={`${data.streak}-day streak · ${data.freezes} streak freeze${data.freezes === 1 ? "" : "s"}`}
            aria-label={`${data.streak} day streak, ${data.freezes} streak freezes`}
          >
            <StreakFlame streak={data.streak} activeToday={data.activeToday} />
            <span className="font-display font-semibold tabular">{data.streak}</span>
          </Link>
          <span className="hidden items-center rounded-xl px-2 py-1.5 text-sm text-ink-2 sm:flex tabular" aria-label={`${data.xp} XP`}>
            <span className="mr-1 font-display font-semibold text-ink">{data.xp.toLocaleString()}</span> XP
          </span>
          <ThemeToggle />
          <Link href="/settings" className="hidden size-9 place-items-center rounded-xl text-ink-2 hover:bg-surface-2 hover:text-ink lg:grid" aria-label="Settings">
            <Settings size={18} />
          </Link>
          <form action={logOut} className="hidden lg:block">
            <button className="grid size-9 place-items-center rounded-xl text-ink-2 hover:bg-surface-2 hover:text-ink" aria-label="Log out" title="Log out">
              <LogOut size={18} />
            </button>
          </form>
          <button onClick={onMenu} className="grid size-9 place-items-center rounded-xl text-ink-2 hover:bg-surface-2 lg:hidden" aria-label="Open menu">
            <Menu size={20} />
          </button>
        </div>
      </div>
    </header>
  );
}

function FocusChip() {
  const f = useFocus();
  if (f.phase === "idle") return null;
  const label = f.phase === "break" ? "Break" : f.phase === "sprint" ? "5-min start" : "Focus";
  return (
    <div className="flex items-center gap-1 rounded-xl border border-line bg-surface py-1 pr-1 pl-2.5 text-sm">
      <Link href="/focus" className="flex items-center gap-1.5">
        <span className={clsx("size-2 rounded-full", f.phase === "break" ? "bg-good" : "bg-accent", f.running && "animate-pulse")} aria-hidden />
        <span className="hidden text-ink-2 sm:inline">{label}</span>
        <span className="font-display font-semibold tabular">{formatClock(f.secondsLeft)}</span>
      </Link>
      <button onClick={f.running ? f.pause : f.resume} className="grid size-7 place-items-center rounded-lg text-ink-2 hover:bg-surface-2" aria-label={f.running ? "Pause timer" : "Resume timer"}>
        {f.running ? <Pause size={14} /> : <Play size={14} />}
      </button>
    </div>
  );
}
