"use client";

import { useState, useTransition } from "react";
import { clsx } from "clsx";
import { Pause, Play, Square } from "lucide-react";
import { saveFocusDurations } from "@/app/actions/focus";
import { formatClock, useFocus } from "@/components/focus-timer";
import { useCelebrate } from "@/components/celebrate";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Ring } from "@/components/ui/progress";

const WORK_OPTIONS = [15, 25, 40, 50];
const BREAK_OPTIONS = [3, 5, 10, 15];

export function FocusPanel({ todaySessions, todayMinutes, allTime }: { todaySessions: number; todayMinutes: number; allTime: number }) {
  const f = useFocus();
  const { toast } = useCelebrate();
  const [, startTransition] = useTransition();
  const [work, setWork] = useState(f.workMinutes);
  const [rest, setRest] = useState(f.breakMinutes);

  const total = f.phase === "idle" ? f.workMinutes * 60 : f.blockMinutes * 60;
  const left = f.phase === "idle" ? f.workMinutes * 60 : f.secondsLeft;
  const progress = total > 0 ? 1 - left / total : 0;
  const phaseLabel = f.phase === "idle" ? "Ready" : f.phase === "break" ? "Break" : f.phase === "sprint" ? "Five-minute start" : "Focus";
  const color = f.phase === "break" ? "var(--good)" : "var(--accent)";

  const save = (w: number, r: number) => {
    setWork(w);
    setRest(r);
    f.setDurations(w, r);
    startTransition(async () => {
      await saveFocusDurations(w, r);
      toast("Timer lengths saved");
    });
  };

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <Card className="flex min-w-0 flex-col items-center px-4 py-10 sm:px-6">
        <Ring value={progress} size={260} stroke={14} color={color} label={`${phaseLabel}, ${formatClock(left)} left`}>
          <div>
            <p className="text-sm text-muted">{phaseLabel}</p>
            <p className="font-display text-6xl font-semibold tracking-tight tabular" aria-live="off">
              {formatClock(left)}
            </p>
          </div>
        </Ring>
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {f.phase === "idle" ? (
            <>
              <Button variant="accent" size="lg" onClick={() => f.start("work")}>
                <Play size={18} /> Start {f.workMinutes}-minute focus
              </Button>
              <Button variant="outline" size="lg" onClick={() => f.start("sprint", 5)}>
                Just five minutes
              </Button>
            </>
          ) : (
            <>
              {f.running ? (
                <Button variant="primary" size="lg" onClick={f.pause}>
                  <Pause size={18} /> Pause
                </Button>
              ) : (
                <Button variant="accent" size="lg" onClick={f.resume}>
                  <Play size={18} /> Resume
                </Button>
              )}
              <Button variant="ghost" size="lg" onClick={f.stop}>
                <Square size={16} /> Stop
              </Button>
            </>
          )}
        </div>
        <p className="mt-6 text-center text-sm text-muted">Finishing a focus block earns XP. Stopping early doesn’t cost you anything.</p>
      </Card>

      <div className="min-w-0 space-y-4">
        <Card className="p-5">
          <h2 className="font-display font-semibold">Today</h2>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Mini label="Blocks today" value={todaySessions} />
            <Mini label="Focused minutes" value={Math.round(todayMinutes)} />
            <Mini label="All time" value={allTime} />
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-display font-semibold">Timer lengths</h2>
          <Choice label="Focus" options={WORK_OPTIONS} value={work} onPick={(w) => save(w, rest)} />
          <Choice label="Break" options={BREAK_OPTIONS} value={rest} onPick={(r) => save(work, r)} />
        </Card>

        <Card tone="sunken" className="p-5 text-sm leading-relaxed text-ink-2">
          <h2 className="font-display font-semibold text-ink">Why this works</h2>
          <p className="mt-2">
            Deciding to study for “a while” is vague, so it’s easy to put off. A timer turns it into one small, finished thing. The five-minute option is for days when even that feels like too much: an
            unfinished task tends to nag at you, so once you’ve started, carrying on is easier than stopping.
          </p>
          <p className="mt-2">Breaks matter too. Stand up, look away from the screen, and come back to a fresh block.</p>
        </Card>
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2.5">
      <p className="font-display text-xl font-semibold tabular">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

function Choice({ label, options, value, onPick }: { label: string; options: number[]; value: number; onPick: (n: number) => void }) {
  return (
    <fieldset className="mt-4">
      <legend className="text-sm text-ink-2">{label}</legend>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={value === o}
            onClick={() => onPick(o)}
            className={clsx(
              "h-9 rounded-lg border px-3 text-sm font-medium tabular transition-colors",
              value === o ? "border-ink bg-ink text-bg" : "border-line-strong bg-surface hover:border-ink",
            )}
          >
            {o} min
          </button>
        ))}
      </div>
    </fieldset>
  );
}
