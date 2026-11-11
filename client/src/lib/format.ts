import { ROLE_LABELS, type Dimension } from "@shared/schema";

export const DIMENSION_LABELS: Record<Dimension, string> = {
  communication: "Communication",
  technicalDepth: "Technical depth",
  problemSolving: "Problem solving",
  confidence: "Confidence",
};

export { ROLE_LABELS };

const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });

export const formatDate = (iso: string) => dateFmt.format(new Date(iso));
export const formatTime = (iso: string | Date) => timeFmt.format(new Date(iso));

export function formatClock(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function formatDuration(seconds: number) {
  const m = Math.round(seconds / 60);
  return m < 1 ? "<1 min" : `${m} min`;
}

export const scoreTone = (score: number) => (score >= 7.5 ? "text-success" : score >= 5 ? "text-warning" : "text-destructive");
