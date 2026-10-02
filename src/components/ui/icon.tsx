import {
  Award,
  Bookmark,
  BookOpen,
  CircleCheck,
  Cpu,
  Crown,
  Flag,
  Flame,
  Hourglass,
  Layers,
  Library,
  Moon,
  RotateCcw,
  Sparkles,
  Sunrise,
  Target,
  Timer,
  Zap,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  Award,
  Bookmark,
  BookOpen,
  CircleCheck,
  Cpu,
  Crown,
  Flag,
  Flame,
  Hourglass,
  Layers,
  Library,
  Moon,
  RotateCcw,
  Sparkles,
  Sunrise,
  Target,
  Timer,
  Zap,
};

/** Resolves achievement icon names (stored as strings) to lucide components. */
export function NamedIcon({ name, size = 20, className }: { name: string; size?: number; className?: string }) {
  const Icon = ICONS[name] ?? Award;
  return <Icon size={size} className={className} aria-hidden />;
}

export const TIER_COLORS: Record<string, string> = {
  bronze: "#c98a4b",
  silver: "#8d9aa8",
  gold: "#e0a526",
};
