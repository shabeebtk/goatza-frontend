import { useQuery, useMutation, useInfiniteQuery, useQueryClient } from "@tanstack/react-query"
import {
  getOrCreateConversationApi,
  getConversationsApi,
  getConversationDetailsApi,
  getMessagesApi,
  markConversationReadApi,
  acceptConversationApi,
  type ConversationsParams,
  type MessagesParams,
} from "../services/conversations.api"

// ── Query keys ───────────────────────────────────────────────

export const conversationKeys = {
  all:     ()                               => ["conversations"]                          as const,
  list:    (params: ConversationsParams)    => ["conversations", "list", params]          as const,
  detail:  (id: string)                     => ["conversations", "detail", id]            as const,
  messages:(id: string)                     => ["conversations", "messages", id]          as const,
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