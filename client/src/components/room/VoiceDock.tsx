import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { FastForward, Mic, Pause, Play, RotateCcw, Send, SkipForward } from "lucide-react";
import type { ClientToServerEvents, Message, ServerToClientEvents } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { formatClock } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
  socket: Socket<ServerToClientEvents, ClientToServerEvents> | null;
  messages: Message[];
  processing: boolean;
  active: boolean;
  answerTimeLimit: number;
  onSend: (text: string) => void;
  onSkip: () => void;
};

/**
 * Hands-free turn taking, the way voice interview products work:
 *   interviewer speaks -> mic opens by itself -> you answer -> a pause ends your turn -> interviewer replies.
 * Browsers only allow audio after a click, so the first screen is a one-time "Begin" gate.
 */
type Phase = "gate" | "speaking" | "listening" | "thinking" | "paused";

// How long a silence must last before the answer is submitted. A finished sentence needs less
// time than a trailing comma or "and", because people pause to think mid-sentence.
const PAUSE_AFTER_SENTENCE_MS = 1800;
const PAUSE_MID_SENTENCE_MS = 2600;
const PAUSE_TRAILING_CONNECTOR_MS = 3600;
const MIN_WORDS_TO_SUBMIT = 2;
const TICK_MS = 200;

const mimeType = () => ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));

function silenceNeeded(text: string) {
  if (/(,|\b(and|but|so|because|then|or|um|uh|like)\b)\W*$/i.test(text)) return PAUSE_TRAILING_CONNECTOR_MS;
  return /[.?!]["')\]]?\s*$/.test(text) ? PAUSE_AFTER_SENTENCE_MS : PAUSE_MID_SENTENCE_MS;
}

/** Prefer a network voice in the browser's language: they sound far less robotic than the local default. */
function pickVoice() {
  const lang = navigator.language.toLowerCase();
  const voices = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2)));
  return voices.find((v) => v.lang.toLowerCase() === lang && !v.localService) ?? voices.find((v) => !v.localService) ?? voices.find((v) => v.default) ?? voices[0];
}

