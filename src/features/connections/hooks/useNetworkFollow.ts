import {
  useMutation,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query"
import {
  followUserApi,
  unfollowUserApi,
} from "@/features/profile/services/profile.api"
import {
  followOrganizationApi,
  unfollowOrganizationApi,
} from "@/features/organization/services/organization.api"
import { networkKeys, type NetworkListKey } from "./useNetworkList"
import type {
  NetworkListResponse,
  NetworkRow,
} from "../services/connections.api"

type ToggleVars = {
  row: NetworkRow
  /** Desired follow state after the toggle. */
  next: boolean
}

/**
 * Follow / unfollow the entity behind a network row, reusing the same
 * follow/unfollow services the profile pages use. Optimistically flips
 * `is_following` on the row inside `activeKey`, rolls back on error, and
 * invalidates every network list on settle so counts/lists reconcile.
 *
 * Created once per row so `isPending` is scoped to that row's button.
 */
export const useNetworkFollow = (activeKey: NetworkListKey) => {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ row, next }: ToggleVars) => {
      if (row.type === "organization") {
        const payload = { target_type: "organization" as const, target_id: row.id }
        return next
          ? followOrganizationApi(payload)
          : unfollowOrganizationApi(payload)
      }
      const payload = { target_type: "user" as const, target_id: row.id }
      return next ? followUserApi(payload) : unfollowUserApi(payload)
    },

    onMutate: async ({ row, next }: ToggleVars) => {
      await qc.cancelQueries({ queryKey: activeKey })
      const prev = qc.getQueryData<InfiniteData<NetworkListResponse>>(activeKey)

      qc.setQueryData<InfiniteData<NetworkListResponse>>(activeKey, (old) =>
        old
          ? {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                results: page.results.map((r) =>
                  r.id === row.id && r.type === row.type
                    ? { ...r, is_following: next }
                    : r
                ),
              })),
            }
          : old
      )

      return { prev }
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(activeKey, ctx.prev)
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: networkKeys.all() })
    },
  })
}
