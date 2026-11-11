import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { InterviewSummary } from "@shared/schema";
import { PageBody, PageHeader } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ROLE_LABELS, formatDate, formatDuration, scoreTone } from "@/lib/format";

export function SessionList({ items }: { items: InterviewSummary[] }) {
  if (items.length === 0) return <p className="text-muted-foreground">No interviews yet.</p>;
  return (
    <ul className="divide-y rounded-lg border bg-card">
      {items.map((i) => (
        <li key={i.id}>
          <Link
            href={i.status === "active" ? `/app/interview/${i.id}` : `/app/interviews/${i.id}`}
            className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-accent/50"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{ROLE_LABELS[i.role]}</p>
              <p className="eyebrow mt-1 normal-case tracking-normal">
                {formatDate(i.startedAt)} · {i.interviewType} · {i.mode} · {i.answers} answers · {formatDuration(i.durationSeconds)}
              </p>
            </div>
            {i.status === "active" ? (
              <Badge variant="default">Resume</Badge>
            ) : i.overallScore !== null ? (
              <span className={`font-num text-xl ${scoreTone(i.overallScore)}`}>{i.overallScore.toFixed(1)}</span>
            ) : (
              <Badge>{i.status === "abandoned" ? "Abandoned" : "Not scored"}</Badge>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function History() {
  const { data, isLoading } = useQuery<InterviewSummary[]>({ queryKey: ["/api/interviews"] });
  return (
    <PageBody>
      <PageHeader title="History" subtitle="Every interview you have run." action={<Button asChild><Link href="/app/new">New interview</Link></Button>} />
      {isLoading || !data ? <Skeleton className="h-64" aria-busy="true" /> : <SessionList items={data} />}
    </PageBody>
  );
}