export function VoiceDock({ socket, messages, processing, active, answerTimeLimit, onSend, onSkip }: Props) {
  const { toast } = useToast();
  const [phase, setPhase] = useState<Phase>("gate");
  const [draft, setDraft] = useState("");
  const [interim, setInterim] = useState("");
  const [level, setLevel] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(answerTimeLimit);

  const phaseRef = useRef<Phase>("gate");
  const draftRef = useRef("");
  const interimRef = useRef("");
  const lastActivity = useRef(0);
  const deadline = useRef(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const raf = useRef(0);
  const ready = useRef<(() => void) | null>(null);
  const speakToken = useRef(0);
  const spokenId = useRef<string | undefined>(undefined);
  const lastAssistant = messages.filter((m) => m.role === "assistant").at(-1);

  const goto = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };
  const setDraftBoth = (text: string) => {
    draftRef.current = text;
    setDraft(text);
  };
  const setInterimBoth = (text: string) => {
    interimRef.current = text;
    setInterim(text);
  };

  useEffect(() => {
    if (!socket) return;
    const onReady = () => ready.current?.();
    const onInterim = (text: string) => {
      lastActivity.current = Date.now();
      setInterimBoth(text);
    };
    const onFinal = (text: string) => {
      lastActivity.current = Date.now();
      setInterimBoth("");
      setDraftBoth(draftRef.current ? `${draftRef.current} ${text}` : text);
    };
    socket.on("voice_ready", onReady);
    socket.on("interim_transcript", onInterim);
    socket.on("final_transcript", onFinal);
    return () => {
      socket.off("voice_ready", onReady);
      socket.off("interim_transcript", onInterim);
      socket.off("final_transcript", onFinal);
    };
  }, [socket]);

  const stopMic = useCallback(() => {
    cancelAnimationFrame(raf.current);
    setLevel(0);
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
    stream.current?.getTracks().forEach((t) => t.stop());
    audioCtx.current?.close().catch(() => undefined);
    recorder.current = stream.current = audioCtx.current = null;
    // Let the speech service flush the last words before its side is closed.
    setTimeout(() => socket?.emit("stop_voice_stream"), 700);
  }, [socket]);

  const startMic = useCallback(async () => {
    if (!socket || recorder.current) return;
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      stream.current = media;

      const connected = new Promise<void>((resolve, reject) => {
        ready.current = resolve;
        setTimeout(() => reject(new Error("The speech service did not respond")), 5000);
      });
      socket.emit("start_voice_stream");
      await connected;

      const rec = new MediaRecorder(media, { mimeType: mimeType() });
      rec.ondataavailable = async (e) => {
        if (e.data.size > 0) socket.emit("audio_chunk", await e.data.arrayBuffer());
      };
      rec.start(250);
      recorder.current = rec;

      const ctx = new AudioContext();
      audioCtx.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(media).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((sum, v) => sum + (v - 128) ** 2, 0) / samples.length) / 128;
        setLevel(Math.min(1, rms * 4));
        raf.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (error) {
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
      goto("paused");
      toast({
        title: "Could not start the microphone",
        description: (error as Error).name === "NotAllowedError" ? "Allow microphone access in your browser's address bar, or type your answers below." : (error as Error).message,
        variant: "destructive",
      });
    } finally {
      ready.current = null;
    }
  }, [socket, toast]);

  const listen = useCallback(async () => {
    goto("listening");
    lastActivity.current = Date.now();
    deadline.current = Date.now() + answerTimeLimit * 1000;
    setSecondsLeft(answerTimeLimit);
    await startMic();
  }, [answerTimeLimit, startMic]);

  /** Speak, then hand the turn to the candidate. A timeout covers browsers that never fire `end`. */
  const speak = useCallback(
    (text: string) => {
      const token = ++speakToken.current;
      goto("speaking");
      const done = () => {
        if (speakToken.current !== token || phaseRef.current !== "speaking") return;
        speakToken.current++;
        listen();
      };
      if (!("speechSynthesis" in window)) return void done();
      speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      const voice = pickVoice();
      if (voice) utterance.voice = voice;
      utterance.onend = done;
      utterance.onerror = done;
      speechSynthesis.speak(utterance);
      setTimeout(done, Math.max(4000, text.split(/\s+/).length * 600 + 3000));
    },
    [listen],
  );

  const commit = useCallback(() => {
    const text = `${draftRef.current} ${interimRef.current}`.trim();
    if (!text) return;
    stopMic();
    goto("thinking");
    onSend(text);
    setDraftBoth("");
    setInterimBoth("");
  }, [onSend, stopMic]);

  // Begin: the one click that unlocks audio. Ask for the mic now so later turns open without a prompt.
  const begin = async () => {
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
      probe.getTracks().forEach((t) => t.stop());
    } catch (error) {
      toast({
        title: "Microphone blocked",
        description: (error as Error).name === "NotAllowedError" ? "Allow microphone access in your browser's address bar, then press Begin again. You can also type below." : (error as Error).message,
        variant: "destructive",
      });
      return;
    }
    spokenId.current = lastAssistant?.id;
    lastAssistant ? speak(lastAssistant.content) : listen();
  };

  // New interviewer message: close the mic, read it aloud, then listen again.
  useEffect(() => {
    if (phaseRef.current === "gate" || phaseRef.current === "paused") return;
    if (!lastAssistant || lastAssistant.id === spokenId.current) return;
    spokenId.current = lastAssistant.id;
    stopMic();
    speak(lastAssistant.content);
  }, [lastAssistant?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // The reply finished without a spoken message (for example an error notice): give the turn back.
  useEffect(() => {
    if (!processing && phaseRef.current === "thinking") setTimeout(() => phaseRef.current === "thinking" && !processing && listen(), 600);
  }, [processing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Turn detection: a pause ends the turn, the per-answer limit ends it regardless.
  useEffect(() => {
    if (phase !== "listening") return;
    const timer = setInterval(() => {
      const now = Date.now();
      setSecondsLeft(Math.max(0, Math.ceil((deadline.current - now) / 1000)));
      const text = `${draftRef.current} ${interimRef.current}`.trim();
      const enough = text.split(/\s+/).filter(Boolean).length >= MIN_WORDS_TO_SUBMIT;
      if (now >= deadline.current) return enough ? commit() : (stopMic(), goto("paused"));
      if (enough && now - lastActivity.current >= silenceNeeded(text)) commit();
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [phase, commit, stopMic]);

  useEffect(
    () => () => {
      speakToken.current++;
      window.speechSynthesis?.cancel();
      stopMic();
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const pause = () => {
    speakToken.current++;
    window.speechSynthesis?.cancel();
    stopMic();
    goto("paused");
  };
  const skipSpeech = () => {
    speakToken.current++;
    window.speechSynthesis?.cancel();
    listen();
  };
  const repeat = () => {
    stopMic();
    if (lastAssistant) speak(lastAssistant.content);
  };

  const manualSend = () => {
    if (draft.trim() || interim.trim()) commit();
  };

  const status =
    phase === "gate" ? "Microphone is off" : phase === "speaking" ? "Interviewer is speaking" : phase === "listening" ? "Your turn. Speak now" : phase === "thinking" ? "Interviewer is thinking…" : "Paused";

  if (phase === "gate") {
    return (
      <div className="space-y-4 border-t bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-medium">Voice interview</p>
            <p className="text-sm text-muted-foreground">The interviewer speaks, then your microphone opens by itself. A short pause sends your answer.</p>
          </div>
          <Button size="lg" onClick={begin} disabled={!socket || !active}>
            <Mic aria-hidden="true" /> Begin
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 border-t bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto max-w-2xl space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative grid h-12 w-12 place-items-center">
              <span aria-hidden="true" className="absolute inset-0 rounded-full bg-primary/30 transition-transform duration-75" style={{ transform: `scale(${1 + level * 0.7})`, opacity: phase === "listening" ? 1 : 0 }} />
              <span className={cn("relative grid h-10 w-10 place-items-center rounded-full border", phase === "listening" ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground")}>
                <Mic className="h-4 w-4" aria-hidden="true" />
              </span>
            </div>
            <p className={cn("text-sm", phase === "listening" ? "font-medium text-brand" : "text-muted-foreground")} role="status">{status}</p>
          </div>
          {phase === "listening" && <p className="font-num text-sm text-muted-foreground" aria-label="Time left for this answer">{formatClock(secondsLeft)}</p>}
        </div>

        <label htmlFor="voice-draft" className="sr-only">Your answer</label>
        <textarea
          id="voice-draft"
          name="voice-draft"
          value={interim ? `${draft} ${interim}`.trim() : draft}
          onChange={(e) => setDraftBoth(e.target.value)}
          readOnly={phase === "listening" && !!interim}
          rows={3}
          autoComplete="off"
          placeholder={phase === "listening" ? "Listening…" : "Your answer appears here. You can edit it before it is sent."}
          className="min-h-[5.5rem] w-full resize-none rounded-md border border-input bg-background px-3 py-2.5 text-base placeholder:text-muted-foreground md:text-sm"
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1">
            {phase === "speaking" && <Button type="button" variant="ghost" size="sm" onClick={skipSpeech}><FastForward aria-hidden="true" /> Skip speech</Button>}
            {phase === "paused" ? (
              <Button type="button" variant="outline" size="sm" onClick={listen}><Play aria-hidden="true" /> Resume</Button>
            ) : (
              <Button type="button" variant="ghost" size="sm" onClick={pause}><Pause aria-hidden="true" /> Pause</Button>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={repeat} disabled={!lastAssistant || phase === "thinking"}><RotateCcw aria-hidden="true" /> Repeat</Button>
            <Button type="button" variant="ghost" size="sm" onClick={onSkip} disabled={phase === "thinking"}><SkipForward aria-hidden="true" /> Skip question</Button>
          </div>
          <Button type="button" onClick={manualSend} disabled={phase === "thinking" || !(draft + interim).trim()}>
            <Send aria-hidden="true" /> Send now
          </Button>
        </div>
      </div>
    </div>
  );
}
