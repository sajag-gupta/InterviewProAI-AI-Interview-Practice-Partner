import type { AnswerMetrics } from "@shared/schema";

// Deterministic delivery analytics. No model involved, so the numbers are repeatable and explainable.
const FILLERS = ["um", "uh", "erm", "er", "you know", "basically", "literally", "sort of", "kind of", "i mean", "so yeah"];
const FILLER_RE = new RegExp(`\\b(${FILLERS.join("|")})\\b`, "gi");

export function analyzeAnswer(text: string): AnswerMetrics {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const found = (text.match(FILLER_RE) ?? []).map((w) => w.toLowerCase());
  return { words, fillers: found.length, fillerWords: found, hasNumbers: /\d/.test(text) };
}
