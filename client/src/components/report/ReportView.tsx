import { ArrowRight, Check, TrendingUp } from "lucide-react";
import { DIMENSIONS, type InterviewDetail } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScoreRing } from "@/components/ScoreRing";
import { DIMENSION_LABELS, ROLE_LABELS, formatDate, formatDuration, scoreTone } from "@/lib/format";
import { Bar } from "./Bar";

type Props = { interview: Pick<InterviewDetail, "role" | "startedAt" | "durationSeconds" | "answers" | "interviewType" | "mode">; report: NonNullable<InterviewDetail["report"]> };

export function ReportView({ interview, report }: Props) {
  if (report.note) {
    return (
      <Card className="p-6" role="status">
        <h2 className="text-lg font-semibold">No score for this session</h2>
        <p className="mt-2 text-muted-foreground">{report.note}</p>
      </Card>
    );
  }

  const { speech, starPct } = report;

  return (
    <div className="space-y-6">
      <Card className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center">
        <ScoreRing score={report.overallScore} />
        <div className="min-w-0 space-y-3">
          <p className="eyebrow">
            {ROLE_LABELS[interview.role]} · {interview.interviewType} · {formatDate(interview.startedAt)} · {formatDuration(interview.durationSeconds)}
          </p>
          <p className="text-pretty leading-relaxed">{report.detailedFeedback}</p>
          {report.nextStep && (
            <p className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm">
              <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
              <span><span className="font-medium">Next:</span> {report.nextStep}</span>
            </p>
          )}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="space-y-4 p-6">
          <h2 className="eyebrow">Rubric</h2>
          {DIMENSIONS.map((d) => <Bar key={d} label={DIMENSION_LABELS[d]} value={report[d]} />)}
        </Card>

        {speech && (
          <Card className="space-y-4 p-6">
            <h2 className="eyebrow">Delivery</h2>
            <dl className="space-y-3 text-sm">
              <Stat label="Average answer length" value={`${speech.avgWords} words`} />
              <Stat label="Filler words" value={`${speech.fillersPer100Words} per 100 words`} hint={speech.topFillers.length ? `Most used: ${speech.topFillers.join(", ")}` : "None detected"} />
              <Stat label="Answers with numbers" value={`${speech.answersWithNumbersPct}%`} hint="Metrics make results believable" />
            </dl>
          </Card>
        )}

        {starPct && (
          <Card className="space-y-4 p-6">
            <h2 className="eyebrow">STAR coverage</h2>
            <Bar label="Situation" value={starPct.situation} max={100} suffix="%" />
            <Bar label="Task" value={starPct.task} max={100} suffix="%" />
            <Bar label="Action" value={starPct.action} max={100} suffix="%" />
            <Bar label="Result" value={starPct.result} max={100} suffix="%" />
          </Card>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="p-6">
          <h2 className="eyebrow mb-3">What worked</h2>
          <ul className="space-y-2 text-sm">
            {report.strengths.map((s) => (
              <li key={s} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />{s}</li>
            ))}
          </ul>
        </Card>
        <Card className="p-6">
          <h2 className="eyebrow mb-3">Work on</h2>
          <ul className="space-y-2 text-sm">
            {report.improvements.map((s) => (
              <li key={s} className="flex gap-2"><TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />{s}</li>
            ))}
          </ul>
        </Card>
      </div>

      {report.questionSummaries.length > 0 && (
        <section aria-labelledby="qbq" className="space-y-3">
          <h2 id="qbq" className="eyebrow">Question by question</h2>
          <div className="divide-y rounded-lg border bg-card">
            {report.questionSummaries.map((q, i) => (
              <details key={i} className="group p-4 open:bg-muted/30" data-testid={`question-${i}`}>
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4 rounded-sm">
                  <span className="text-sm font-medium">{i + 1}. {q.question}</span>
                  <span className={`font-num shrink-0 text-sm ${scoreTone(q.score)}`}>{q.score}/10</span>
                </summary>
                <div className="mt-4 space-y-4 text-sm">
                  <div>
                    <p className="eyebrow mb-1">Your answer</p>
                    <p className="whitespace-pre-wrap text-muted-foreground">{q.answer}</p>
                  </div>
                  {q.feedback && <p>{q.feedback}</p>}
                  {q.improvedAnswer && (
                    <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                      <p className="eyebrow mb-1 text-brand">A stronger version</p>
                      <p>{q.improvedAnswer}</p>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {q.metrics && <Badge>{q.metrics.words} words</Badge>}
                    {q.metrics && q.metrics.fillers > 0 && <Badge>{q.metrics.fillers} fillers</Badge>}
                    {q.metrics && !q.metrics.hasNumbers && <Badge>no numbers</Badge>}
                    {q.star && (["situation", "task", "action", "result"] as const).map((k) => (
                      <Badge key={k} variant={q.star![k] ? "success" : "outline"}>{k[0].toUpperCase()}{q.star![k] ? "" : " missing"}</Badge>
                    ))}
                  </div>
                </div>
              </details>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-num text-base">{value}</dd>
      {hint && <dd className="text-xs text-muted-foreground">{hint}</dd>}
    </div>
  );
}
