"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ReactNode } from "react"

// House convention: server state should not refetch just because the tab
// regained focus — tab-switching back to a deep feed must not silently refetch
// every loaded page. Set it once as the app-wide default (individual hooks may
// still override). gcTime is left at the ~5 min default so large post caches
// free naturally after navigating away.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
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