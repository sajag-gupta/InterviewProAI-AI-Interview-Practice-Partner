import { QueryClient } from "@tanstack/react-query";

/** Empty in dev and when the API is served from the same origin. Set VITE_SOCKET_URL when hosting the server elsewhere. */
export const apiBase = import.meta.env.VITE_SOCKET_URL?.trim() ?? "";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${apiBase}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: "include",
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.message ?? res.statusText);
  return data as T;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: ({ queryKey }) => api("GET", queryKey[0] as string),
      refetchOnWindowFocus: false,
      retry: false,
      staleTime: 30_000,
    },
  },
});
