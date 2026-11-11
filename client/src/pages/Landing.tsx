import { Link } from "wouter";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ScoreRing } from "@/components/ScoreRing";
import { Bar } from "@/components/report/Bar";
import { useAuth } from "@/hooks/useAuth";

const SAMPLE = {
  rubric: [["Communication", 7.8], ["Technical depth", 6.4], ["Problem solving", 7.1], ["Confidence", 8.2]] as const,
  question: "Tell me about a production incident you handled.",
  yours: "We had a bug and I fixed it after a while. Things were fine after that.",
  better: "A bad deploy doubled our checkout errors. I rolled it back within 12 minutes, found the missing index, and added a migration check that has caught two issues since.",
};

export default function Landing() {
  const { user } = useAuth();
  const cta = user ? { href: "/app", label: "Open dashboard" } : { href: "/auth", label: "Create an account" };

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <nav aria-label="Main" className="flex items-center gap-1">
          {!user && <Button asChild variant="ghost" size="sm"><Link href="/auth?mode=login">Sign in</Link></Button>}
          <Button asChild size="sm"><Link href={cta.href}>{user ? "Dashboard" : "Get started"}</Link></Button>
          <ThemeToggle />
        </nav>
      </header>

      <main id="main">
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-24 pt-12 lg:grid-cols-[1.05fr_1fr] lg:pt-20">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: "easeOut" }} className="space-y-7">
            <p className="eyebrow">AI mock interviews</p>
            <h1 className="text-5xl font-medium leading-[1.03] sm:text-6xl">Practice interviews that score you like an interviewer would</h1>
            <p className="max-w-xl text-lg text-muted-foreground">
              Answer by typing or speaking. Every report shows four skill scores, how many STAR parts you covered, your filler words, and a stronger version of each answer.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="lg"><Link href={cta.href}>{cta.label} <ArrowRight aria-hidden="true" /></Link></Button>
              <a href="#report" className="rounded-sm px-2 py-3 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">See a sample report</a>
            </div>
            <p className="font-mono text-xs text-muted-foreground">8 roles · chat or voice · 5 to 20 minutes</p>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, delay: 0.1, ease: "easeOut" }} id="report" className="overflow-hidden rounded-xl border bg-card" aria-label="Sample report">
            <div className="flex items-center gap-2 border-b px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-border" /><span className="h-2.5 w-2.5 rounded-full bg-border" /><span className="h-2.5 w-2.5 rounded-full bg-border" />
              <span className="ml-3 font-mono text-xs text-muted-foreground">Sample report · Software engineer</span>
            </div>
            <div className="space-y-6 p-6">
              <div className="flex items-center gap-6">
                <ScoreRing score={7.4} size={112} />
                <div className="flex-1 space-y-3">
                  {SAMPLE.rubric.map(([label, value]) => <Bar key={label} label={label} value={value} />)}
                </div>
              </div>
              <div className="space-y-3 border-t pt-5 text-sm">
                <p className="font-medium">{SAMPLE.question}</p>
                <div>
                  <p className="eyebrow mb-1">Your answer · 4/10</p>
                  <p className="text-muted-foreground">{SAMPLE.yours}</p>
                </div>
                <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                  <p className="eyebrow mb-1 text-brand">A stronger version</p>
                  <p>{SAMPLE.better}</p>
                </div>
              </div>
            </div>
          </motion.div>
        </section>

        <section className="border-t">
          <div className="mx-auto grid max-w-6xl gap-10 px-6 py-20 md:grid-cols-3">
            {[
              ["Scores you can trace", "Each answer is rated for clarity, depth and relevance. Your skill scores are averages of those ratings, so you can see why a number is what it is."],
              ["Delivery from the transcript", "Filler words, answer length and whether you used numbers are counted directly from what you said. No model guesses."],
              ["It remembers your weak spots", "After a few sessions the dashboard shows your weakest skills, and the next interview can lean on them."],
            ].map(([title, text]) => (
              <div key={title} className="space-y-2">
                <h2 className="text-lg font-medium">{title}</h2>
                <p className="text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-6 py-20">
            <h2 className="max-w-xl text-3xl font-medium">Run your first interview in under a minute</h2>
            <Button asChild size="lg"><Link href={cta.href}>{cta.label} <ArrowRight aria-hidden="true" /></Link></Button>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-2 px-6 py-8 text-sm text-muted-foreground">
          <span>interview/pro</span>
          <span>Questions by Google Gemini. Speech to text by Deepgram.</span>
        </div>
      </footer>
    </div>
  );
}
