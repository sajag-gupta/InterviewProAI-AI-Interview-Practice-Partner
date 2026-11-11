import type { AnswerEvaluation, Dimension, InterviewConfig, JobRole, UserPattern } from "@shared/schema";
import { config } from "../../config";

export type GeneratedQuestion = {
  question: string;
  category: "Technical" | "Behavioral";
  difficulty: "Easy" | "Medium" | "Hard";
};

export type DocumentInsights = {
  requiredSkills: string[];
  keyResponsibilities: string[];
  candidateStrengths: string[];
  candidateWeaknesses: string[];
};

export type FeedbackNarrative = {
  strengths: string[];
  improvements: string[];
  detailedFeedback: string;
  nextStep?: string;
};

export type QuestionContext = {
  role: JobRole;
  candidateName: string;
  /** The last few turns, oldest first, as "role: text" lines. */
  conversation: string;
  /** Every question already asked in this interview, so the model never repeats one. */
  askedQuestions: string[];
  pattern: UserPattern;
  config: InterviewConfig;
  focusAreas: Dimension[];
  questionNumber: number;
};

/**
 * Everything the interview loop needs from a language model.
 * Gemini is the real implementation; Mock is deterministic for demos and tests.
 * Every method must fail soft: return a flagged evaluation or null, never throw and never invent content.
 */
export interface AiProvider {
  evaluateAnswer(answer: string, question: string, role: JobRole): Promise<AnswerEvaluation>;
  generateFollowUp(question: string, answer: string, role: JobRole): Promise<string | null>;
  generateQuestion(ctx: QuestionContext): Promise<GeneratedQuestion | null>;
  writeNarrative(transcript: string, role: JobRole, scoreSummary: string): Promise<FeedbackNarrative | null>;
  extractDocuments(jd: string, resume: string): Promise<DocumentInsights | null>;
}

export async function createAiProvider(): Promise<AiProvider> {
  if (config.AI_PROVIDER === "mock") return new (await import("./MockProvider")).MockProvider();
  const { GeminiProvider } = await import("./GeminiProvider");
  return new GeminiProvider();
}
