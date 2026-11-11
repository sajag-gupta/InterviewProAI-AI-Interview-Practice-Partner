import { Server as SocketIOServer, Socket } from "socket.io";
import crypto from "node:crypto";
import {
  AuthUser,
  FeedbackData,
  ClientToServerEvents,
  InterviewState,
  JOB_ROLES,
  JobRole,
  Message,
  ROLE_LABELS,
  Question,
  ServerToClientEvents,
  sendMessageSchema,
  startInterviewSchema,
} from "@shared/schema";
import { interviews, messages as messageRepo, turns } from "../db";
import { PatternDetector } from "./PatternDetector";
import { AiProvider, createAiProvider } from "./ai/AiProvider";
import { AnsweredQuestion, FeedbackGenerator } from "./FeedbackGenerator";
import { DeepgramService } from "./DeepgramService";
import { analyzeAnswer } from "./speechStats";
import { focusAreasFor } from "./stats";

export type SocketData = { user: AuthUser };
export type InterviewSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export type Command = { name: "end" } | { name: "skip" } | { name: "feedback" } | { name: "change role"; role?: string };

/**
 * One parser for typed and spoken commands.
 * Slash commands always count. Spoken phrases only count in short utterances,
 * so "I'm done with that project, then I moved to..." is treated as an answer.
 */
export function parseCommand(text: string): Command | null {
  const t = text.trim().toLowerCase();

  if (t.startsWith("/")) {
    const [name, ...rest] = t.split(/\s+/);
    if (name === "/end") return { name: "end" };
    if (name === "/feedback") return { name: "feedback" };
    if (name === "/skip") return { name: "skip" };
    if (name === "/change" && rest[0] === "role") {
      const requested = rest.slice(1).join(" ");
      return { name: "change role", role: JOB_ROLES.find((r) => r.toLowerCase() === requested) };
    }
    return null;
  }

  if (t.split(/\s+/).length > 8) return null;
  if (/\b(end|stop|finish)( the| this)? (interview|session)\b|\b(i'?m|i am|we'?re|we are) done\b|\bthat'?s all\b|\blet'?s end\b/.test(t)) {
    return { name: "end" };
  }
  if (/\b(skip|next)( this| the)? question\b/.test(t)) return { name: "skip" };
  if (/\b(show|give)( me)?( my| the)? feedback\b|\bhow did i do\b/.test(t)) return { name: "feedback" };
  return null;
}

interface Session {
  id: string;
  state: InterviewState;
  patternDetector: PatternDetector;
  ai: AiProvider;
  feedbackGenerator: FeedbackGenerator;
  answers: AnsweredQuestion[];
  currentQuestionText: string;
  startTime: number;
  focusAreas: ReturnType<typeof focusAreasFor>;
  lastAnswerTime: number;
  targetDurationSeconds: number;
  timerInterval?: NodeJS.Timeout;
  hasAskedFollowUp: boolean;
  /** True when the last attempt to get a question from the AI failed. The next message retries it. */
  needsQuestion: boolean;
  busy: boolean;
}

const OPENING_QUESTION = "Can you tell me about yourself and your relevant experience?";

const makeMessage = (role: Message["role"], content: string): Message => ({
  id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  role,
  content,
  timestamp: new Date(),
});

export class InterviewOrchestrator {
  private sessions = new Map<string, Session>();
  private deepgram?: DeepgramService;

  constructor(private io: SocketIOServer<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>) {}

  /** Created on first voice use, so chat mode works without a Deepgram key. */
  private getDeepgram(): DeepgramService {
    return (this.deepgram ??= new DeepgramService());
  }

  /** Wraps a socket handler so one failure becomes an "error" event instead of a crashed process. */
  private safe<A extends unknown[]>(socket: InterviewSocket, handler: (...args: A) => Promise<void> | void) {
    return async (...args: A) => {
      try {
        await handler(...args);
      } catch (error) {
        console.error(`[${socket.id}]`, error);
        socket.emit("error", error instanceof Error ? error.message : "Something went wrong");
      }
    };
  }

