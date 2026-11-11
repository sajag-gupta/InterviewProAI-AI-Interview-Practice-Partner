import { useMutation, useQuery } from "@tanstack/react-query";
import type { AuthUser } from "@shared/schema";
import { ApiError, api, queryClient } from "@/lib/api";

const ME = ["/api/me"];

export function useAuth() {
  const me = useQuery<AuthUser | null>({
    queryKey: ME,
    queryFn: () =>
      api<AuthUser>("GET", "/api/me").catch((e) => {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }),
    staleTime: Infinity,
  });

  const authenticate = useMutation({
    mutationFn: ({ mode, ...body }: { mode: "login" | "signup"; name?: string; email: string; password: string }) =>
      api<AuthUser>("POST", `/api/auth/${mode}`, body),
    onSuccess: (user) => queryClient.setQueryData(ME, user),
  });

  const logout = useMutation({
    mutationFn: () => api<void>("POST", "/api/auth/logout"),
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(ME, null);
    },
  });

  return { user: me.data ?? null, isLoading: me.isLoading, authenticate, logout };
}
