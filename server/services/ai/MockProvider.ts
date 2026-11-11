import type { AnswerEvaluation, JobRole } from "@shared/schema";
import type { AiProvider, DocumentInsights, FeedbackNarrative, GeneratedQuestion, QuestionContext } from "./AiProvider";

const TECHNICAL = [
  "How would you debug a service that is suddenly slow in production?",
  "Walk me through how you would design a rate limiter.",
  "What trade-offs do you consider when choosing between SQL and NoSQL?",
  "How do you decide what to test and what to leave untested?",
];
const BEHAVIORAL = [
  "Tell me about a time you disagreed with a teammate. What happened?",
  "Describe a deadline you almost missed. What did you do?",
  "Tell me about a decision you made with incomplete information.",
  "Describe feedback that changed how you work.",
];

/** Deterministic stand-in for a model. Used for offline demos (AI_PROVIDER=mock) and tests. */
export class MockProvider implements AiProvider {
  async evaluateAnswer(answer: string): Promise<AnswerEvaluation> {
    const words = answer.trim().split(/\s+/).length;
    const has = (re: RegExp) => re.test(answer.toLowerCase());
    const depth = words < 12 ? "shallow" : words < 40 ? "moderate" : "deep";
    const quality = depth === "shallow" ? 3 : depth === "moderate" ? 6 : 8;
    return {
      quality,
      depth,
      clarity: Math.min(9, 4 + Math.floor(words / 10)),
      relevance: 7,
      isOffTopic: has(/\b(weather|football|movie)\b/),
      comprehensionLevel: words < 12 ? "partial" : "clear",
      needsFollowUp: words < 12,
      comment: words < 12 ? "Demo mode: add a concrete example and the result you got." : "Demo mode: good detail. Add a measurable outcome.",
      improvedAnswer: `Demo mode: ${answer.trim().slice(0, 160)}. As a result, we shipped on time and reduced errors by 20%.`,
      star: { situation: has(/\b(when|at my|in my)\b/), task: has(/\b(needed|goal|responsible)\b/), action: has(/\b(i built|i led|i fixed|i wrote|i decided)\b/), result: has(/\b(result|reduced|improved|\d+%)\b/) },
    };
  }

  async generateFollowUp(): Promise<string | null> {
    return "Can you give a specific example and tell me the outcome?";
  }

  async generateQuestion(ctx: QuestionContext): Promise<GeneratedQuestion | null> {
    const behavioral = ctx.config.interviewType === "behavioral" || (ctx.config.interviewType === "mixed" && ctx.questionNumber % 2 === 0);
    const bank = behavioral ? BEHAVIORAL : TECHNICAL;
    const fresh = bank.find((q) => !ctx.askedQuestions.includes(q)) ?? bank[ctx.questionNumber % bank.length];
    return { question: fresh, category: behavioral ? "Behavioral" : "Technical", difficulty: "Medium" };
  }

  async writeNarrative(_t: string, _r: JobRole, scoreSummary: string): Promise<FeedbackNarrative> {
    return {
      strengths: ["Answers stayed on topic", "Clear opening statements"],
      improvements: ["Add measurable results", "Name the trade-offs you considered"],
      detailedFeedback: `Demo mode summary. Scores: ${scoreSummary}.`,
      nextStep: "Rewrite your weakest answer using situation, action, result.",
    };
  }

  async extractDocuments(): Promise<DocumentInsights> {
    return { requiredSkills: ["Communication", "System design"], keyResponsibilities: ["Ship features"], candidateStrengths: [], candidateWeaknesses: [] };
  }
}