  handleConnection(socket: InterviewSocket): void {
    socket.on("start_interview", this.safe(socket, (data) => this.startInterview(socket, data)));
    socket.on("resume_interview", this.safe(socket, (id) => this.resumeInterview(socket, id)));
    socket.on("send_message", this.safe(socket, (text) => this.handleInput(socket, text)));
    socket.on("send_voice_transcript", this.safe(socket, (text) => this.handleInput(socket, text)));
    socket.on("start_voice_stream", this.safe(socket, () => this.startVoiceStream(socket)));
    socket.on("audio_chunk", (audio: ArrayBuffer) => this.deepgram?.send(socket.id, Buffer.from(audio)));
    socket.on("stop_voice_stream", () => this.deepgram?.stop(socket.id));
    socket.on("execute_command", this.safe(socket, (command, args) => this.runCommand(socket, command.replace("/", "") as Command["name"], args?.role)));
    socket.on("request_feedback", this.safe(socket, () => this.sendFeedback(socket)));
    socket.on("disconnect", () => this.endSession(socket.id));
  }

  private endSession(socketId: string): void {
    const session = this.sessions.get(socketId);
    if (session?.timerInterval) clearInterval(session.timerInterval);
    this.deepgram?.stop(socketId);
    this.sessions.delete(socketId);
  }

  private async startInterview(socket: InterviewSocket, payload: unknown): Promise<void> {
    const { role, mode, config } = startInterviewSchema.parse(payload);
    const userId = socket.data.user.id;
    this.endSession(socket.id);

    const id = crypto.randomUUID();
    interviews.abandonStale(userId, id);
    interviews.create({ id, userId, role, mode, config });

    const welcome = makeMessage(
      "assistant",
      `Hi ${socket.data.user.name.split(" ")[0]}, I'm your interviewer for the ${ROLE_LABELS[role]} role. Let's start with an introduction. ${OPENING_QUESTION}`,
    );
    messageRepo.add(id, welcome);
    await this.openSession(socket, id, { role, mode, config, startedAt: Date.now(), history: [welcome], answers: [], currentQuestion: 1 });
    socket.emit("interview_started", id);
    socket.emit("next_question", { id: "q-1", role, category: "Behavioral", difficulty: "Easy", question: OPENING_QUESTION });
  }

  /** Rebuild a live session from the database, so a page refresh does not lose the interview. */
  private async resumeInterview(socket: InterviewSocket, id: string): Promise<void> {
    const interview = interviews.get(socket.data.user.id, id);
    if (!interview || interview.status !== "active") return void socket.emit("error", "This interview is no longer active");
    this.endSession(socket.id);

    const answers = turns.list(id);
    const history = interview.messages;
    const lastQuestion = [...history].reverse().find((m) => m.role === "assistant");
    await this.openSession(socket, id, {
      role: interview.role,
      mode: interview.mode,
      config: interview.config,
      startedAt: new Date(interview.startedAt).getTime(),
      history,
      answers,
      currentQuestion: answers.length + 1,
    });
    socket.emit("interview_started", id);
    if (lastQuestion) {
      socket.emit("next_question", { id: `q-${answers.length + 1}`, role: interview.role, category: "Technical", difficulty: "Medium", question: lastQuestion.content });
    }
  }

