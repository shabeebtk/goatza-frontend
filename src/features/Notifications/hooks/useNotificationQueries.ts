import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
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
  all:         ()  => ["notifications"]           as const,
  list:        ()  => ["notifications", "list"]   as const,
  unreadCount: ()  => ["notifications", "unread"] as const,
}

// ── Queries ──────────────────────────────────────────────────

export const useNotifications = () =>
  useInfiniteQuery({
    queryKey: notificationKeys.list(),
    queryFn: ({ pageParam }) => getNotificationsApi(pageParam as string | null),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    staleTime: 1000 * 30,
  })

export const useUnreadCount = () =>
  useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: getUnreadCountApi,
    staleTime: 1000 * 30,
    refetchInterval: 1000 * 60, // poll every minute
  })

// ── Mutations ────────────────────────────────────────────────

export const useMarkNotificationRead = () => {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (notificationId: string) =>
      markNotificationReadApi(notificationId),
    onMutate: async (notificationId: string) => {
      await qc.cancelQueries({ queryKey: notificationKeys.list() })

      const prevList = qc.getQueryData(notificationKeys.list())
      const prevCount = qc.getQueryData(notificationKeys.unreadCount())

      // Optimistically mark as read in list
      qc.setQueryData<{
        pages: NotificationsResponse[]
        pageParams: unknown[]
      }>(notificationKeys.list(), (old) => {
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
        notificationKeys.unreadCount(),
        (old) => old ? { count: Math.max(0, old.count - 1) } : old
      )

      return { prevList, prevCount }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prevList) qc.setQueryData(notificationKeys.list(), ctx.prevList)
      if (ctx?.prevCount) qc.setQueryData(notificationKeys.unreadCount(), ctx.prevCount)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: notificationKeys.unreadCount() })
    },
  })
}

export const useMarkAllRead = () => {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: markAllNotificationsReadApi,
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: notificationKeys.list() })

      const prevList = qc.getQueryData(notificationKeys.list())
      const prevCount = qc.getQueryData(notificationKeys.unreadCount())

      // Optimistically mark all as read
      qc.setQueryData<{
        pages: NotificationsResponse[]
        pageParams: unknown[]
      }>(notificationKeys.list(), (old) => {
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

      qc.setQueryData<{ count: number }>(notificationKeys.unreadCount(), { count: 0 })

      return { prevList, prevCount }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prevList) qc.setQueryData(notificationKeys.list(), ctx.prevList)
      if (ctx?.prevCount) qc.setQueryData(notificationKeys.unreadCount(), ctx.prevCount)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: notificationKeys.all() })
    },
  })
}