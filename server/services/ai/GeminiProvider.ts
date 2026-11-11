import { GoogleGenAI } from "@google/genai";
import type { AnswerEvaluation, InterviewConfig, JobRole, UserPattern } from "@shared/schema";
import { ROLE_LABELS } from "@shared/schema";
import { config } from "../../config";
import type { AiProvider, DocumentInsights, FeedbackNarrative, GeneratedQuestion, QuestionContext } from "./AiProvider";

const PERSONA = `You are an experienced interviewer running a realistic mock interview.
Style: natural spoken English, warm but professional, one idea per turn, never more than 2 sentences before the question.
Do not flatter ("Great answer!") and do not repeat the candidate's answer back at length.
Never ask a question that was already asked. Ask about real situations the candidate would face on the job, not trivia.
If the candidate's last message looks garbled, cut off, or like a speech-recognition error, do not guess what they meant: ask them to repeat it.`;

const PATTERN_GUIDANCE: Record<UserPattern, string> = {
  confused: "The candidate seems hesitant or confused. Be supportive and ask a simpler, clearer question.",
  efficient: "The candidate is concise and clear. Move faster and ask a harder question.",
  chatty: "The candidate talks at length. Redirect politely with a specific, focused question.",
  edge_case: "The candidate gives very short or unrelated answers. Redirect politely to the interview.",
  unknown: "Pitch the question at a moderate level.",
};

const TYPE_GUIDANCE: Record<InterviewConfig["interviewType"], string> = {
  technical: "Ask only technical questions (code, systems, tools, design, debugging).",
  behavioral: "Ask only behavioral questions (teamwork, conflict, leadership, decisions).",
  mixed: "Mix technical and behavioral questions.",
  "rapid-fire": "Ask short, direct questions that can be answered in one or two sentences.",
};

const LEVEL_GUIDANCE: Record<InterviewConfig["experienceLevel"], string> = {
  entry: "Candidate level: entry (0-2 years). Focus on fundamentals and learning.",
  mid: "Candidate level: mid (2-5 years). Expect practical project experience.",
  senior: "Candidate level: senior (5-10 years). Expect design trade-offs and mentoring.",
  lead: "Candidate level: lead (10+ years). Expect strategy, people and cross-team impact.",
};

const FOCUS_HINT = {
  communication: "structuring answers clearly",
  technicalDepth: "giving technical depth and specifics",
  problemSolving: "walking through problem solving and trade-offs",
  confidence: "answering directly and with conviction",
} as const;

const clip = (text: string, max: number) => text.slice(0, max);
const score = (value: unknown) => Math.min(10, Math.max(0, Number(value) || 0));
const list = (value: unknown, max = 15) => (Array.isArray(value) ? value.map(String).slice(0, max) : []);

export class GeminiProvider implements AiProvider {
  private ai: GoogleGenAI;

