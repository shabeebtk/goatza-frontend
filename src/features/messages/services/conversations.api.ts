import api from "@/core/api/axios"

// ── Types ────────────────────────────────────────────────────

export type ConversationType = "direct" | "group"
export type ConversationStatus = "active" | "requested"
export type MessageType = "text" | "image" | "video"

export type GetOrCreateConversationResult = {
  conversation_id: string
  status:          ConversationStatus
  is_new:          boolean
  can_message:     boolean
}

export type ConversationParticipant = {
    id: string
    username: string
    name: string
    avatar: string
    type: "user" | "organization"
    headline?: string
}

export type LastMessage = {
    id: string
    content: string
    message_type: MessageType
    sender_id: string
    sender?: ConversationParticipant
    created_at: string
}

export type Conversation = {
    id: string
    type: ConversationType
    status: ConversationStatus
    last_message: LastMessage | null
    last_message_at: string | null
    other_participant: ConversationParticipant
    unread_count: number
}

export type ConversationDetail = Conversation & {
    created_at: string
    is_accepted: boolean
    can_message: boolean
    last_read_at: string | null
    is_last_message_seen: boolean
}

export type Message = {
    id: string
    content: string
    message_type: MessageType
    sender_id: string
    sender?: ConversationParticipant
    created_at: string
}

export type MessagesResponse = {
    results: Message[]
    next_cursor: string | null
    previous: string | null
}

export type ConversationsParams = {
    type?: "active" | "requested"
    search?: string
}

/** Where a message-target search result was sourced from (drives grouping). */
export type MessageTargetSource = "conversation" | "following" | "all"

/**
 * A person or organization surfaced by the messages search box — someone the
 * actor can start (or resume) a conversation with.
 */
export type MessageTarget = {
    id: string
    username: string
    name: string
    avatar: string
    headline: string
    type: "user" | "organization"
    /** Set when a direct conversation already exists → open it directly. */
    conversation_id: string | null
    source: MessageTargetSource
}

/** Aggregate unread badge counts for the current actor. */
export type ConversationUnreadSummary = {
    chats: number       // unread accepted conversations
    requests: number    // unread pending message requests
    total: number       // chats + requests
}

export type MessagesParams = {
    conversation_id: string
    cursor?: string
    limit?: number
}

// ── Conversations ─────────────────────────────────────────────

export const getOrCreateConversationApi = async (
  username: string
): Promise<GetOrCreateConversationResult> => {
  const res = await api.post("/conversations/get-or-create", { username })
  return res.data.data
}

export const getConversationsApi = async (
    params: ConversationsParams = {}
): Promise<Conversation[]> => {
    const res = await api.get("/conversations/list", { params })
    return res.data.data
}

/**
 * Prioritised people / org search for the messages screen. Returns existing
 * chats first, then followings, then everyone else (users + organizations).
 */
export const searchMessageTargetsApi = async (
    query: string,
    limit = 20
): Promise<MessageTarget[]> => {
    const res = await api.get("/conversations/search", {
        params: { q: query, limit },
    })
    return res.data.data
}

export const getConversationsUnreadSummaryApi = async (): Promise<ConversationUnreadSummary> => {
    const res = await api.get("/conversations/unread/summary")
    return res.data.data
}

export const getConversationDetailsApi = async (
    conversationId: string
): Promise<ConversationDetail> => {
    const res = await api.get(`/conversations/${conversationId}/details`)
    return res.data.data
}

export const markConversationReadApi = async (
    conversationId: string
): Promise<void> => {
    await api.post("/conversations/mark/read/all", { conversation_id: conversationId })
}

export const acceptConversationApi = async (
    conversationId: string
): Promise<void> => {
    await api.post("/conversations/accept", { conversation_id: conversationId })
}

// ── Messages ──────────────────────────────────────────────────

export const getMessagesApi = async (
    params: MessagesParams
): Promise<MessagesResponse> => {
    const res = await api.get(`/conversations/messages/list`, { params })
    return res.data.data
}
