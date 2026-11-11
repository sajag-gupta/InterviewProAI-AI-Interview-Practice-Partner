import { DIMENSIONS, type DashboardStats, type Dimension } from "@shared/schema";
import { interviews } from "../db";

const round1 = (n: number) => Math.round(n * 10) / 10;
const average = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

/** The two weakest dimensions averaged over the last three scored sessions. Empty until there is data. */
export function focusAreasFor(userId: string): Dimension[] {
  const recent = interviews.reports(userId, 3);
  if (recent.length === 0) return [];
  return [...DIMENSIONS]
    .map((d) => ({ d, avg: average(recent.map((r) => r.report[d])) }))
    .sort((a, b) => a.avg - b.avg)
    .slice(0, 2)
    .map((x) => x.d);
}

export function dashboardFor(userId: string): DashboardStats {
  const all = interviews.list(userId, 200);
  const scored = interviews.reports(userId, 200).reverse();
  const done = all.filter((i) => i.status === "completed" && i.overallScore !== null);
  const scores = scored.map((s) => s.report.overallScore);

  return {
    sessions: done.length,
    answers: done.reduce((sum, i) => sum + i.answers, 0),
    practiceMinutes: Math.round(done.reduce((sum, i) => sum + i.durationSeconds, 0) / 60),
    averageScore: scores.length ? round1(average(scores)) : null,
    bestScore: scores.length ? Math.max(...scores) : null,
    trend: scored.slice(-12).map((s) => ({ id: s.id, date: s.date, score: s.report.overallScore })),
    dimensions: scored.length
      ? (Object.fromEntries(DIMENSIONS.map((d) => [d, round1(average(scored.map((s) => s.report[d])))])) as Record<Dimension, number>)
      : null,
    focusAreas: focusAreasFor(userId),
    recent: all.slice(0, 5),
  };
}
