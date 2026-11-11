import { useState, type FormEvent } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/hooks/useAuth";

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const initial = new URLSearchParams(useSearch()).get("mode") === "login" ? "login" : "signup";
  const { authenticate } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">(initial);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const isSignup = mode === "signup";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    authenticate.mutate({ mode, name: isSignup ? name : undefined, email, password }, { onSuccess: () => setLocation("/app") });
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <ThemeToggle />
      </header>

      <main id="main" className="mx-auto grid w-full max-w-md flex-1 content-center gap-8 px-6 pb-24">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold">{isSignup ? "Create your account" : "Welcome back"}</h1>
          <p className="text-muted-foreground">{isSignup ? "Your interviews and reports are saved to your account." : "Sign in to see your reports and progress."}</p>
        </div>

        <form className="space-y-5" onSubmit={submit}>
          {isSignup && (
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" spellCheck={false} required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" autoComplete={isSignup ? "new-password" : "current-password"} minLength={isSignup ? 8 : undefined} required value={password} onChange={(e) => setPassword(e.target.value)} />
            {isSignup && <p className="text-xs text-muted-foreground">At least 8 characters.</p>}
          </div>

          <p role="alert" className={authenticate.error ? "rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" : "sr-only"}>
            {authenticate.error?.message}
          </p>

          <Button type="submit" size="lg" className="w-full" disabled={authenticate.isPending}>
            {authenticate.isPending ? "Please wait…" : isSignup ? "Create account" : "Sign in"}
          </Button>
        </form>

        <p className="text-sm text-muted-foreground">
          {isSignup ? "Already have an account? " : "New here? "}
          <button type="button" className="rounded-sm text-brand underline-offset-4 hover:underline" onClick={() => { setMode(isSignup ? "login" : "signup"); authenticate.reset(); }}>
            {isSignup ? "Sign in" : "Create an account"}
          </button>
          {" · "}
          <Link href="/" className="rounded-sm underline-offset-4 hover:underline">Back to home</Link>
        </p>
      </main>
    </div>
  );
}
