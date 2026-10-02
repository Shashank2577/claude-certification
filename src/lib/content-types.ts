// Types mirroring CONTENT_SCHEMA.md. Safe to import from client components.

export type CertId = string;

export interface TaskStatement {
  id: string;
  text: string;
}

export interface Domain {
  id: string;
  name: string;
  weight: number;
  summary: string;
  color: string;
  taskStatements: TaskStatement[];
}

export interface ExamInfo {
  questionCount: number;
  durationMinutes: number;
  passingScore: number;
  scoreScale: string;
  format?: string;
  delivery?: string;
  cost?: string;
  prerequisites?: string;
  retakePolicy?: string;
  sourceUrl?: string;
  verified?: boolean;
  notes?: string;
}

export interface Scenario {
  id: string;
  title: string;
  description: string;
}

export interface Cert {
  id: CertId;
  name: string;
  tagline: string;
  description: string;
  examInfo: ExamInfo;
  domains: Domain[];
  scenarios?: Scenario[];
}

export type ResourceType = "docs" | "video" | "blog" | "repo" | "course" | "community";

export interface LessonResource {
  title: string;
  url: string;
  type: ResourceType;
}

export interface Lesson {
  id: string;
  title: string;
  estMinutes: number;
  level: "core" | "deep";
  taskStatementIds: string[];
  eli5: string;
  body: string;
  visualId?: string;
  keyTakeaways: string[];
  examTips: string[];
  commonTraps: string[];
  resources: LessonResource[];
}

/** Lesson with its location attached by the loader. */
export interface LessonRef extends Lesson {
  certId: CertId;
  domainId: string;
}

export interface QuestionOption {
  id: string;
  text: string;
}

export interface Question {
  id: string;
  taskStatementId: string;
  scenario?: string;
  stem: string;
  options: QuestionOption[];
  correct: string[];
  explanation: string;
  whyWrong: Record<string, string>;
  difficulty: 1 | 2 | 3;
  mindset: string;
  tags: string[];
  sourceRefs: string[];
}

export interface QuestionRef extends Question {
  certId: CertId;
  domainId: string;
}

/** What the client sees before answering: no answers or explanations. */
export interface PublicQuestion {
  id: string;
  certId: CertId;
  domainId: string;
  taskStatementId: string;
  scenario?: string;
  stem: string;
  options: QuestionOption[];
  choose: number;
  difficulty: 1 | 2 | 3;
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  tags: string[];
}

export interface FlashcardRef extends Flashcard {
  certId: CertId;
  domainId: string;
}

export interface Resource {
  id: string;
  title: string;
  url: string;
  type: ResourceType;
  certIds: CertId[];
  domainIds: string[];
  description: string;
  priority: "must" | "should" | "nice";
  verified: boolean;
  estMinutes: number;
}

export interface Insights {
  candidateReports: { source: string; url: string; cert: string; summary: string; tips: string[] }[];
  mindsetPrinciples: { id: string; title: string; body: string; example: string }[];
  examDayChecklist: string[];
  commonMistakes: string[];
}

export type PlanBlockKind = "lesson" | "quiz" | "flashcards" | "mock" | "review" | "resource";

export interface PlanBlock {
  kind: PlanBlockKind;
  refId: string | null;
  title: string;
  minutes: number;
}

export interface PlanDay {
  day: number;
  title: string;
  blocks: PlanBlock[];
}

export interface StudyPlan {
  id: string;
  title: string;
  certId: CertId;
  description: string;
  days: PlanDay[];
}

export function toPublicQuestion(q: QuestionRef): PublicQuestion {
  return {
    id: q.id,
    certId: q.certId,
    domainId: q.domainId,
    taskStatementId: q.taskStatementId,
    scenario: q.scenario,
    stem: q.stem,
    options: q.options,
    choose: q.correct.length,
    difficulty: q.difficulty,
  };
}
