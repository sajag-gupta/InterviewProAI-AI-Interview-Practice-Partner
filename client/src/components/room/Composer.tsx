import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Composer({ disabled, onSend }: { disabled: boolean; onSend: (text: string) => void }) {
  const [text, setText] = useState("");

  const submit = () => {
    if (!text.trim() || disabled) return;
    onSend(text.trim());
    setText("");
  };

  return (
    <form className="border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="mx-auto flex max-w-2xl items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
          name="message"
          aria-label="Your answer"
          autoComplete="off"
          rows={2}
          maxLength={5000}
          disabled={disabled}
          placeholder={disabled ? "Interviewer is thinking…" : "Type your answer. Enter sends, Shift+Enter adds a line."}
          className="max-h-40 min-h-12 flex-1 resize-none rounded-md border border-input bg-background px-3 py-2.5 text-base placeholder:text-muted-foreground disabled:opacity-60 md:text-sm"
        />
        <Button type="submit" size="icon" disabled={disabled || !text.trim()} aria-label="Send answer"><Send aria-hidden="true" /></Button>
      </div>
    </form>
  );
}
