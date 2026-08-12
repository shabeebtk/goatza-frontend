/**
 * React Query bindings for notifications.
 *
 * Every key is scoped by the ACTING actor, the same way careers and
 * achievements scope their org review queues: one person can hold their own
 * account and several clubs, and each has its own inbox. Sharing one
 * `["notifications", "list"]` key across them served the previous actor's rows
 * for the whole staleTime after a switch — and those rows deep-link into the
 * previous actor's route space, so clicking one switched the person back.
 */

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"

import { useAuthStore } from "@/store/auth.store"
import {
  getNotificationsApi,
  getUnreadCountApi,
  markNotificationReadApi,
  markAllNotificationsReadApi,
  type Notification,
  type NotificationsResponse,
} from "../services/notifications.api"

// ── Query keys ───────────────────────────────────────────────

export const notificationKeys = {
  all:         ()               => ["notifications"]                  as const,
  list:        (actor: string)  => ["notifications", "list", actor]   as const,
  unreadCount: (actor: string)  => ["notifications", "unread", actor] as const,
}

/**
 * The acting actor as one cache-key string.
 *
 * A user actor has no `actorId` (the store leaves it null), so the logged-in
 * user's own id stands in — otherwise every user actor would share one key with
 * every other, which is the bug this exists to prevent, one level up.
 */
export const useNotificationActorKey = () => {
  const actorType = useAuthStore((s) => s.actorType)
  const actorId = useAuthStore((s) => s.actorId)
  const userId = useAuthStore((s) => s.user?.id)

  return actorType === "organization" && actorId
    ? `org:${actorId}`
    : `user:${userId ?? ""}`
}

// ── Queries ──────────────────────────────────────────────────

export const useNotifications = () => {
  const actor = useNotificationActorKey()

  return useInfiniteQuery({
    queryKey: notificationKeys.list(actor),
    queryFn: ({ pageParam }) => getNotificationsApi(pageParam as string | null),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    staleTime: 1000 * 30,
  })
}

export const useUnreadCount = () => {
  const actor = useNotificationActorKey()

  return useQuery({
    queryKey: notificationKeys.unreadCount(actor),
    queryFn: getUnreadCountApi,
    staleTime: 1000 * 30,
    refetchInterval: 1000 * 60, // poll every minute
  })
}

// ── Mutations ────────────────────────────────────────────────

export const useMarkNotificationRead = () => {
  const qc = useQueryClient()
  const actor = useNotificationActorKey()
  const listKey = notificationKeys.list(actor)
  const countKey = notificationKeys.unreadCount(actor)

  return useMutation({
    mutationFn: (notificationId: string) =>
      markNotificationReadApi(notificationId),
    onMutate: async (notificationId: string) => {
      await qc.cancelQueries({ queryKey: listKey })

      const prevList = qc.getQueryData(listKey)
      const prevCount = qc.getQueryData(countKey)

      // Optimistically mark as read in list
      qc.setQueryData<{
        pages: NotificationsResponse[]
        pageParams: unknown[]
      }>(listKey, (old) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            results: page.results.map((n: Notification) =>
              n.id === notificationId ? { ...n, is_read: true } : n
            ),
          })),
        }
      })

      // Optimistically decrement unread count
      qc.setQueryData<{ count: number }>(
        countKey,
        (old) => old ? { count: Math.max(0, old.count - 1) } : old
      )

      return { prevList, prevCount }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prevList) qc.setQueryData(listKey, ctx.prevList)
      if (ctx?.prevCount) qc.setQueryData(countKey, ctx.prevCount)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: countKey })
    },
  })
}

export const useMarkAllRead = () => {
  const qc = useQueryClient()
  const actor = useNotificationActorKey()
  const listKey = notificationKeys.list(actor)
  const countKey = notificationKeys.unreadCount(actor)

  return useMutation({
    mutationFn: markAllNotificationsReadApi,
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: listKey })

      const prevList = qc.getQueryData(listKey)
      const prevCount = qc.getQueryData(countKey)

      // Optimistically mark all as read
      qc.setQueryData<{
        pages: NotificationsResponse[]
        pageParams: unknown[]
      }>(listKey, (old) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            results: page.results.map((n: Notification) => ({
              ...n,
              is_read: true,
            })),
          })),
        }
      })

      qc.setQueryData<{ count: number }>(countKey, { count: 0 })

      return { prevList, prevCount }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prevList) qc.setQueryData(listKey, ctx.prevList)
      if (ctx?.prevCount) qc.setQueryData(countKey, ctx.prevCount)
    },
    onSettled: () => {
      // Both this actor's keys, not every actor's: the server only marked the
      // acting actor's rows.
      qc.invalidateQueries({ queryKey: listKey })
      qc.invalidateQueries({ queryKey: countKey })
    },
  })
}