  private async openSession(
    socket: InterviewSocket,
    id: string,
    init: { role: JobRole; mode: InterviewState["mode"]; config: InterviewState["config"]; startedAt: number; history: Message[]; answers: AnsweredQuestion[]; currentQuestion: number },
  ): Promise<void> {
    const ai = await createAiProvider();
    const { config } = init;
    const targetDurationSeconds = (config.duration === "custom" ? config.customDurationMinutes ?? 20 : config.duration) * 60;
    const lastAssistant = [...init.history].reverse().find((m) => m.role === "assistant");

    const session: Session = {
      id,
      state: {
        sessionId: id,
        role: init.role,
        mode: init.mode,
        config,
        currentQuestion: init.currentQuestion,
        elapsedTime: Math.floor((Date.now() - init.startedAt) / 1000),
        targetDurationSeconds,
        detectedPattern: "unknown",
        patternConfidence: 0,
        conversationHistory: init.history,
        isActive: true,
      },
      patternDetector: new PatternDetector(),
      ai,
      feedbackGenerator: new FeedbackGenerator(ai),
      answers: init.answers,
      currentQuestionText: init.answers.length === 0 && init.history.length === 1 ? OPENING_QUESTION : lastAssistant?.content ?? "",
      startTime: init.startedAt,
      focusAreas: config.focusOnWeakSpots ? focusAreasFor(socket.data.user.id) : [],
      lastAnswerTime: Date.now(),
      targetDurationSeconds,
      hasAskedFollowUp: false,
      needsQuestion: false,
      busy: false,
    };
    this.sessions.set(socket.id, session);

    session.timerInterval = setInterval(() => {
      if (!session.state.isActive) return;
      session.state.elapsedTime = Math.floor((Date.now() - session.startTime) / 1000);
      if (session.state.elapsedTime >= session.targetDurationSeconds) {
        this.finish(socket, session).catch((e) => console.error(e));
      } else {
        this.emitState(socket, session);
      }
    }, 1000);

    for (const message of init.history) socket.emit("new_message", message);
    this.emitState(socket, session);
  }

  /** The client never needs the full transcript, so it is not sent on every tick. */
  private emitState(socket: InterviewSocket, session: Session): void {
    socket.emit("interview_state", { ...session.state, conversationHistory: [] });
  }

  private say(socket: InterviewSocket, session: Session, content: string, role: Message["role"] = "assistant"): void {
    const message = makeMessage(role, content);
    session.state.conversationHistory.push(message);
    messageRepo.add(session.id, message);
    socket.emit("new_message", message);
  }

  private async handleInput(socket: InterviewSocket, raw: unknown): Promise<void> {
    const session = this.sessions.get(socket.id);
    const parsed = sendMessageSchema.safeParse(raw);
    if (!session?.state.isActive || !parsed.success) return;
    const text = parsed.data;

    const command = parseCommand(text);
    if (command) {
      if (command.name === "end") this.say(socket, session, "Understood. Let me wrap up and generate your feedback.");
      return this.runCommand(socket, command.name, command.name === "change role" ? command.role : undefined);
    }

    if (session.busy) return;
    session.busy = true;
    try {
      if (session.needsQuestion) await this.askNewQuestion(socket, session);
      else await this.handleAnswer(socket, session, text);
    } finally {
      session.busy = false;
      socket.emit("streaming_complete");
    }
  }

  private async handleAnswer(socket: InterviewSocket, session: Session, answer: string): Promise<void> {
    const { state } = session;
    const responseTime = Math.floor((Date.now() - session.lastAnswerTime) / 1000);
    session.lastAnswerTime = Date.now();
    this.say(socket, session, answer, "user");

    if (state.elapsedTime >= session.targetDurationSeconds) return this.finish(socket, session);

    const question = session.currentQuestionText;
    const evaluation = await session.ai.evaluateAnswer(answer, question, state.role);

    session.patternDetector.addSignal(evaluation, responseTime, answer);
    const { pattern, confidence } = session.patternDetector.getPattern();
    const changed = pattern !== state.detectedPattern;
    state.detectedPattern = pattern;
    state.patternConfidence = confidence;
    if (changed && pattern !== "unknown") socket.emit("pattern_detected", pattern, confidence);

    if (evaluation.isUnclear) {
      this.say(socket, session, "Sorry, I didn't catch that clearly. Could you say it again?");
      return;
    }

    if (evaluation.isOffTopic) {
      this.say(socket, session, "I need to stay focused on interview practice. Please share your thoughts on the previous question, or ask me to move on.");
      return;
    }

    const turn = { question, answer, evaluation, metrics: analyzeAnswer(answer) };
    session.answers.push(turn);
    turns.add(session.id, session.answers.length, turn);
    state.currentQuestion++;
    this.emitState(socket, session);

    const askFollowUp = evaluation.depth === "shallow" && (evaluation.needsFollowUp || evaluation.quality < 5) && !session.hasAskedFollowUp;
    session.hasAskedFollowUp = askFollowUp;

    if (askFollowUp) {
      const text = await session.ai.generateFollowUp(question, answer, state.role);
      if (text) return this.askQuestion(socket, session, { question: text, category: "Technical", difficulty: "Medium" });
    }
    await this.askNewQuestion(socket, session);
  }

