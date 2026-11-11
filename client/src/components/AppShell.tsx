import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { History, LayoutDashboard, LogOut, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/app", label: "Dashboard", icon: LayoutDashboard, match: (p: string) => p === "/app" },
  { href: "/app/new", label: "New interview", icon: Plus, match: (p: string) => p === "/app/new" },
  { href: "/app/interviews", label: "History", icon: History, match: (p: string) => p.startsWith("/app/interviews") },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [path, setLocation] = useLocation();
  const { user, logout } = useAuth();

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[232px_1fr]">
      <aside className="flex flex-col gap-6 border-b p-4 md:sticky md:top-0 md:h-dvh md:border-b-0 md:border-r md:p-5">
        <div className="flex items-center justify-between">
          <Logo href="/app" />
          <div className="md:hidden"><ThemeToggle /></div>
        </div>

        <nav aria-label="Main" className="flex gap-1 overflow-x-auto md:flex-col">
          {NAV.map(({ href, label, icon: Icon, match }) => (
            <Link
              key={href}
              href={href}
              aria-current={match(path) ? "page" : undefined}
              className={cn(
                "flex min-h-10 items-center gap-2 whitespace-nowrap rounded-md px-3 text-sm transition-colors",
                match(path) ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </Link>
          ))}
          <button
            type="button"
            className="flex min-h-10 items-center gap-2 whitespace-nowrap rounded-md px-3 text-sm text-muted-foreground hover:bg-accent/60 md:hidden"
            onClick={() => logout.mutate(undefined, { onSuccess: () => setLocation("/") })}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
          </button>
        </nav>

        <div className="mt-auto hidden items-center justify-between gap-2 md:flex">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user?.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
          </div>
          <ThemeToggle />
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="hidden justify-start md:flex"
          onClick={() => logout.mutate(undefined, { onSuccess: () => setLocation("/") })}
        >
          <LogOut aria-hidden="true" /> Sign out
        </Button>
      </aside>

      <main id="main" className="min-w-0">{children}</main>
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 pb-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold sm:text-3xl">{title}</h1>
        {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export const PageBody = ({ children }: { children: ReactNode }) => <div className="mx-auto w-full max-w-5xl p-5 sm:p-8">{children}</div>;
