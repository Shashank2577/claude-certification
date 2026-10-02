"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { clsx } from "clsx";
import { Brain, Crosshair, Flag, Layers, ListChecks, Loader2, RotateCcw, Sparkles, Timer, X } from "lucide-react";
import type { PublicQuestion } from "@/lib/content-types";
import type { AnswerFeedback, PracticeMode } from "@/lib/quiz-types";
import { answerQuestion, finishPractice, startPractice, toggleFlag } from "@/app/actions/practice";
import { useCelebrate } from "@/components/celebrate";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ProgressBar, Ring } from "@/components/ui/progress";
import { NumberTicker } from "@/components/ui/number-ticker";
import { QuestionCard } from "@/components/quiz/question-card";

interface DomainInfo {
  id: string;
  name: string;
  color: string;
  weight: number;
  mastery: number;
  attempts: number;
  accuracy: number | null;
  questionCount: number;
  tasks: { id: string; text: string; count: number }[];
}

interface Config {
  mode: PracticeMode;
  domainId?: string;
  taskId?: string;
  count: number;
}

interface Result {
  questionId: string;
  domainId: string;
  correct: boolean;
}

const MODE_CARDS: { mode: PracticeMode; title: string; body: string; icon: typeof Brain }[] = [
  { mode: "adaptive", title: "Smart mix", body: "Weighted toward weak domains, new questions and past misses.", icon: Sparkles },
  { mode: "weak", title: "Weak areas", body: "Only your lowest-mastery domains.", icon: Crosshair },
  { mode: "domain", title: "One domain", body: "Drill a single domain end to end.", icon: Layers },
  { mode: "task", title: "One task statement", body: "Zoom into a single exam objective.", icon: ListChecks },
  { mode: "mistakes", title: "Mistakes only", body: "Questions you got wrong last time.", icon: RotateCcw },
  { mode: "flagged", title: "Flagged", body: "Questions you marked to revisit.", icon: Flag },
];

const COUNTS = [5, 10, 20];