  private async askNewQuestion(socket: InterviewSocket, session: Session): Promise<void> {
    const { state } = session;
    const recent = state.conversationHistory.slice(-8).map((m) => `${m.role}: ${m.content}`).join("\n");
    const next = await session.ai.generateQuestion({
      role: state.role,
      candidateName: socket.data.user.name,
      conversation: recent,
      askedQuestions: [OPENING_QUESTION, ...session.answers.map((a) => a.question)],
      pattern: state.detectedPattern,
      config: state.config,
      focusAreas: session.focusAreas,
      questionNumber: state.currentQuestion,
    });

    session.needsQuestion = !next;
    if (next) return this.askQuestion(socket, session, next);
    this.say(socket, session, "I could not reach the AI service for the next question. Send any message to try again, or type /end to finish.", "system");
  }

  private askQuestion(socket: InterviewSocket, session: Session, q: Pick<Question, "question" | "category" | "difficulty">): void {
    session.currentQuestionText = q.question;
    this.say(socket, session, q.question);
    socket.emit("next_question", { id: `q-${session.state.currentQuestion}`, role: session.state.role, ...q });
  }

  private async runCommand(socket: InterviewSocket, name: Command["name"], role?: string): Promise<void> {
    const session = this.sessions.get(socket.id);
    if (!session) return;

    if (name === "end") return this.finish(socket, session);
    if (name === "skip") {
      if (session.busy) return;
      session.busy = true;
      try {
        session.hasAskedFollowUp = false;
        await this.askNewQuestion(socket, session);
      } finally {
        session.busy = false;
        socket.emit("streaming_complete");
      }
      return;
    }
    if (name === "feedback") return this.sendFeedback(socket);

    const newRole = JOB_ROLES.find((r) => r === role);
    if (!newRole) return this.say(socket, session, `Tell me which role: /change role ${JOB_ROLES.join(" | ")}`);
    session.state.role = newRole as JobRole;
    interviews.setRole(session.id, newRole as JobRole);
    this.say(socket, session, `Switching to ${newRole} questions.`);
    this.emitState(socket, session);
    await this.askNewQuestion(socket, session);
  }

  private buildFeedback(session: Session): Promise<FeedbackData> {
    return session.feedbackGenerator.generateFeedback(session.state.conversationHistory, session.state.role, session.answers);
  }

  private async sendFeedback(socket: InterviewSocket): Promise<void> {
    const session = this.sessions.get(socket.id);
    if (session) socket.emit("feedback_ready", await this.buildFeedback(session), session.id);
  }

  private async finish(socket: InterviewSocket, session: Session): Promise<void> {
    if (!session.state.isActive) return;
    session.state.isActive = false;
    if (session.timerInterval) clearInterval(session.timerInterval);
    this.deepgram?.stop(socket.id);

    this.say(socket, session, "Thank you for completing the interview! Your feedback will be generated shortly.", "system");
    socket.emit("interview_ended");
    const report = await this.buildFeedback(session);
    interviews.complete(session.id, report);
    socket.emit("feedback_ready", report, session.id);
  }

  private startVoiceStream(socket: InterviewSocket): void {
    const session = this.sessions.get(socket.id);
    if (!session) return;
    const keyterms = [socket.data.user.name, ...(session.state.config.extractedSkills ?? [])];
    this.getDeepgram().start(socket, keyterms);
  }
}
