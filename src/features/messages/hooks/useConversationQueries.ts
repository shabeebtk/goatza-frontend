import {
  useQuery,
  useMutation,
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
  type Query,
  type QueryClient,
} from "@tanstack/react-query"
import {
  getOrCreateConversationApi,
  getConversationsApi,
  getConversationsUnreadSummaryApi,
  getConversationDetailsApi,
  getMessagesApi,
  markConversationReadApi,
  acceptConversationApi,
  searchMessageTargetsApi,
  shareContentApi,
  deleteMessageApi,
  type ConversationsParams,
  type MessagesResponse,
} from "../services/conversations.api"

// ── Query keys ───────────────────────────────────────────────

export const conversationKeys = {
  all:           ()                            => ["conversations"]                          as const,
  list:          (params: ConversationsParams) => ["conversations", "list", params]          as const,
  detail:        (id: string)                  => ["conversations", "detail", id]            as const,
  messages:      (id: string)                  => ["conversations", "messages", id]          as const,
  unreadSummary: ()                            => ["conversations", "unread-summary"]        as const,
  search:        (query: string)               => ["conversations", "search", query]         as const,
}

/**
 * Invalidate every `conversations` query EXCEPT an open chat's message history.
 *
 * `conversationKeys.all()` matches by prefix, so a plain invalidate also refetches
 * `["conversations","messages",id]` — every loaded page, serially — and the response
 * replaces `data.pages` wholesale, wiping optimistic bubbles that are still
 * uploading. The message list is kept live by the websocket and its own mount
 * refetch; it never needs invalidating from a sibling mutation.
 */
export const invalidateConversationsExceptMessages = (qc: QueryClient) =>
  qc.invalidateQueries({
    predicate: (q: Query) =>
      q.queryKey[0] === "conversations" && q.queryKey[1] !== "messages",
  })

// ── Conversations create ────────────────────────────────────────

export const useGetOrCreateConversation = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: getOrCreateConversationApi,
    onSuccess: () => {
      // Invalidate list so new conversation appears if it was created
      invalidateConversationsExceptMessages(qc)
    },
  })
}


// ── Conversations list ────────────────────────────────────────

export const useConversations = (params: ConversationsParams = {}) =>
  useQuery({
    queryKey:       conversationKeys.list(params),
    queryFn:        () => getConversationsApi(params),
    staleTime:      0, // Always refetch on mount so latest chats appear when coming back
  })

// ── Message target search (people + orgs to start a chat with) ─

export const useMessageTargetSearch = (query: string) =>
  useQuery({
    queryKey: conversationKeys.search(query.trim()),
    queryFn:  () => searchMessageTargetsApi(query.trim()),
    enabled:  query.trim().length > 0,
    staleTime: 1000 * 30,
  })

// ── Share content into conversations ──────────────────────────

/**
 * Forwards a post/recruitment into any number of conversations.
 *
 * Invalidates the whole `conversations` key on success: the share becomes each
 * thread's last_message, so the lists re-sort (shared chats jump to the top)
 * and the search results' conversation_id fills in for threads that were just
 * created. Deliberately not narrowed to one list key — a share can touch
 * several conversations across both the active and requested lists.
 */
export const useShareContent = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: shareContentApi,
    onSuccess: (result) => {
      // Nothing landed → nothing changed server-side; don't churn the caches.
      if (result.sent.length === 0) return
      invalidateConversationsExceptMessages(qc)
    },
  })
}

// ── Unread summary (nav badge + tab badges) ───────────────────

export const useConversationsUnreadSummary = () =>
  useQuery({
    queryKey:        conversationKeys.unreadSummary(),
    queryFn:         getConversationsUnreadSummaryApi,
    staleTime:       1000 * 30,
    refetchInterval: 1000 * 60, // poll every minute for the nav badge
  })

// ── Conversation detail ───────────────────────────────────────

export const useConversationDetail = (conversationId: string | null) =>
  useQuery({
    queryKey: conversationKeys.detail(conversationId ?? ""),
    queryFn:  () => getConversationDetailsApi(conversationId!),
    enabled:  !!conversationId,
    staleTime: 1000 * 60,
  })

// ── Messages (cursor-paginated, loads older messages upward) ──

export const useMessages = (conversationId: string | null) =>
  useInfiniteQuery({
    queryKey:         conversationKeys.messages(conversationId ?? ""),
    queryFn:          ({ pageParam }) =>
      getMessagesApi({ cursor: pageParam as string | undefined, conversation_id: conversationId! }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      if (!lastPage.next_cursor) return undefined
      try {
        const url = new URL(lastPage.next_cursor, window.location.origin)
        return url.searchParams.get("cursor") || undefined
      } catch {
        return undefined
      }
    },
    enabled:          !!conversationId,
    staleTime:        0, // Refetch on mount to get messages missed while away
  })

// ── Mark read ─────────────────────────────────────────────────

export const useMarkRead = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: markConversationReadApi,
    onSuccess:  (_, conversationId) => {
      // Zero out unread count in the list cache optimistically
      qc.setQueriesData(
        { queryKey: ["conversations", "list"] },
        (old: unknown) => {
          if (!Array.isArray(old)) return old
          return old.map((conv: { id: string; unread_count: number }) =>
            conv.id === conversationId ? { ...conv, unread_count: 0 } : conv
          )
        }
      )
      // …and in the open conversation's own detail, so re-rendering it doesn't
      // fire markRead again from a stale unread_count.
      qc.setQueryData(
        conversationKeys.detail(conversationId),
        (old: unknown) =>
          old && typeof old === "object" ? { ...old, unread_count: 0 } : old
      )
      // Reading a chat changes the badge counts — refetch the summary so the
      // nav badge and the Chats/Requests tab badges update immediately.
      qc.invalidateQueries({ queryKey: conversationKeys.unreadSummary() })
    },
  })
}

// ── Delete (unsend) a message ─────────────────────────────────

/**
 * Removes the message from the open thread immediately and restores it if the
 * request fails. The websocket "message_deleted" event removes it for everyone
 * else (and for this user's other devices).
 */
export const useDeleteMessage = (conversationId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (messageId: string) =>
      deleteMessageApi(conversationId, messageId),

    onMutate: async (messageId: string) => {
      const key = conversationKeys.messages(conversationId)
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<InfiniteData<MessagesResponse>>(key)
      qc.setQueryData<InfiniteData<MessagesResponse>>(key, (old) =>
        old
          ? {
              ...old,
              pages: old.pages.map((p) => ({
                ...p,
                results: p.results.filter((m) => m.id !== messageId),
              })),
            }
          : old
      )
      return { previous }
    },

    onError: (_err, _messageId, context) => {
      if (context?.previous) {
        qc.setQueryData(
          conversationKeys.messages(conversationId),
          context.previous
        )
      }
    },

    onSuccess: () => {
      // The thread preview / ordering may have changed — but never refetch the
      // message history from here (see invalidateConversationsExceptMessages).
      invalidateConversationsExceptMessages(qc)
    },
  })
}

// ── Accept Request ────────────────────────────────────────────

export const useAcceptConversation = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: acceptConversationApi,
    onSuccess: (_, conversationId) => {
      // Invalidate detail and list
      qc.invalidateQueries({ queryKey: conversationKeys.detail(conversationId) })
      invalidateConversationsExceptMessages(qc)
    },
  })
}