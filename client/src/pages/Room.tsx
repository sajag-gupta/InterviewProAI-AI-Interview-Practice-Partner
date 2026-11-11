import { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { Mic, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Transcript } from "@/components/room/Transcript";
import { Composer } from "@/components/room/Composer";
import { VoiceDock } from "@/components/room/VoiceDock";
import { useInterviewSocket } from "@/hooks/useInterviewSocket";
import { ROLE_LABELS, formatClock } from "@/lib/format";

const PATTERN_LABEL = {
  confused: "Giving more guidance",
  efficient: "Raising difficulty",
  chatty: "Keeping you focused",
  edge_case: "Asking clearer questions",
  unknown: "",
} as const;

export default function Room() {
  const [, params] = useRoute("/app/interview/:id");
  const [, setLocation] = useLocation();
  const id = params?.id ?? "";
  const iv = useInterviewSocket();
  const [confirmEnd, setConfirmEnd] = useState(false);

  // Fresh page or refresh: ask the server to rebuild this interview from the database.
  useEffect(() => {
    if (iv.connected && iv.interviewId !== id) iv.resume(id);
  }, [iv.connected, id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (iv.finishedId) setLocation(`/app/interviews/${iv.finishedId}`, { replace: true });
  }, [iv.finishedId, setLocation]);

  const { state } = iv;
  const remaining = state ? state.targetDurationSeconds - state.elapsedTime : 0;
  const progress = state ? Math.min(100, (state.elapsedTime / state.targetDurationSeconds) * 100) : 0;
  const voice = state?.mode === "voice";

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold">{state ? ROLE_LABELS[state.role] : "Interview"}</h1>
          {state && (
            <Badge>{voice ? <Mic className="h-3 w-3" aria-hidden="true" /> : <MessageSquare className="h-3 w-3" aria-hidden="true" />} {state.config.interviewType}</Badge>
          )}
          {iv.pattern && PATTERN_LABEL[iv.pattern.pattern] && <Badge variant="default">{PATTERN_LABEL[iv.pattern.pattern]}</Badge>}
        </div>
        <div className="flex items-center gap-4">
          <p className="font-num text-sm" aria-label="Time remaining" role="timer">{formatClock(remaining)}</p>
          {confirmEnd ? (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="destructive" onClick={() => iv.command("/end")}>End and score</Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmEnd(false)}>Keep going</Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setConfirmEnd(true)} disabled={!state}>End interview</Button>
          )}
        </div>
      </header>
      <div className="h-0.5 bg-muted" role="progressbar" aria-label="Interview time used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
        <div className="h-full bg-primary transition-[width] duration-1000 ease-linear" style={{ width: `${progress}%` }} />
      </div>

      {iv.question && (
        <div className="flex items-center gap-2 border-b px-4 py-2 lg:hidden">
          <span className="eyebrow">Q{state?.currentQuestion ?? 1}</span>
          <Badge>{iv.question.category}</Badge>
          <Badge>{iv.question.difficulty}</Badge>
          {!voice && <Button size="sm" variant="ghost" className="ml-auto" onClick={() => iv.command("/skip")}>Skip</Button>}
        </div>
      )}

      <div className="grid min-h-0 flex-1 lg:grid-cols-[1fr_300px]">
        <section className="flex min-h-0 flex-col" aria-label="Conversation">
          <Transcript messages={iv.messages} thinking={iv.processing} />
          {voice ? (
            <VoiceDock socket={iv.socket} messages={iv.messages} processing={iv.processing} active={!!state?.isActive} answerTimeLimit={state?.config.answerTimeLimitSeconds ?? 120} onSend={iv.send} onSkip={() => iv.command("/skip")} />
          ) : (
            <Composer disabled={iv.processing || !state?.isActive} onSend={iv.send} />
          )}
        </section>

        <aside className="hidden space-y-6 overflow-y-auto border-l p-6 lg:block" aria-label="Interview details">
          {iv.question && (
            <div className="space-y-2">
              <p className="eyebrow">Question {state?.currentQuestion ?? 1}</p>
              <div className="flex gap-2">
                <Badge>{iv.question.category}</Badge>
                <Badge>{iv.question.difficulty}</Badge>
              </div>
            </div>
          )}
          <Button size="sm" variant="outline" className="w-full" onClick={() => iv.command("/skip")} disabled={!state?.isActive || iv.processing}>Skip this question</Button>
          <div className="space-y-2">
            <p className="eyebrow">Commands</p>
            <ul className="space-y-1 font-mono text-xs text-muted-foreground">
              <li>/skip</li>
              <li>/feedback</li>
              <li>/change role PM</li>
              <li>/end</li>
            </ul>
          </div>
          {!iv.connected && <p role="status" className="text-sm text-destructive">Connection lost. Reconnecting…</p>}
          <p className="text-xs text-muted-foreground">Closing this tab does not lose your place. Reopen the interview from History to continue.</p>
        </aside>
      </div>
    </div>
  );
}
