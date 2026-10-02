// Calendar-day helpers. Days are "YYYY-MM-DD" strings in the user's time zone.

export function dayKey(date: Date | number, timeZone = "UTC"): string {
  const d = typeof date === "number" ? new Date(date) : date;
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export function localHour(date: Date | number, timeZone = "UTC"): number {
  const d = typeof date === "number" ? new Date(date) : date;
  try {
    const h = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hour12: false }).format(d);
    return Number(h) % 24;
  } catch {
    return d.getUTCHours();
  }
}

export function addDays(day: string, n: number): string {
  const t = Date.parse(`${day}T00:00:00Z`) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export interface StreakResult {
  current: number;
  /** Whether today already counts. */
  activeToday: boolean;
  longest: number;
}

/**
 * Consecutive days ending today (or yesterday, if today has no activity yet)
 * where the day is either active or covered by a streak freeze.
 */
export function computeStreak(activeDays: Iterable<string>, frozenDays: Iterable<string>, today: string): StreakResult {
  const active = new Set(activeDays);
  const covered = new Set([...active, ...frozenDays]);
  const activeToday = active.has(today);
  let cursor = activeToday ? today : addDays(today, -1);
  let current = 0;
  let sawActive = false;
  while (covered.has(cursor)) {
    current += 1;
    if (active.has(cursor)) sawActive = true;
    cursor = addDays(cursor, -1);
  }
  // A run made only of frozen days doesn't count as a streak.
  if (!sawActive) current = 0;
  const sorted = [...covered].sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  return { current, activeToday, longest: Math.max(longest, current) };
}

/**
 * Days that need a freeze to keep the streak alive, given the last active day
 * before today. Returns [] when no gap exists or the gap is too large to bridge.
 */
export function missedDaysToFreeze(lastActive: string | null, today: string, freezesAvailable: number, alreadyFrozen: ReadonlySet<string>): string[] {
  if (!lastActive) return [];
  const gap = daysBetween(lastActive, today) - 1;
  if (gap <= 0) return [];
  const missing: string[] = [];
  for (let i = 1; i <= gap; i++) {
    const d = addDays(lastActive, i);
    if (!alreadyFrozen.has(d)) missing.push(d);
  }
  return missing.length <= freezesAvailable ? missing : [];
}
