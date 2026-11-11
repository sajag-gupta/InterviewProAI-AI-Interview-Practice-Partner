import { z } from "zod";

// ---------- Interview setup ----------
export const JOB_ROLES = ["SDE", "DevOps", "Data Analyst", "BA", "PM", "Sales", "Support", "Retail"] as const;
export type JobRole = (typeof JOB_ROLES)[number];

export const ROLE_LABELS: Record<JobRole, string> = {
  SDE: "Software engineer",
  DevOps: "DevOps engineer",
  "Data Analyst": "Data analyst",
  BA: "Business analyst",
  PM: "Product manager",
  Sales: "Sales",
  Support: "Customer support",
  Retail: "Retail",
};

export type InterviewMode = "voice" | "chat";
export type InterviewType = "technical" | "behavioral" | "mixed" | "rapid-fire";
export type ExperienceLevel = "entry" | "mid" | "senior" | "lead";
export type InterviewDuration = 5 | 10 | 20 | "custom";
export type UserPattern = "confused" | "efficient" | "chatty" | "edge_case" | "unknown";

export const interviewConfigSchema = z.object({
  duration: z.union([z.literal(5), z.literal(10), z.literal(20), z.literal("custom")]),
  customDurationMinutes: z.number().int().min(5).max(120).optional(),
  interviewType: z.enum(["technical", "behavioral", "mixed", "rapid-fire"]),
  answerTimeLimitSeconds: z.number().int().min(10).max(600),
  experienceLevel: z.enum(["entry", "mid", "senior", "lead"]),
  focusOnWeakSpots: z.boolean().optional(),
  jdContent: z.string().max(20000).optional(),
  resumeContent: z.string().max(20000).optional(),
  extractedSkills: z.array(z.string()).max(30).optional(),
  extractedResponsibilities: z.array(z.string()).max(30).optional(),
  candidateStrengths: z.array(z.string()).max(30).optional(),
  candidateWeaknesses: z.array(z.string()).max(30).optional(),
});
export type InterviewConfig = z.infer<typeof interviewConfigSchema>;

export const startInterviewSchema = z.object({
  role: z.enum(JOB_ROLES),
  mode: z.enum(["voice", "chat"]),
  config: interviewConfigSchema,
});

export const sendMessageSchema = z.string().trim().min(1).max(5000);
export const extractDocumentsSchema = z.object({ jdText: z.string().max(20000), resumeText: z.string().max(20000) });

export const signupSchema = z.object({
  name: z.string().trim().min(1).max(60),
  email: z.string().trim().toLowerCase().email().max(120),
  password: z.string().min(8, "Use at least 8 characters").max(200),
});
export const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) });

// ---------- Live interview ----------
export type MessageRole = "user" | "assistant" | "system";

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date | string;
}

export interface Question {
  id: string;
  role: JobRole;
  category: "Technical" | "Behavioral";
  difficulty: "Easy" | "Medium" | "Hard";
  question: string;
}

export interface InterviewState {
  sessionId: string;
  role: JobRole;
  mode: InterviewMode;
  config: InterviewConfig;
  currentQuestion: number;
  elapsedTime: number;
  targetDurationSeconds: number;
  detectedPattern: UserPattern;
  patternConfidence: number;
  conversationHistory: Message[];
  isActive: boolean;
}

// ---------- Evaluation and report ----------
export interface StarCoverage {
  situation: boolean;
  task: boolean;
  action: boolean;
  result: boolean;
}

export interface AnswerEvaluation {
  quality: number;
  depth: "shallow" | "moderate" | "deep";
  clarity: number;
  relevance: number;
  isOffTopic: boolean;
  comprehensionLevel: "confused" | "partial" | "clear";
  needsFollowUp: boolean;
  isUnclear?: boolean;
  comment?: string;
  improvedAnswer?: string;
  star?: StarCoverage;
  fallback?: boolean;
}

export interface AnswerMetrics {
  words: number;
  fillers: number;
  fillerWords: string[];
  hasNumbers: boolean;
}

export interface PatternSignals {
  responseLength: number;
  responseTime: number;
  clarityScore: number;
  offTopicCount: number;
  questionAskedCount: number;
  technicalDepth: number;
}

export interface QuestionSummary {
  question: string;
  answer: string;
  score: number;
  feedback: string;
  improvedAnswer?: string;
  star?: StarCoverage;
  metrics?: AnswerMetrics;
}

export interface SpeechSummary {
  avgWords: number;
  fillersPer100Words: number;
  topFillers: string[];
  answersWithNumbersPct: number;
}

export interface FeedbackData {
  communication: number;
  technicalDepth: number;
  problemSolving: number;
  confidence: number;
  overallScore: number;
  strengths: string[];
  improvements: string[];
  detailedFeedback: string;
  nextStep?: string;
  note?: string;
  speech?: SpeechSummary;
  starPct?: { situation: number; task: number; action: number; result: number };
  questionSummaries: QuestionSummary[];
}

export const DIMENSIONS = ["communication", "technicalDepth", "problemSolving", "confidence"] as const;
export type Dimension = (typeof DIMENSIONS)[number];

// ---------- REST payloads ----------
export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export interface InterviewSummary {
  id: string;
  role: JobRole;
  mode: InterviewMode;
  interviewType: InterviewType;
  status: "active" | "completed" | "abandoned";
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  answers: number;
  overallScore: number | null;
}

export interface InterviewDetail extends InterviewSummary {
  config: InterviewConfig;
  messages: Message[];
  report: FeedbackData | null;
}

export interface DashboardStats {
  sessions: number;
  answers: number;
  practiceMinutes: number;
  averageScore: number | null;
  bestScore: number | null;
  trend: { id: string; date: string; score: number }[];
  dimensions: Record<Dimension, number> | null;
  focusAreas: Dimension[];
  recent: InterviewSummary[];
}

// ---------- Socket events ----------
export type ServerToClientEvents = {
  interview_started: (id: string) => void;
  interview_state: (state: InterviewState) => void;
  new_message: (message: Message) => void;
  pattern_detected: (pattern: UserPattern, confidence: number) => void;
  next_question: (question: Question) => void;
  feedback_ready: (feedback: FeedbackData, interviewId: string) => void;
  interview_ended: () => void;
  error: (error: string) => void;
  streaming_complete: () => void;
  interim_transcript: (text: string) => void;
  /** A finalized speech segment. The client appends it to the editable draft. */
  final_transcript: (text: string) => void;
  voice_ready: () => void;
};

export type ClientToServerEvents = {
  start_interview: (data: z.input<typeof startInterviewSchema>) => void;
  resume_interview: (id: string) => void;
  send_message: (message: string) => void;
  send_voice_transcript: (transcript: string) => void;
  execute_command: (command: "/change role" | "/end" | "/feedback" | "/skip", args?: { role?: string }) => void;
  request_feedback: () => void;
  start_voice_stream: () => void;
  audio_chunk: (audioData: ArrayBuffer) => void;
  stop_voice_stream: () => void;
};
