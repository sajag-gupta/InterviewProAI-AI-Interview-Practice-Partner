import { Link, useLocation, useRoute } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, Trash2 } from "lucide-react";
import type { InterviewDetail } from "@shared/schema";
import { PageBody, PageHeader } from "@/components/AppShell";
import { ReportView } from "@/components/report/ReportView";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, queryClient } from "@/lib/api";
import { ROLE_LABELS } from "@/lib/format";
import { exportReportPdf } from "@/lib/exportPdf";

export default function Report() {
  const [, params] = useRoute("/app/interviews/:id");
  const [, setLocation] = useLocation();
  const id = params?.id ?? "";
  const { data, isLoading, error } = useQuery<InterviewDetail>({ queryKey: [`/api/interviews/${id}`] });

  const remove = useMutation({
    mutationFn: () => api<void>("DELETE", `/api/interviews/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/interviews"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setLocation("/app/interviews");
    },
  });

  if (error) {
    return (
      <PageBody>
        <PageHeader title="Interview not found" />
        <Button asChild variant="outline"><Link href="/app/interviews">Back to history</Link></Button>
      </PageBody>
    );
  }

  return (
    <PageBody>
      <PageHeader
        title={data ? `${ROLE_LABELS[data.role]} interview` : "Report"}
        action={
          data?.report && (
            <div className="flex gap-2">
              {!data.report.note && (
                <Button variant="outline" onClick={() => exportReportPdf(data, data.report!)}>
                  <Download aria-hidden="true" /> Export PDF
                </Button>
              )}
              <Button variant="ghost" onClick={() => window.confirm("Delete this interview and its report?") && remove.mutate()} aria-label="Delete interview">
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
          )
        }
      />
      {isLoading || !data ? (
        <Skeleton className="h-96" aria-busy="true" />
      ) : data.report ? (
        <ReportView interview={data} report={data.report} />
      ) : (
        <div className="space-y-4">
          <p className="text-muted-foreground">This interview has no report yet.</p>
          {data.status === "active" && <Button asChild><Link href={`/app/interview/${data.id}`}>Resume interview</Link></Button>}
        </div>
      )}
    </PageBody>
  );
}
