import { useQuery } from "@tanstack/react-query"
import { getDashboardApi, type DashboardRange } from "../services/dashboard.api"

// ── Query keys ──
export const dashboardKeys = {
  all: () => ["dashboard"] as const,
  overview: (orgId: string, range: DashboardRange) =>
    ["dashboard", orgId, range] as const,
}

// ── Queries ──
export const useDashboard = (orgId: string, range: DashboardRange) =>
  useQuery({
    queryKey: dashboardKeys.overview(orgId, range),
    queryFn: () => getDashboardApi(range),
    enabled: !!orgId,
    staleTime: 1000 * 60, // 1 min — dashboard aggregates don't need to be live
  })
