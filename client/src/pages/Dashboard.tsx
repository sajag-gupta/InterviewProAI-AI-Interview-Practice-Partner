import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { ArrowRight, Plus } from "lucide-react";
import { DIMENSIONS, type DashboardStats } from "@shared/schema";
import { PageBody, PageHeader } from "@/components/AppShell";
import { TrendChart } from "@/components/TrendChart";
import { Bar } from "@/components/report/Bar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AnimatedNumber } from "@/components/motion-primitives/animated-number";
import { SessionList } from "@/pages/History";
import { DIMENSION_LABELS } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";

export default function Dashboard() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery<DashboardStats>({ queryKey: ["/api/stats"] });

  return (
    <PageBody>
      <PageHeader
        title={`Hi, ${user?.name.split(" ")[0]}`}
        subtitle="Your practice at a glance."
        action={<Button asChild><Link href="/app/new"><Plus aria-hidden="true" /> New interview</Link></Button>}
      />

      {isLoading || !data ? (
        <div className="grid gap-4 sm:grid-cols-4" aria-busy="true">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : data.sessions === 0 ? (
        <Card className="space-y-4 p-8">
          <h2 className="text-xl font-semibold">Run your first interview</h2>
          <p className="max-w-xl text-muted-foreground">
            Pick a role, answer a few questions, and get a scored report with a stronger version of each answer. Your trend and weak spots appear here after the first session.
          </p>
          <Button asChild><Link href="/app/new">Start an interview <ArrowRight aria-hidden="true" /></Link></Button>
        </Card>
      ) : (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-6">
          <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Metric label="Sessions" value={data.sessions} />
            <Metric label="Average score" value={data.averageScore ?? 0} decimals={1} />
            <Metric label="Best score" value={data.bestScore ?? 0} decimals={1} />
            <Metric label="Minutes practiced" value={data.practiceMinutes} />
          </dl>

          <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
            <Card className="space-y-3 p-6">
              <h2 className="eyebrow">Score trend</h2>
              <TrendChart points={data.trend} />
            </Card>
            <Card className="space-y-4 p-6">
              <h2 className="eyebrow">Average by skill</h2>
              {data.dimensions && DIMENSIONS.map((d) => <Bar key={d} label={DIMENSION_LABELS[d]} value={data.dimensions![d]} />)}
            </Card>
          </div>

          {data.focusAreas.length > 0 && (
            <Card className="flex flex-wrap items-center justify-between gap-4 border-primary/30 p-6">
              <div>
                <h2 className="eyebrow mb-1 text-brand">Focus next</h2>
                <p>Your weakest areas lately: <strong>{data.focusAreas.map((d) => DIMENSION_LABELS[d]).join(" and ")}</strong>. The next interview can lean on them.</p>
              </div>
              <Button asChild variant="outline"><Link href="/app/new?focus=1">Practice weak spots</Link></Button>
            </Card>
          )}

          <section aria-labelledby="recent" className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 id="recent" className="eyebrow">Recent sessions</h2>
              <Link href="/app/interviews" className="text-sm text-brand hover:underline">View all</Link>
            </div>
            <SessionList items={data.recent} />
          </section>
        </motion.div>
      )}
    </PageBody>
  );
}

function Metric({ label, value, decimals = 0 }: { label: string; value: number; decimals?: number }) {
  return (
    <Card className="p-5">
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-2 text-3xl font-medium"><AnimatedNumber value={value} decimals={decimals} className="font-mono" /></dd>
    </Card>
  );
}
