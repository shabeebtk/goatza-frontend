"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { isAxiosError } from "axios"
import { ReactNode } from "react"

/**
 * App-wide retry rule for QUERIES. React Query's default is three retries
 * for every failure, which is the wrong answer to both kinds we see: a 4xx
 * is a decision (401, 403, 404, and a 429 that a retry only makes worse — a
 * throttled feed retried three times is four requests in the same window),
 * and a network error or a 5xx is worth a second and third try, not a
 * fourth. Mutations keep React Query's default of no retries: a write
 * replayed is a write made twice. Hooks with their own reasons (a call that
 * sends an email, a unique-column write) still set `retry` themselves.
 */
export const retryQuery = (failureCount: number, error: unknown): boolean => {
  if (isAxiosError(error)) {
    const status = error.response?.status
    if (status !== undefined && status >= 400 && status < 500) return false
  }
  return failureCount < 2
}

// House convention: server state should not refetch just because the tab
// regained focus — tab-switching back to a deep feed must not silently refetch
// every loaded page. Set it once as the app-wide default (individual hooks may
// still override). gcTime is left at the ~5 min default so large post caches
// free naturally after navigating away.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: retryQuery,
    },
  },
})

export default function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
