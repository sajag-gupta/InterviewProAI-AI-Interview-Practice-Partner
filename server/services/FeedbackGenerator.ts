import type { AnswerEvaluation, AnswerMetrics, FeedbackData, JobRole, Message, SpeechSummary } from "@shared/schema";
import type { AiProvider, FeedbackNarrative } from "./ai/AiProvider";

export type AnsweredQuestion = {
  question: string;
  answer: string;
  evaluation: AnswerEvaluation;
  metrics: AnswerMetrics;
};

type Scores = Pick<FeedbackData, "communication" | "technicalDepth" | "problemSolving" | "confidence" | "overallScore">;

const DEPTH_SCORE = { shallow: 3, moderate: 6.5, deep: 9.5 } as const;
const COMPREHENSION_SCORE = { confused: 3, partial: 6.5, clear: 9.5 } as const;

const average = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;
const round1 = (value: number) => Math.round(value * 10) / 10;

/**
 * Scores are plain averages of the per-answer evaluations, so they are explainable:
 *  communication  = clarity
 *  technicalDepth = half answer quality, half depth
 *  problemSolving = half quality, half relevance
 *  confidence     = how well the candidate seemed to understand the question
 * Evaluations made while the AI was unavailable are skipped. Returns null if none are left.
 */
export function scoreAnswers(answers: AnsweredQuestion[]): Scores | null {
  const evals = answers.map((a) => a.evaluation).filter((e) => !e.fallback);
  if (evals.length === 0) return null;

  const communication = round1(average(evals.map((e) => e.clarity)));
  const technicalDepth = round1(average(evals.map((e) => (e.quality + DEPTH_SCORE[e.depth]) / 2)));
  const problemSolving = round1(average(evals.map((e) => (e.quality + e.relevance) / 2)));
  const confidence = round1(average(evals.map((e) => COMPREHENSION_SCORE[e.comprehensionLevel])));
  const overallScore = round1((communication + technicalDepth + problemSolving + confidence) / 4);
  return { communication, technicalDepth, problemSolving, confidence, overallScore };
}

const DIMENSION_LABELS: Record<keyof Omit<Scores, "overallScore">, string> = {
  communication: "Clear, well-structured communication",
  technicalDepth: "Depth of technical detail",
  problemSolving: "Relevant, practical problem solving",
  confidence: "Understanding of the questions asked",
};

/** Used only when the narrative call fails: derives wording from the numbers, never invents numbers. */
export function narrativeFromScores(scores: Scores): FeedbackNarrative {
  const ranked = (Object.keys(DIMENSION_LABELS) as (keyof typeof DIMENSION_LABELS)[]).sort((a, b) => scores[b] - scores[a]);
  return {
    strengths: ranked.slice(0, 2).map((k) => `${DIMENSION_LABELS[k]} (${scores[k]}/10)`),
    improvements: ranked.slice(-2).map((k) => `${DIMENSION_LABELS[k]} (${scores[k]}/10) needs work`),
    detailedFeedback: `Overall score ${scores.overallScore}/10, averaged over your answers. The written summary was unavailable, so this text is generated from your scores only.`,
  };
}

const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);

export function speechSummary(answers: AnsweredQuestion[]): SpeechSummary {
  const totalWords = answers.reduce((sum, a) => sum + a.metrics.words, 0);
  const fillers = answers.flatMap((a) => a.metrics.fillerWords);
  const counts = fillers.reduce<Record<string, number>>((acc, w) => ({ ...acc, [w]: (acc[w] ?? 0) + 1 }), {});
  return {
    avgWords: answers.length ? Math.round(totalWords / answers.length) : 0,
    fillersPer100Words: totalWords ? round1((fillers.length / totalWords) * 100) : 0,
    topFillers: Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([w]) => w),
    answersWithNumbersPct: pct(answers.filter((a) => a.metrics.hasNumbers).length, answers.length),
  };
}

/** Share of behavioral answers that contained each STAR part. Undefined when no answer was STAR-scored. */
export function starCoverage(answers: AnsweredQuestion[]): FeedbackData["starPct"] {
  const withStar = answers.map((a) => a.evaluation.star).filter((s) => s && (s.situation || s.task || s.action || s.result));
  if (withStar.length === 0) return undefined;
  const share = (key: "situation" | "task" | "action" | "result") => pct(withStar.filter((s) => s![key]).length, withStar.length);
  return { situation: share("situation"), task: share("task"), action: share("action"), result: share("result") };
}

export class FeedbackGenerator {
  constructor(private ai: AiProvider) {}

  async generateFeedback(history: Message[], role: JobRole, answers: AnsweredQuestion[]): Promise<FeedbackData> {
    const realAnswers = answers.filter((a) => a.answer.trim().length > 20);
    if (realAnswers.length < 2) return this.unscored("The interview ended before enough answers were given to score. Answer at least two questions to get a report.");

    const scores = scoreAnswers(answers);
    if (!scores) return this.unscored("The AI service was unavailable while your answers were evaluated, so no scores were produced.");

    const transcript = history.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");
    const scoreSummary = Object.entries(scores).map(([k, v]) => `${k} ${v}`).join(", ");
    const narrative = (await this.ai.writeNarrative(transcript, role, scoreSummary)) ?? narrativeFromScores(scores);

    return {
      ...scores,
      ...narrative,
      speech: speechSummary(answers),
      starPct: starCoverage(answers),
      questionSummaries: answers.map((a) => ({
        question: a.question,
        answer: a.answer,
        score: a.evaluation.fallback ? 0 : a.evaluation.quality,
        feedback: a.evaluation.comment ?? "",
        improvedAnswer: a.evaluation.improvedAnswer,
        star: a.evaluation.star,
        metrics: a.metrics,
      })),
    };
  }

  private unscored(note: string): FeedbackData {
    return { communication: 0, technicalDepth: 0, problemSolving: 0, confidence: 0, overallScore: 0, strengths: [], improvements: [], detailedFeedback: "", note, questionSummaries: [] };
  }
}
