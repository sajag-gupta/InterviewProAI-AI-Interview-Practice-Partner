import { motion } from "motion/react";

/** One labelled 0-max bar. Used for rubric scores and STAR coverage. */
export function Bar({ label, value, max = 10, suffix = "" }: { label: string; value: number; max?: number; suffix?: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-sm">
        <span>{label}</span>
        <span className="font-num text-muted-foreground">{max === 10 ? value.toFixed(1) : Math.round(value)}{suffix}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
        <motion.div className="h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${(value / max) * 100}%` }} transition={{ duration: 0.7, ease: "easeOut" }} />
      </div>
    </div>
  );
}
