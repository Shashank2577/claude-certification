// Client-safe types shared by practice/mock actions and quiz components.
import type { Reward } from "./gamification";

export type PracticeMode = "adaptive" | "domain" | "task" | "weak" | "mistakes" | "flagged";

export interface AnswerFeedback {
  correct: boolean;
  correctIds: string[];
  explanation: string;
  whyWrong: Record<string, string>;
  mindset: string;
  /** Visual registry id, revealed with the explanation. */
  visualId?: string;
  reward: Reward | null;
}

export interface MockState {
  questionIds: string[];
  answers: Record<string, string[]>;
  flags: string[];
  /** Milliseconds spent per question id. */
  timeMs: Record<string, number>;
  currentIndex: number;
}

export interface MockDomainResult {
  domainId: string;
  name: string;
  weight: number;
  correct: number;
  total: number;
}
