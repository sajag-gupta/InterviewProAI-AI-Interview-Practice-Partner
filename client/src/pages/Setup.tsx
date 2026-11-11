import { useEffect, useState, type ReactNode } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Mic, MessageSquare } from "lucide-react";
import { JOB_ROLES, type DashboardStats, type ExperienceLevel, type InterviewConfig, type InterviewDuration, type InterviewMode, type InterviewType, type JobRole } from "@shared/schema";
import { PageBody, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useInterviewSocket } from "@/hooks/useInterviewSocket";
import { api } from "@/lib/api";
import { DIMENSION_LABELS, ROLE_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";

type Insights = { requiredSkills: string[]; keyResponsibilities: string[]; candidateStrengths: string[]; candidateWeaknesses: string[] };

export default function Setup() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const { connected, interviewId, start } = useInterviewSocket();
  const { data: stats } = useQuery<DashboardStats>({ queryKey: ["/api/stats"] });

  const [role, setRole] = useState<JobRole>("SDE");
  const [mode, setMode] = useState<InterviewMode>("chat");
  const [interviewType, setType] = useState<InterviewType>("mixed");
  const [level, setLevel] = useState<ExperienceLevel>("mid");
  const [duration, setDuration] = useState<InterviewDuration>(10);
  const [answerLimit, setAnswerLimit] = useState(120);
  const [focus, setFocus] = useState(new URLSearchParams(search).get("focus") === "1");
  const [jd, setJd] = useState("");
  const [resume, setResume] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (submitting && interviewId) setLocation(`/app/interview/${interviewId}`);
  }, [submitting, interviewId, setLocation]);

  const canFocus = (stats?.focusAreas.length ?? 0) > 0;

  const submit = async () => {
    setSubmitting(true);
    const config: InterviewConfig = { duration, interviewType, experienceLevel: level, answerTimeLimitSeconds: answerLimit, focusOnWeakSpots: focus && canFocus };

    if (jd.trim() && resume.trim()) {
      try {
        const insights = await api<Insights>("POST", "/api/extract", { jdText: jd, resumeText: resume });
        Object.assign(config, {
          extractedSkills: insights.requiredSkills,
          extractedResponsibilities: insights.keyResponsibilities,
          candidateStrengths: insights.candidateStrengths,
          candidateWeaknesses: insights.candidateWeaknesses,
        });
      } catch {
        toast({ title: "Could not read the documents", description: "Starting without them.", variant: "destructive" });
      }
    }
    start({ role, mode, config });
  };

  return (
    <PageBody>
      <PageHeader title="New interview" subtitle="Pick a role and how you want to practice." />

      <form className="space-y-10" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Section title="Role">
          <div role="radiogroup" aria-label="Role" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {JOB_ROLES.map((r) => (
              <Choice key={r} name="role" checked={role === r} onChange={() => setRole(r)}>{ROLE_LABELS[r]}</Choice>
            ))}
          </div>
        </Section>

        <Section title="Mode">
          <div role="radiogroup" aria-label="Mode" className="grid max-w-md grid-cols-2 gap-3">
            <Choice name="mode" checked={mode === "chat"} onChange={() => setMode("chat")}><MessageSquare className="h-4 w-4" aria-hidden="true" /> Type</Choice>
            <Choice name="mode" checked={mode === "voice"} onChange={() => setMode("voice")}><Mic className="h-4 w-4" aria-hidden="true" /> Speak</Choice>
          </div>
        </Section>

        <Section title="Format">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Type" id="type">
              <Select value={interviewType} onValueChange={(v) => setType(v as InterviewType)}>
                <SelectTrigger id="type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mixed">Mixed</SelectItem>
                  <SelectItem value="technical">Technical</SelectItem>
                  <SelectItem value="behavioral">Behavioral</SelectItem>
                  <SelectItem value="rapid-fire">Rapid-fire</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Level" id="level">
              <Select value={level} onValueChange={(v) => setLevel(v as ExperienceLevel)}>
                <SelectTrigger id="level"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="entry">Entry (0-2 yrs)</SelectItem>
                  <SelectItem value="mid">Mid (2-5 yrs)</SelectItem>
                  <SelectItem value="senior">Senior (5-10 yrs)</SelectItem>
                  <SelectItem value="lead">Lead (10+ yrs)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Length" id="duration">
              <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v) as InterviewDuration)}>
                <SelectTrigger id="duration"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 minutes</SelectItem>
                  <SelectItem value="10">10 minutes</SelectItem>
                  <SelectItem value="20">20 minutes</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Time per answer" id="answer-limit">
              <Select value={String(answerLimit)} onValueChange={(v) => setAnswerLimit(Number(v))}>
                <SelectTrigger id="answer-limit"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="60">1 minute</SelectItem>
                  <SelectItem value="120">2 minutes</SelectItem>
                  <SelectItem value="180">3 minutes</SelectItem>
                  <SelectItem value="300">5 minutes</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          {canFocus && (
            <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-lg border p-4 has-[:checked]:border-primary/60">
              <input type="checkbox" name="focus" checked={focus} onChange={(e) => setFocus(e.target.checked)} className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]" />
              <span className="text-sm">
                <span className="font-medium">Focus on my weak spots</span>
                <span className="block text-muted-foreground">Questions will lean on {stats!.focusAreas.map((d) => DIMENSION_LABELS[d].toLowerCase()).join(" and ")}, based on your recent reports.</span>
              </span>
            </label>
          )}
        </Section>

        <Section title="Tailor it (optional)">
          <p className="mb-4 max-w-xl text-sm text-muted-foreground">Paste a job description and your resume. Questions will target the listed skills and the gaps between the two. Both are needed.</p>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Job description" id="jd">
              <textarea id="jd" name="jd" value={jd} onChange={(e) => setJd(e.target.value)} rows={7} maxLength={20000} className={textarea} placeholder="Paste the posting…" />
            </Field>
            <Field label="Resume" id="resume">
              <textarea id="resume" name="resume" value={resume} onChange={(e) => setResume(e.target.value)} rows={7} maxLength={20000} className={textarea} placeholder="Paste your resume as text…" />
            </Field>
          </div>
        </Section>

        <div className="flex items-center gap-4">
          <Button type="submit" size="lg" disabled={!connected || submitting}>
            {submitting && <Loader2 className="animate-spin" aria-hidden="true" />}
            {submitting ? "Starting…" : "Start interview"}
          </Button>
          {!connected && <p role="status" className="text-sm text-muted-foreground">Connecting to the server…</p>}
        </div>
      </form>
    </PageBody>
  );
}

const textarea = "w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="eyebrow">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function Choice({ name, checked, onChange, children }: { name: string; checked: boolean; onChange: () => void; children: ReactNode }) {
  return (
    <label className={cn("lift flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border bg-card px-3 py-3 text-center text-sm focus-within:ring-2 focus-within:ring-ring", checked && "border-primary bg-primary/10 font-medium")}>
      <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only" />
      {children}
    </label>
  );
}