export function PracticeClient({
  certId,
  domains,
  counts,
  flaggedIds,
  autoStart,
}: {
  certId: string;
  domains: DomainInfo[];
  counts: { total: number; mistakes: number; flagged: number; unseen: number };
  flaggedIds: string[];
  autoStart: { mode: PracticeMode; domainId?: string; taskId?: string } | null;
}) {
  const router = useRouter();
  const [config, setConfig] = useState<Config>(() => ({
    mode: autoStart?.mode ?? "adaptive",
    domainId: autoStart?.domainId ?? domains[0]?.id,
    taskId: autoStart?.taskId ?? domains[0]?.tasks[0]?.id,
    count: 10,
  }));
  const [session, setSession] = useState<{ id: string; questions: PublicQuestion[]; config: Config } | null>(null);
  const [summary, setSummary] = useState<{ results: Result[]; xp: number; config: Config } | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flagged, setFlagged] = useState<string[]>(flaggedIds);

  const start = useCallback(
    async (c: Config) => {
      setStarting(true);
      setError(null);
      const res = await startPractice({ ...c, certId }).catch(() => ({ error: "Couldn't start a session. Check your connection." }));
      setStarting(false);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setSummary(null);
      setSession({ id: res.sessionId, questions: res.questions, config: c });
      window.scrollTo({ top: 0 });
    },
    [certId],
  );

  const auto = useRef(false);
  useEffect(() => {
    if (autoStart && !auto.current) {
      auto.current = true;
      void start({ mode: autoStart.mode, domainId: autoStart.domainId ?? domains[0]?.id, taskId: autoStart.taskId, count: 10 });
    }
  }, [autoStart, start, domains]);

  if (session) {
    return (
      <Session
        key={session.id}
        sessionId={session.id}
        questions={session.questions}
        domains={domains}
        flagged={flagged}
        onFlagChange={(id, f) => setFlagged((list) => (f ? [...new Set([...list, id])] : list.filter((x) => x !== id)))}
        onDone={(results, xp) => {
          setSummary({ results, xp, config: session.config });
          setSession(null);
          window.scrollTo({ top: 0 });
          router.refresh();
        }}
      />
    );
  }

  if (summary) {
    return (
      <Summary
        results={summary.results}
        xp={summary.xp}
        domains={domains}
        starting={starting}
        error={error}
        onAgain={() => start(summary.config)}
        onMistakes={() => start({ mode: "mistakes", count: 10 })}
        onSetup={() => setSummary(null)}
      />
    );
  }

  const disabledReason = (m: PracticeMode): string | null => {
    if (m === "mistakes" && counts.mistakes === 0) return "No mistakes to review yet";
    if (m === "flagged" && counts.flagged === 0) return "Nothing flagged yet";
    return null;
  };
  const selectedDomain = domains.find((d) => d.id === config.domainId) ?? domains[0];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        {autoStart && starting ? (
          <p className="mb-4 flex items-center gap-2 text-ink-2">
            <Loader2 size={16} className="animate-spin" /> Building your set…
          </p>
        ) : null}
        <fieldset>
          <legend className="font-display text-lg font-semibold">What do you want to practise?</legend>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {MODE_CARDS.map(({ mode, title, body, icon: Icon }) => {
              const reason = disabledReason(mode);
              const on = config.mode === mode;
              const badge = mode === "mistakes" ? counts.mistakes : mode === "flagged" ? counts.flagged : null;
              return (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={on}
                  disabled={!!reason}
                  onClick={() => setConfig((c) => ({ ...c, mode }))}
                  className={clsx(
                    "flex items-start gap-3 rounded-2xl border p-4 text-left transition-[border-color,box-shadow,background-color] disabled:cursor-not-allowed disabled:opacity-55",
                    on ? "border-ink bg-surface shadow-card" : "border-line bg-surface/60 hover:border-line-strong",
                  )}
                >
                  <Icon size={20} className={on ? "mt-0.5 text-accent-text" : "mt-0.5 text-muted"} />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 font-display font-semibold">
                      {title}
                      {badge ? <span className="rounded-full bg-surface-2 px-2 text-xs font-medium text-ink-2 tabular">{badge}</span> : null}
                    </span>
                    <span className="mt-0.5 block text-sm text-ink-2">{reason ?? body}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <AnimatePresence initial={false}>
          {config.mode === "domain" || config.mode === "task" ? (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                  Domain
                  <select
                    value={config.domainId}
                    onChange={(e) => {
                      const d = domains.find((x) => x.id === e.target.value);
                      setConfig((c) => ({ ...c, domainId: e.target.value, taskId: d?.tasks[0]?.id }));
                    }}
                    className="mt-1.5 block h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-ink"
                  >
                    {domains.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.questionCount})
                      </option>
                    ))}
                  </select>
                </label>
                {config.mode === "task" ? (
                  <label className="block text-sm font-medium">
                    Task statement
                    <select
                      value={config.taskId}
                      onChange={(e) => setConfig((c) => ({ ...c, taskId: e.target.value }))}
                      className="mt-1.5 block h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-ink"
                    >
                      {selectedDomain?.tasks.map((t) => (
                        <option key={t.id} value={t.id} disabled={t.count === 0}>
                          {t.id}: {t.text.length > 60 ? `${t.text.slice(0, 60)}…` : t.text} ({t.count})
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <fieldset className="mt-6">
          <legend className="text-sm font-medium">Questions</legend>
          <div className="mt-2 flex gap-2">
            {COUNTS.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={config.count === n}
                onClick={() => setConfig((c) => ({ ...c, count: n }))}
                className={clsx(
                  "h-10 min-w-14 rounded-xl border px-4 font-display font-semibold tabular transition-colors",
                  config.count === n ? "border-ink bg-ink text-bg" : "border-line-strong bg-surface hover:border-ink",
                )}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="mt-2 text-sm text-muted">About {Math.round(config.count * 1.2)} minutes.</p>
        </fieldset>

        {error ? (
          <p role="alert" className="mt-5 rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">
            {error}
          </p>
        ) : null}
        <Button size="lg" variant="accent" className="mt-6 w-full sm:w-auto" onClick={() => start(config)} disabled={starting}>
          {starting ? <Loader2 size={18} className="animate-spin" /> : null}
          Start practice
        </Button>
      </div>

      <aside className="space-y-4">
        <Card className="p-5">
          <CardHeader title="Your bank" sub={`${counts.total} questions`} />
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              ["Unseen", counts.unseen],
              ["To retry", counts.mistakes],
              ["Flagged", counts.flagged],
            ].map(([k, v]) => (
              <div key={k as string} className="rounded-xl bg-surface-2/70 px-2 py-3">
                <dd className="font-display text-xl font-semibold tabular">{v}</dd>
                <dt className="text-xs text-muted">{k}</dt>
              </div>
            ))}
          </dl>
        </Card>
        <Card className="p-5">
          <CardHeader title="Mastery by domain" sub="Recent answers count more" />
          <ul className="mt-4 space-y-4">
            {domains.map((d) => (
              <li key={d.id}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate font-medium">{d.name}</span>
                  <span className="shrink-0 text-muted tabular">{d.attempts ? `${Math.round(d.mastery * 100)}%` : "No data"}</span>
                </div>
                <ProgressBar className="mt-1.5" value={d.attempts ? d.mastery : 0} color={d.color} label={`${d.name} mastery`} height={6} />
              </li>
            ))}
          </ul>
        </Card>
      </aside>
    </div>
  );
}

function Session({
  sessionId,
  questions,
  domains,
  flagged,
  onFlagChange,
  onDone,
}: {
  sessionId: string;
  questions: PublicQuestion[];
  domains: DomainInfo[];
  flagged: string[];
  onFlagChange: (id: string, flagged: boolean) => void;
  onDone: (results: Result[], xp: number) => void;
}) {
  const { celebrate } = useCelebrate();
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [xp, setXp] = useState(0);
  const [pending, setPending] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flags, setFlags] = useState(() => new Set(flagged));
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);

  const q = questions[index];
  const domainName = domains.find((d) => d.id === q?.domainId)?.name;

  useEffect(() => {
    startedAt.current = Date.now();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the per-question clock
    setElapsed(0);
  }, [index]);
  useEffect(() => {
    if (feedback) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [feedback, index]);

  const submit = async () => {
    if (pending || feedback || selected.length === 0) return;
    setPending(true);
    setError(null);
    const res = await answerQuestion({ questionId: q.id, selected, ms: Date.now() - startedAt.current, mode: "practice", sessionId }).catch(() => ({
      error: "Couldn't save your answer. Check your connection and try again.",
    }));
    setPending(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setFeedback(res);
    setResults((r) => [...r, { questionId: q.id, domainId: q.domainId, correct: res.correct }]);
    setXp((x) => x + (res.reward?.xp ?? 0));
    celebrate(res.reward, { refresh: false });
  };

  const finish = async (final: Result[]) => {
    setFinishing(true);
    const reward = await finishPractice(sessionId).catch(() => null);
    celebrate(reward, { refresh: false });
    onDone(final, xp + (reward?.xp ?? 0));
  };

  const next = () => {
    if (!feedback) return;
    if (index >= questions.length - 1) {
      void finish(results);
      return;
    }
    setFeedback(null);
    setSelected([]);
    setIndex((i) => i + 1);
  };

  const onFlag = (f: boolean) => {
    setFlags((s) => {
      const n = new Set(s);
      if (f) n.add(q.id);
      else n.delete(q.id);
      return n;
    });
    onFlagChange(q.id, f);
    void toggleFlag(q.id, f);
  };

  if (!q) return null;
  const answered = results.length;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex items-center gap-4">
        <ProgressBar value={answered / questions.length} label="Session progress" className="flex-1" color="var(--ink)" height={6} />
        <span className="text-sm text-muted tabular">
          {index + 1}/{questions.length}
        </span>
        <span className="flex items-center gap-1 text-sm text-muted tabular" aria-label={`${elapsed} seconds on this question`}>
          <Timer size={14} /> {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
        </span>
        <Button variant="ghost" size="sm" onClick={() => (answered > 0 ? finish(results) : onDone([], 0))} disabled={finishing}>
          <X size={15} /> End
        </Button>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={q.id} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
          <QuestionCard
            question={q}
            selected={selected}
            onSelect={setSelected}
            feedback={feedback}
            onSubmit={submit}
            onNext={next}
            flagged={flags.has(q.id)}
            onFlag={onFlag}
            keyboard
            label={`Question ${index + 1}`}
            domainName={domainName}
          />
        </motion.div>
      </AnimatePresence>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-bad">
          {error}
        </p>
      ) : null}

      <div className="mt-5 flex items-center justify-between gap-3">
        <p className="hidden text-sm text-muted sm:block">
          Keys: {q.options.length > 0 ? `1–${q.options.length}` : ""} to choose, Enter to {feedback ? "continue" : "check"}
        </p>
        {feedback ? (
          <Button size="lg" onClick={next} disabled={finishing} data-autofocus>
            {finishing ? <Loader2 size={18} className="animate-spin" /> : null}
            {index < questions.length - 1 ? "Next question" : "Finish"}
          </Button>
        ) : (
          <Button size="lg" onClick={submit} disabled={selected.length === 0 || pending} className="ml-auto">
            {pending ? <Loader2 size={18} className="animate-spin" /> : null}
            Check answer
          </Button>
        )}
      </div>
    </div>
  );
}

function Summary({
  results,
  xp,
  domains,
  starting,
  error,
  onAgain,
  onMistakes,
  onSetup,
}: {
  results: Result[];
  xp: number;
  domains: DomainInfo[];
  starting: boolean;
  error: string | null;
  onAgain: () => void;
  onMistakes: () => void;
  onSetup: () => void;
}) {
  const right = results.filter((r) => r.correct).length;
  const acc = results.length ? right / results.length : 0;
  const byDomain = domains
    .map((d) => {
      const rs = results.filter((r) => r.domainId === d.id);
      return { ...d, n: rs.length, c: rs.filter((r) => r.correct).length };
    })
    .filter((d) => d.n > 0);
  const missed = results.length - right;
  const headline =
    results.length === 0 ? "No answers this time" : acc === 1 ? "Clean sheet" : acc >= 0.8 ? "Strong set" : acc >= 0.5 ? "Getting there" : "Good practice. The misses are the useful part.";

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-3xl">
      <Card className="p-6 sm:p-8">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
          <Ring value={acc} size={128} stroke={11} color={acc >= 0.7 ? "var(--good)" : "var(--accent)"} label={`${Math.round(acc * 100)} percent correct`}>
            <span>
              <span className="block font-display text-3xl font-semibold tabular">
                <NumberTicker value={Math.round(acc * 100)} />%
              </span>
              <span className="text-xs text-muted tabular">
                {right}/{results.length}
              </span>
            </span>
          </Ring>
          <div className="text-center sm:text-left">
            <h2 className="font-display text-2xl font-semibold tracking-tight">{headline}</h2>
            <p className="mt-1 text-ink-2">
              You earned <span className="font-semibold text-ink tabular">{xp} XP</span>.{" "}
              {missed > 0 ? `${missed} question${missed === 1 ? "" : "s"} went to your mistakes list for another go.` : "Nothing added to your mistakes list."}
            </p>
          </div>
        </div>

        {byDomain.length > 0 ? (
          <ul className="mt-8 space-y-3">
            {byDomain.map((d) => (
              <li key={d.id}>
                <div className="flex justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate font-medium">{d.name}</span>
                  <span className="text-muted tabular">
                    {d.c}/{d.n}
                  </span>
                </div>
                <ProgressBar className="mt-1.5" value={d.c / d.n} color={d.color} height={6} label={`${d.name}: ${d.c} of ${d.n}`} />
              </li>
            ))}
          </ul>
        ) : null}

        {error ? (
          <p role="alert" className="mt-5 rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">
            {error}
          </p>
        ) : null}
        <div className="mt-8 flex flex-wrap gap-2">
          <Button variant="accent" onClick={onAgain} disabled={starting}>
            {starting ? <Loader2 size={16} className="animate-spin" /> : null}
            Practise again
          </Button>
          {missed > 0 ? (
            <Button variant="outline" onClick={onMistakes} disabled={starting}>
              <RotateCcw size={16} /> Review mistakes
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onSetup}>
            Change settings
          </Button>
        </div>
      </Card>
    </motion.div>
  );
}