  constructor() {
    if (!config.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set. Add it to .env, or set AI_PROVIDER=mock for the offline demo.");
    this.ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
  }

  /** The one place that talks to Gemini. Returns null on any failure so callers can fall back honestly. */
  private async ask(prompt: string, opts: { json: boolean; temperature?: number }): Promise<string | null> {
    try {
      const response = await this.ai.models.generateContent({
        model: config.GEMINI_MODEL,
        contents: prompt,
        config: {
          systemInstruction: PERSONA,
          temperature: opts.temperature ?? 0.7,
          responseMimeType: opts.json ? "application/json" : undefined,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });
      return response.text?.trim() || null;
    } catch (error) {
      console.error("[Gemini] request failed:", error instanceof Error ? error.message : error);
      return null;
    }
  }

  private async askJson<T>(prompt: string, temperature?: number): Promise<Partial<T> | null> {
    const text = await this.ask(prompt, { json: true, temperature });
    if (!text) return null;
    try {
      return JSON.parse(text) as Partial<T>;
    } catch {
      return null;
    }
  }

  async evaluateAnswer(answer: string, question: string, role: JobRole): Promise<AnswerEvaluation> {
    const parsed = await this.askJson<Record<string, any>>(
      `Score one answer from a ${ROLE_LABELS[role]} candidate. Be strict but fair. Return JSON with these keys:
quality (0-10), depth ("shallow" | "moderate" | "deep"), clarity (0-10), relevance (0-10),
isUnclear (true if the text is garbled, cut off, or looks like a transcription error so it cannot be judged fairly),
isOffTopic (true ONLY if completely unrelated to work or the question),
comprehensionLevel ("confused" | "partial" | "clear"),
needsFollowUp (true if too short, vague or incomplete),
star: {"situation": bool, "task": bool, "action": bool, "result": bool} (STAR parts present; all false for non-behavioral questions),
comment (one short sentence addressed to the candidate saying what to fix),
improvedAnswer (a stronger version of THEIR answer in first person, 2-4 sentences, using only facts they gave; never invent employers, names or numbers).

Question: "${clip(question, 300)}"
Answer: "${clip(answer, 1500)}"`,
      0.2,
    );

    if (!parsed || typeof parsed.quality !== "number") return this.fallbackEvaluation();

    const star = parsed.star && typeof parsed.star === "object" ? parsed.star : undefined;
    return {
      quality: score(parsed.quality),
      depth: parsed.depth === "shallow" || parsed.depth === "deep" ? parsed.depth : "moderate",
      clarity: score(parsed.clarity),
      relevance: score(parsed.relevance),
      isUnclear: parsed.isUnclear === true,
      isOffTopic: parsed.isOffTopic === true,
      comprehensionLevel: parsed.comprehensionLevel === "confused" || parsed.comprehensionLevel === "clear" ? parsed.comprehensionLevel : "partial",
      needsFollowUp: parsed.needsFollowUp === true,
      comment: typeof parsed.comment === "string" ? parsed.comment : undefined,
      improvedAnswer: typeof parsed.improvedAnswer === "string" ? parsed.improvedAnswer : undefined,
      star: star && { situation: star.situation === true, task: star.task === true, action: star.action === true, result: star.result === true },
    };
  }

  /** Neutral evaluation used when the model is unavailable. Flagged so it is never scored. */
  private fallbackEvaluation(): AnswerEvaluation {
    return { quality: 5, depth: "moderate", clarity: 5, relevance: 5, isOffTopic: false, comprehensionLevel: "partial", needsFollowUp: false, fallback: true };
  }

  async generateFollowUp(question: string, answer: string, role: JobRole): Promise<string | null> {
    return this.ask(
      `The ${ROLE_LABELS[role]} candidate's answer was short or incomplete. Ask ONE specific follow-up that digs into the part they skipped. Under 160 characters. Output only the question.

Question you asked: "${clip(question, 250)}"
Their answer: "${clip(answer, 400)}"`,
      { json: false },
    );
  }

  async generateQuestion(ctx: QuestionContext): Promise<GeneratedQuestion | null> {
    const { config: cfg } = ctx;
    const background = [
      cfg.extractedSkills?.length && `Skills the job requires: ${cfg.extractedSkills.slice(0, 6).join(", ")}.`,
      cfg.extractedResponsibilities?.length && `Key responsibilities: ${cfg.extractedResponsibilities.slice(0, 3).join(", ")}.`,
      cfg.candidateStrengths?.length && `Resume strengths: ${cfg.candidateStrengths.slice(0, 3).join(", ")}.`,
      cfg.candidateWeaknesses?.length && `Resume gaps worth probing once: ${cfg.candidateWeaknesses.slice(0, 3).join(", ")}.`,
    ].filter(Boolean);
    const focus = ctx.focusAreas.length
      ? `This candidate has been weakest at ${ctx.focusAreas.map((d) => FOCUS_HINT[d]).join(" and ")}. Pick a question that exercises that.`
      : "";

    const parsed = await this.askJson<GeneratedQuestion>(`Interview for the ${ROLE_LABELS[ctx.role]} role. The candidate is ${ctx.candidateName}.
${PATTERN_GUIDANCE[ctx.pattern]}
${TYPE_GUIDANCE[cfg.interviewType]}
${LEVEL_GUIDANCE[cfg.experienceLevel]}
${background.join("\n")}
${focus}

Questions already asked (do not repeat or paraphrase):
${ctx.askedQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n") || "(none)"}

Recent conversation:
${ctx.conversation || "(start of interview)"}

Write the interviewer's next turn: at most one short sentence reacting to their last answer, then ONE new question. Under 250 characters in total.
Return JSON: {"question": "...", "category": "Technical" | "Behavioral", "difficulty": "Easy" | "Medium" | "Hard"}`);

    if (!parsed?.question) return null;
    return {
      question: parsed.question,
      category: parsed.category === "Behavioral" ? "Behavioral" : "Technical",
      difficulty: parsed.difficulty === "Easy" || parsed.difficulty === "Hard" ? parsed.difficulty : "Medium",
    };
  }

  /** The LLM only writes words here. The numeric scores are computed from the stored evaluations. */
  async writeNarrative(transcript: string, role: JobRole, scoreSummary: string): Promise<FeedbackNarrative | null> {
    const parsed = await this.askJson<FeedbackNarrative>(
      `You are reviewing a ${ROLE_LABELS[role]} mock interview.
Computed scores (0-10): ${scoreSummary}

Transcript:
${transcript.slice(-4000)}

Address the candidate as "you". Be specific to what they actually said.
Return JSON: {"strengths": [2-3 specific strengths], "improvements": [2-3 specific improvements], "detailedFeedback": "2-3 sentence summary consistent with the scores", "nextStep": "one concrete thing to practice next"}`,
      0.4,
    );

    if (!parsed || !Array.isArray(parsed.strengths) || !Array.isArray(parsed.improvements) || !parsed.detailedFeedback) return null;
    return {
      strengths: list(parsed.strengths, 4),
      improvements: list(parsed.improvements, 4),
      detailedFeedback: String(parsed.detailedFeedback),
      nextStep: typeof parsed.nextStep === "string" ? parsed.nextStep : undefined,
    };
  }

  async extractDocuments(jd: string, resume: string): Promise<DocumentInsights | null> {
    const parsed = await this.askJson<DocumentInsights>(
      `Analyze this job description and resume.
Return JSON: {"requiredSkills": [], "keyResponsibilities": [], "candidateStrengths": [], "candidateWeaknesses": []}

Job description:
${clip(jd, 4000)}

Resume:
${clip(resume, 4000)}`,
      0.2,
    );
    if (!parsed) return null;
    return {
      requiredSkills: list(parsed.requiredSkills),
      keyResponsibilities: list(parsed.keyResponsibilities),
      candidateStrengths: list(parsed.candidateStrengths),
      candidateWeaknesses: list(parsed.candidateWeaknesses),
    };
  }
}
