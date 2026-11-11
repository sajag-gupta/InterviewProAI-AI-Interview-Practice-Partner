import { motion } from "motion/react";
import { AnimatedNumber } from "@/components/motion-primitives/animated-number";

export function ScoreRing({ score, size = 132, label = "Overall" }: { score: number; size?: number; label?: string }) {
  const stroke = 8;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${label} score ${score.toFixed(1)} out of 10`}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className="stroke-primary"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - score / 10) }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <AnimatedNumber value={score} decimals={1} className="font-mono text-3xl font-medium" />
        <span className="eyebrow">{label}</span>
      </div>
    </div>
  );
}
