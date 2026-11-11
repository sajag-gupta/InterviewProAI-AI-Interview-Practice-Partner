import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  FeedbackData,
  InterviewState,
  Message,
  Question,
  ServerToClientEvents,
  UserPattern,
} from "@shared/schema";
import { apiBase, queryClient } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

type InterviewContextValue = {
  socket: AppSocket | null;
  connected: boolean;
  interviewId: string | null;
  state: InterviewState | null;
  messages: Message[];
  question: Question | null;
  pattern: { pattern: UserPattern; confidence: number } | null;
  processing: boolean;
  setProcessing: (value: boolean) => void;
  finishedId: string | null;
  start: (payload: Parameters<ClientToServerEvents["start_interview"]>[0]) => void;
  resume: (id: string) => void;
  send: (text: string) => void;
  command: (name: "/change role" | "/end" | "/feedback" | "/skip", args?: { role?: string }) => void;
  reset: () => void;
};

const Ctx = createContext<InterviewContextValue | undefined>(undefined);

/**
 * Owns the one Socket.IO connection for a signed-in user. It lives above the router so the
 * connection and live state survive moving between setup, room and report pages.
 */
export function InterviewProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [socket, setSocket] = useState<AppSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [interviewId, setInterviewId] = useState<string | null>(null);
  const [state, setState] = useState<InterviewState | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState<Question | null>(null);
  const [pattern, setPattern] = useState<InterviewContextValue["pattern"]>(null);
  const [processing, setProcessing] = useState(false);
  const [finishedId, setFinishedId] = useState<string | null>(null);
  const toastRef = useRef(toast);
  toastRef.current = toast;

  useEffect(() => {
    const s: AppSocket = io(apiBase || undefined, { path: "/socket.io", withCredentials: true });
    s.on("connect", () => setConnected(true));
    s.on("disconnect", () => setConnected(false));
    s.on("connect_error", () => setConnected(false));
    s.on("interview_started", setInterviewId);
    s.on("interview_state", setState);
    s.on("streaming_complete", () => setProcessing(false));
    s.on("next_question", setQuestion);
    s.on("new_message", (m) => {
      setMessages((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, m]));
      if (m.role === "assistant") setProcessing(false);
    });
    s.on("pattern_detected", (p, confidence) => setPattern({ pattern: p, confidence }));
    s.on("feedback_ready", (_report: FeedbackData, id: string) => {
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/interviews"] });
      queryClient.invalidateQueries({ queryKey: [`/api/interviews/${id}`] });
      setFinishedId(id);
    });
    s.on("error", (message) => {
      setProcessing(false);
      toastRef.current({ title: "Something went wrong", description: message, variant: "destructive" });
    });
    setSocket(s);
    return () => void s.disconnect();
  }, []);

  const reset = useCallback(() => {
    setMessages([]);
    setQuestion(null);
    setPattern(null);
    setState(null);
    setFinishedId(null);
    setProcessing(false);
  }, []);

  const value = useMemo<InterviewContextValue>(
    () => ({
      socket,
      connected,
      interviewId,
      state,
      messages,
      question,
      pattern,
      processing,
      setProcessing,
      finishedId,
      reset,
      start: (payload) => {
        reset();
        setInterviewId(null);
        socket?.emit("start_interview", payload);
      },
      resume: (id) => {
        reset();
        socket?.emit("resume_interview", id);
      },
      send: (text) => {
        setProcessing(true);
        socket?.emit("send_message", text);
      },
      command: (name, args) => socket?.emit("execute_command", name, args),
    }),
    [socket, connected, interviewId, state, messages, question, pattern, processing, finishedId, reset],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useInterviewSocket() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useInterviewSocket must be used inside InterviewProvider");
  return ctx;
}
