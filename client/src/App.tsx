import type { ComponentType } from "react";
import { MotionConfig } from "motion/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Redirect, Route, Switch, useLocation } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AppShell } from "@/components/AppShell";
import { InterviewProvider } from "@/hooks/useInterviewSocket";
import { useAuth } from "@/hooks/useAuth";
import { queryClient } from "@/lib/api";
import Landing from "@/pages/Landing";
import AuthPage from "@/pages/Auth";
import Dashboard from "@/pages/Dashboard";
import Setup from "@/pages/Setup";
import Room from "@/pages/Room";
import Report from "@/pages/Report";
import History from "@/pages/History";

/** Everything under /app needs a signed-in user. The socket provider mounts only for them. */
function Protected({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="grid min-h-dvh place-items-center text-muted-foreground" role="status">Loading…</div>;
  if (!user) return <Redirect to="/auth?mode=login" />;
  return <InterviewProvider>{children}</InterviewProvider>;
}

const shell = (Page: ComponentType) => () => <AppShell><Page /></AppShell>;
const DashboardPage = shell(Dashboard);
const SetupPage = shell(Setup);
const HistoryPage = shell(History);
const ReportPage = shell(Report);

function GuestOnly({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (!isLoading && user) return <Redirect to="/app" />;
  return <>{children}</>;
}

function Routes() {
  const [path] = useLocation();
  if (!path.startsWith("/app")) {
    return (
      <Switch>
        <Route path="/auth"><GuestOnly><AuthPage /></GuestOnly></Route>
        <Route><Landing /></Route>
      </Switch>
    );
  }
  return (
    <Protected>
      <Switch>
        <Route path="/app" component={DashboardPage} />
        <Route path="/app/new" component={SetupPage} />
        <Route path="/app/interview/:id" component={Room} />
        <Route path="/app/interviews" component={HistoryPage} />
        <Route path="/app/interviews/:id" component={ReportPage} />
        <Route><Redirect to="/app" /></Route>
      </Switch>
    </Protected>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <MotionConfig reducedMotion="user">
            <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2">
              Skip to main content
            </a>
            <Toaster />
            <Routes />
          </MotionConfig>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
