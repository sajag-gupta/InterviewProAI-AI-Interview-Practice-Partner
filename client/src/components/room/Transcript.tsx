import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Volume2 } from "lucide-react";
import type { Message } from "@shared/schema";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

function speak(text: string) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

export function Transcript({ messages, thinking }: { messages: Message[]; thinking: boolean }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, thinking]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8" role="log" aria-live="polite" aria-label="Interview conversation">
      <div className="mx-auto max-w-2xl space-y-5">
        {messages.length === 0 && <p className="text-muted-foreground">Connecting to your interview…</p>}
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className={cn("flex", m.role === "user" && "justify-end")}>
              {m.role === "system" ? (
                <p className="mx-auto text-sm text-muted-foreground">{m.content}</p>
              ) : (
                <div className={cn("max-w-[85%] space-y-1", m.role === "user" && "text-right")}>
                  <p className="eyebrow">{m.role === "user" ? "You" : "Interviewer"} · {formatTime(m.timestamp)}</p>
                  <div className={cn("whitespace-pre-wrap rounded-lg px-4 py-3 text-left text-[15px] leading-relaxed", m.role === "user" ? "bg-primary text-primary-foreground" : "border bg-card")}>
                    {m.content}
                  </div>
                  {m.role === "assistant" && (
                    <button type="button" onClick={() => speak(m.content)} aria-label="Read this message aloud" className="inline-flex min-h-6 items-center gap-1 rounded-sm text-xs text-muted-foreground hover:text-foreground">
                      <Volume2 className="h-3 w-3" aria-hidden="true" /> Listen
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        {thinking && (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="flex gap-1" aria-hidden="true">
              {[0, 1, 2].map((i) => <span key={i} className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground motion-reduce:animate-none" style={{ animationDelay: `${i * 0.15}s` }} />)}
            </span>
            Interviewer is thinking
          </p>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
