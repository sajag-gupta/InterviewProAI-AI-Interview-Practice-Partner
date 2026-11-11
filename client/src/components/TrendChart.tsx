import { motion } from "motion/react";
import { formatDate } from "@/lib/format";

type Point = { id: string; date: string; score: number };

/** Hand-drawn SVG line chart. Small enough to explain in full, no chart library. */
export function TrendChart({ points }: { points: Point[] }) {
  const W = 600;
  const H = 180;
  const pad = { l: 28, r: 12, t: 12, b: 24 };
  const x = (i: number) => pad.l + (points.length === 1 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (points.length - 1));
  const y = (score: number) => pad.t + (1 - score / 10) * (H - pad.t - pad.b);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.score)}`).join(" ");
  const summary = `Score trend over ${points.length} sessions, latest ${points[points.length - 1]?.score.toFixed(1)} out of 10`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={summary}>
      {[0, 5, 10].map((tick) => (
        <g key={tick}>
          <line x1={pad.l} x2={W - pad.r} y1={y(tick)} y2={y(tick)} className="stroke-border" strokeDasharray={tick === 0 ? undefined : "3 4"} />
          <text x={0} y={y(tick) + 4} className="fill-muted-foreground font-mono text-[10px]">{tick}</text>
        </g>
      ))}
      {points.length > 1 && (
        <motion.path d={path} fill="none" className="stroke-primary" strokeWidth={2} strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8, ease: "easeOut" }} />
      )}
      {points.map((p, i) => (
        <g key={p.id}>
          <circle cx={x(i)} cy={y(p.score)} r={4} className="fill-background stroke-primary" strokeWidth={2}>
            <title>{`${formatDate(p.date)}: ${p.score.toFixed(1)}`}</title>
          </circle>
        </g>
      ))}
      {points.length > 0 && (
        <>
          <text x={x(0)} y={H - 6} textAnchor="start" className="fill-muted-foreground font-mono text-[10px]">{formatDate(points[0].date)}</text>
          {points.length > 1 && <text x={x(points.length - 1)} y={H - 6} textAnchor="end" className="fill-muted-foreground font-mono text-[10px]">{formatDate(points[points.length - 1].date)}</text>}
        </>
      )}
    </svg>
  );
}
