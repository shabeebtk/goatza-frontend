import { useInfiniteQuery } from "@tanstack/react-query"
import {
  fetchNetworkListApi,
  type NetworkListResponse,
  type NetworkListType,
} from "../services/connections.api"

// ── Query keys ───────────────────────────────────────────────

export const networkKeys = {
  /** Root — invalidate to refresh every list. */
  all: () => ["connections", "network"] as const,
  list: (username: string, type: NetworkListType, search: string) =>
    ["connections", "network", username, type, search] as const,
}

/** Query key for one concrete list — shared by the list + row mutations. */
export type NetworkListKey = ReturnType<typeof networkKeys.list>

const LIMIT = 20

type UseNetworkListArgs = {
  username: string
  type: NetworkListType
  search?: string
}

/**
 * Offset-based infinite list of a profile's followers / following / connections.
 * Keyed by [username, type, search] so switching tab or search starts a fresh,
 * independently-paginated list.
 */
export const useNetworkList = ({
  username,
  type,
  search = "",
}: UseNetworkListArgs) =>
  useInfiniteQuery<NetworkListResponse, Error>({
    queryKey: networkKeys.list(username, type, search),
    queryFn: ({ pageParam = 0 }) =>
      fetchNetworkListApi({
        username,
        type,
        search: search || undefined,
        limit: LIMIT,
        offset: pageParam as number,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const fetched = allPages.reduce((sum, p) => sum + p.results.length, 0)
      return fetched < lastPage.count ? fetched : undefined
    },
    enabled: !!username,
    staleTime: 1000 * 60,
  })
