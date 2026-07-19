import { useQuery, useMutation, useInfiniteQuery, useQueryClient } from "@tanstack/react-query"
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
  type ConversationsParams,
  type MessagesParams,
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

// ── Conversations create ────────────────────────────────────────

export const useGetOrCreateConversation = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: getOrCreateConversationApi,
    onSuccess: () => {
      // Invalidate list so new conversation appears if it was created
      qc.invalidateQueries({ queryKey: conversationKeys.all() })
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
      qc.invalidateQueries({ queryKey: conversationKeys.all() })
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
        { queryKey: conversationKeys.all() },
        (old: unknown) => {
          if (!Array.isArray(old)) return old
          return old.map((conv: { id: string; unread_count: number }) =>
            conv.id === conversationId ? { ...conv, unread_count: 0 } : conv
          )
        }
      )
      // Reading a chat changes the badge counts — refetch the summary so the
      // nav badge and the Chats/Requests tab badges update immediately.
      qc.invalidateQueries({ queryKey: conversationKeys.unreadSummary() })
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
      qc.invalidateQueries({ queryKey: conversationKeys.all() })
    },
  })
}