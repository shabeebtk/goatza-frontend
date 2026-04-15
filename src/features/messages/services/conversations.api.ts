import api from "@/core/api/axios"

// ── Types ────────────────────────────────────────────────────

export type ConversationType = "direct" | "group"
export type ConversationStatus = "active" | "requested"
export type MessageType = "text" | "image" | "video"

export type ConversationUser = {
    id: string
    username: string
    name: string
    profile_photo: string
    headline: string
}

export type LastMessage = {
    id: string
    content: string
    message_type: MessageType
    sender_id: string
    sender_user?: {
        id: string
        username: string
        name: string
        profile_photo: string
        headline?: string
    }
    created_at: string
}

export type Conversation = {
    id: string
    type: ConversationType
    status: ConversationStatus
    last_message: LastMessage | null
    last_message_at: string | null
    other_user: ConversationUser
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
    sender_user?: {
        id: string
        username: string
        name: string
        profile_photo: string
        headline?: string
    }
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

export type MessagesParams = {
    conversation_id: string
    cursor?: string
    limit?: number
}

// ── Conversations ─────────────────────────────────────────────

export const getConversationsApi = async (
    params: ConversationsParams = {}
): Promise<Conversation[]> => {
    const res = await api.get("/conversations/list", { params })
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

// ── Messages ──────────────────────────────────────────────────

export const getMessagesApi = async (
    params: MessagesParams
): Promise<MessagesResponse> => {
    const res = await api.get(`/conversations/messages/list`, { params })
    return res.data.data
}
