import "server-only";
import fs from "node:fs";
import path from "node:path";
import type {
  Cert,
  Domain,
  FlashcardRef,
  Flashcard,
  Insights,
  Lesson,
  LessonRef,
  Question,
  QuestionRef,
  Resource,
  StudyPlan,
} from "./content-types";

const CONTENT_ROOT = path.join(process.cwd(), "content");
const SAMPLE_ROOT = path.join(CONTENT_ROOT, "_sample");

/** CONTENT_DIR overrides; otherwise real content wins whenever content/certs.json exists, else the fixtures. */
function root(): string {
  if (process.env.CONTENT_DIR) return path.resolve(process.env.CONTENT_DIR);
  return fs.existsSync(path.join(CONTENT_ROOT, "certs.json")) ? CONTENT_ROOT : SAMPLE_ROOT;
}

export function usingSampleContent(): boolean {
  return root() === SAMPLE_ROOT;
}

// Files are re-read only when their mtime changes, so content edited by
// other tools shows up without restarting the server.
const cache = new Map<string, { mtime: number; data: unknown }>();

function readJson<T>(rel: string, fallback: T): T {
  const file = path.join(root(), rel);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(file);
  } catch {
    return fallback;
  }
  const hit = cache.get(file);
  if (hit && hit.mtime === stat.mtimeMs) return hit.data as T;
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8")) as T;
    cache.set(file, { mtime: stat.mtimeMs, data });
    return data;
  } catch (err) {
    console.warn(`[content] could not parse ${file}:`, (err as Error).message);
    return hit ? (hit.data as T) : fallback;
  }
}

export function getCerts(): Cert[] {
  const certs = readJson<Cert[]>("certs.json", []);
  return Array.isArray(certs) ? certs.filter((c) => c && c.id && Array.isArray(c.domains)) : [];
}

export function getCert(certId: string): Cert | undefined {
  return getCerts().find((c) => c.id === certId);
}

export function getDomain(certId: string, domainId: string): Domain | undefined {
  return getCert(certId)?.domains.find((d) => d.id === domainId);
}

export function getLessons(certId: string, domainId: string): LessonRef[] {
  const file = readJson<{ lessons?: Lesson[] }>(`modules/${certId}/${domainId}.json`, {});
  return (file.lessons ?? []).map((l) => ({
    ...l,
    keyTakeaways: l.keyTakeaways ?? [],
    examTips: l.examTips ?? [],
    commonTraps: l.commonTraps ?? [],
    resources: l.resources ?? [],
    taskStatementIds: l.taskStatementIds ?? [],
    certId,
    domainId,
  }));
}

export function getCertLessons(certId: string): LessonRef[] {
  const cert = getCert(certId);
  if (!cert) return [];
  return cert.domains.flatMap((d) => getLessons(certId, d.id));
}

export function getLesson(certId: string, lessonId: string): LessonRef | undefined {
  return getCertLessons(certId).find((l) => l.id === lessonId);
}

export function getAllLessons(): LessonRef[] {
  return getCerts().flatMap((c) => getCertLessons(c.id));
}

/** `{domainId}.json` plus any `{domainId}.part-N.json` batch files in that folder, in name order. */
function questionFiles(certId: string, domainId: string): string[] {
  const dir = path.join(root(), "questions", certId);
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const partRe = new RegExp(`^${domainId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.part-(\\d+)\\.json$`);
  const parts = names
    .map((n) => ({ n, m: partRe.exec(n) }))
    .filter((x): x is { n: string; m: RegExpExecArray } => !!x.m)
    .sort((a, b) => Number(a.m[1]) - Number(b.m[1]))
    .map((x) => x.n);
  const main = names.includes(`${domainId}.json`) ? [`${domainId}.json`] : [];
  return [...main, ...parts].map((n) => `questions/${certId}/${n}`);
}

export function getQuestions(certId: string, domainId: string): QuestionRef[] {
  const seen = new Set<string>();
  const all: Question[] = [];
  for (const rel of questionFiles(certId, domainId)) {
    const file = readJson<{ questions?: Question[] }>(rel, {});
    for (const q of Array.isArray(file.questions) ? file.questions : []) {
      if (!q || !q.id || seen.has(q.id)) continue;
      seen.add(q.id);
      all.push(q);
    }
  }
  return all
    .filter((q) => q && q.id && Array.isArray(q.options) && Array.isArray(q.correct) && q.correct.length > 0)
    .map((q) => ({ ...q, whyWrong: q.whyWrong ?? {}, tags: q.tags ?? [], sourceRefs: q.sourceRefs ?? [], certId, domainId }));
}

export function getCertQuestions(certId: string): QuestionRef[] {
  const cert = getCert(certId);
  if (!cert) return [];
  return cert.domains.flatMap((d) => getQuestions(certId, d.id));
}

export function getAllQuestions(): QuestionRef[] {
  return getCerts().flatMap((c) => getCertQuestions(c.id));
}

export function getQuestionMap(): Map<string, QuestionRef> {
  return new Map(getAllQuestions().map((q) => [q.id, q]));
}

export function getQuestion(id: string): QuestionRef | undefined {
  return getQuestionMap().get(id);
}

export function getFlashcards(certId: string, domainId: string): FlashcardRef[] {
  const file = readJson<{ cards?: Flashcard[] }>(`flashcards/${certId}/${domainId}.json`, {});
  return (file.cards ?? []).map((c) => ({ ...c, tags: c.tags ?? [], certId, domainId }));
}

export function getCertFlashcards(certId: string): FlashcardRef[] {
  const cert = getCert(certId);
  if (!cert) return [];
  return cert.domains.flatMap((d) => getFlashcards(certId, d.id));
}

export function getResources(): Resource[] {
  const list = readJson<Resource[]>("resources.json", []);
  return Array.isArray(list) ? list.map((r) => ({ ...r, certIds: r.certIds ?? [], domainIds: r.domainIds ?? [] })) : [];
}

export function getInsights(): Insights {
  const data = readJson<Partial<Insights>>("insights.json", {});
  return {
    candidateReports: data.candidateReports ?? [],
    mindsetPrinciples: data.mindsetPrinciples ?? [],
    examDayChecklist: data.examDayChecklist ?? [],
    commonMistakes: data.commonMistakes ?? [],
  };
}

export function getStudyPlans(): StudyPlan[] {
  const list = readJson<StudyPlan[]>("study-plans.json", []);
  return Array.isArray(list) ? list : [];
}
