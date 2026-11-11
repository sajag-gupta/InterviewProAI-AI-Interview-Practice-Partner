import { describe, expect, it } from "vitest";
import type { AnswerEvaluation } from "@shared/schema";
import { startInterviewSchema } from "@shared/schema";
import { analyzeAnswer } from "../../server/services/speechStats";
import { parseCommand } from "../../server/services/InterviewOrchestrator";
import { narrativeFromScores, scoreAnswers, type AnsweredQuestion } from "../../server/services/FeedbackGenerator";
import { PatternDetector } from "../../server/services/PatternDetector";

const evaluation = (overrides: Partial<AnswerEvaluation> = {}): AnswerEvaluation => ({
  quality: 8,
  depth: "deep",
  clarity: 8,
  relevance: 8,
  isOffTopic: false,
  comprehensionLevel: "clear",
  needsFollowUp: false,
  ...overrides,
});

const answered = (e: AnswerEvaluation): AnsweredQuestion => ({ question: "q", answer: "a long enough answer here", evaluation: e, metrics: analyzeAnswer("a long enough answer here") });

describe("parseCommand", () => {
  it("handles slash commands", () => {
    expect(parseCommand("/end")).toEqual({ name: "end" });
    expect(parseCommand("/feedback")).toEqual({ name: "feedback" });
    expect(parseCommand("/change role PM")).toEqual({ name: "change role", role: "PM" });
    expect(parseCommand("/change role astronaut")).toEqual({ name: "change role", role: undefined });
    expect(parseCommand("/skip")).toEqual({ name: "skip" });
    expect(parseCommand("/unknown")).toBeNull();
  });

  it("handles short spoken phrases", () => {
    expect(parseCommand("Please end the interview")).toEqual({ name: "end" });
    expect(parseCommand("I'm done")).toEqual({ name: "end" });
    expect(parseCommand("how did I do")).toEqual({ name: "feedback" });
    expect(parseCommand("skip this question")).toEqual({ name: "skip" });
  });

  it("treats long sentences as answers, not commands", () => {
    expect(parseCommand("I'm done with the migration project and then I moved on to the billing team")).toBeNull();
    expect(parseCommand("I would say yes, and then I would continue")).toBeNull();
  });
});

describe("scoreAnswers", () => {
  it("averages the evaluations into explainable scores", () => {
    const scores = scoreAnswers([answered(evaluation({ clarity: 6 })), answered(evaluation({ clarity: 8 }))]);
    expect(scores?.communication).toBe(7);
    expect(scores?.overallScore).toBeGreaterThan(0);
    expect(scores?.overallScore).toBeLessThanOrEqual(10);
  });

  it("ignores evaluations made while the AI was unavailable", () => {
    expect(scoreAnswers([answered(evaluation({ fallback: true }))])).toBeNull();
    const scores = scoreAnswers([answered(evaluation({ fallback: true, clarity: 1 })), answered(evaluation({ clarity: 9 }))]);
    expect(scores?.communication).toBe(9);
  });

  it("scores weak answers lower than strong ones", () => {
    const strong = scoreAnswers([answered(evaluation())])!;
    const weak = scoreAnswers([answered(evaluation({ quality: 2, depth: "shallow", clarity: 3, relevance: 3, comprehensionLevel: "confused" }))])!;
    expect(weak.overallScore).toBeLessThan(strong.overallScore);
  });

  it("builds a fallback narrative from the numbers only", () => {
    const text = narrativeFromScores(scoreAnswers([answered(evaluation())])!);
    expect(text.strengths).toHaveLength(2);
    expect(text.detailedFeedback).toContain("generated from your scores");
  });
});

describe("PatternDetector", () => {
  it("stays unknown with fewer than two answers", () => {
    const detector = new PatternDetector();
    detector.addSignal(evaluation(), 5, "hello there");
    expect(detector.getPattern().pattern).toBe("unknown");
  });

  it("flags very short answers", () => {
    const detector = new PatternDetector();
    detector.addSignal(evaluation({ clarity: 4 }), 5, "yes");
    detector.addSignal(evaluation({ clarity: 4 }), 5, "no");
    expect(detector.getPattern().pattern).toBe("edge_case");
  });
});

describe("startInterviewSchema", () => {
  const config = { duration: 5, interviewType: "mixed", answerTimeLimitSeconds: 60, experienceLevel: "mid" };

  it("accepts a valid payload", () => {
    expect(startInterviewSchema.safeParse({ role: "SDE", mode: "chat", config }).success).toBe(true);
  });

  it("rejects an unknown role or bad config", () => {
    expect(startInterviewSchema.safeParse({ role: "Wizard", mode: "chat", config }).success).toBe(false);
    expect(startInterviewSchema.safeParse({ role: "SDE", mode: "chat", config: { ...config, duration: 7 } }).success).toBe(false);
  });
});

describe("analyzeAnswer", () => {
  it("counts words, fillers and numbers deterministically", () => {
    const m = analyzeAnswer("Um, I basically cut latency by 40 percent, you know, with caching");
    expect(m.words).toBe(12);
    expect(m.fillerWords).toEqual(["um", "basically", "you know"]);
    expect(m.hasNumbers).toBe(true);
  });

  it("does not flag normal words that merely contain a filler", () => {
    expect(analyzeAnswer("The umbrella and the user were fine").fillers).toBe(0);
  });
});
