import api from "@/core/api/axios"

// ── Types ────────────────────────────────────────────────────

export type ConversationType = "direct" | "group"
export type ConversationStatus = "active" | "requested"
export type MessageType =
  | "text"
  | "image"
  | "video"
  | "system"
  | "shared_post"
  | "shared_recruitment"
  // Two types rather than one generic "shared_profile", mirroring the backend:
  // each carries its own FK and its own preview shape.
  | "shared_user_profile"
  | "shared_org_profile"

// ── Shared-content previews (embedded on shared_* messages) ────

/** ActorMiniSerializer output — the author/org attached to a shared preview. */
export type SharedActorMini = {
  id: string
  username: string
  name: string
  avatar: string
  type: "user" | "organization"
}

/**
 * Preview of a recruitment forwarded into a chat. The backend returns
 * `{ unavailable: true }` (and nothing else) when the recruitment was deleted
 * or is no longer visible to the viewer, so the two shapes are a discriminated
 * union on `unavailable`.
 */
export type SharedRecruitmentPreview =
  | { unavailable: true }
  | {
      unavailable: false
      id: string
      title: string
      org: SharedActorMini
      sport: string
      /** recruitment_type, e.g. "open_trial". */
      type: string
      /** RecruitmentStatus, e.g. "active" | "closed" | "cancelled". */
      status: string
      /** ISO 8601 or null. */
      deadline: string | null
      cover_url: string
    }

/** Preview of a post forwarded into a chat (rendered by a later prompt). */
export type SharedPostPreview =
  | { unavailable: true }
  | {
      unavailable: false
      id: string
      author: SharedActorMini
      text: string
      is_text_truncated: boolean
      thumbnail_url: string
      media_count: number
    }

/**
 * Preview of a person's profile forwarded into a chat.
 *
 * `{ unavailable: true }` when the account was deleted, deactivated, or has no
 * username (and therefore no profile URL to open). Note that a profile whose
 * owner turned OFF the public web view is still available here: that flag
 * governs logged-out visitors only, and everyone in a Goatza chat is signed in.
 */
export type SharedUserProfilePreview =
  | { unavailable: true }
  | {
      unavailable: false
      id: string
      username: string
      name: string
      avatar: string
      headline: string
      /** User.Role value, e.g. "player" | "coach" | "scout" | "org_user". */
      role: string
      primary_sport: string
      primary_position: string
      city: string
      country_code: string
      followers_count: number
    }

/** Preview of an organization's profile forwarded into a chat. */
export type SharedOrgProfilePreview =
  | { unavailable: true }
  | {
      unavailable: false
      id: string
      username: string
      name: string
      logo: string
      /** Organization.Type value, e.g. "club" | "academy". */
      type: string
      /** OrganizationProfile.Level value, e.g. "professional". May be "". */
      level: string
      city: string
      is_verified: boolean
      followers_count: number
    }

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
    /** Seen by the other participant. Only meaningful on messages you sent. */
    is_read?: boolean
    // Present on shared_* last messages so the list can render a preview line
    // without a second fetch. null for other message types.
    shared_recruitment_preview?: SharedRecruitmentPreview | null
    shared_post_preview?: SharedPostPreview | null
    shared_user_profile_preview?: SharedUserProfilePreview | null
    shared_org_profile_preview?: SharedOrgProfilePreview | null
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
    /**
     * When the OTHER participant last read this thread — the read-receipt
     * watermark. Everything you sent at or before it has been seen. Kept live
     * afterwards by the `conversation_read` websocket event.
     */
    other_last_read_at: string | null
    is_last_message_seen: boolean
}

export type Message = {
    id: string
    content: string
    message_type: MessageType
    sender_id: string
    sender?: ConversationParticipant
    created_at: string

    /**
     * Seen by the other participant, as of the moment this payload was built.
     * Only meaningful on messages you sent; always false on the websocket
     * echo, which is broadcast before anyone could have read it.
     */
    is_read?: boolean

    // Shared-content previews — populated for the matching message_type,
    // null otherwise. Resolved against the viewer server-side.
    shared_recruitment_preview?: SharedRecruitmentPreview | null
    shared_post_preview?: SharedPostPreview | null
    shared_user_profile_preview?: SharedUserProfilePreview | null
    shared_org_profile_preview?: SharedOrgProfilePreview | null

    // Media metadata (photo/video messages — schema only for now).
    media_url?: string
    media_thumbnail_url?: string
    media_width?: number | null
    media_height?: number | null
    media_duration_ms?: number | null
    media_size_bytes?: number | null
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

// ── Sharing content into conversations ────────────────────────

/**
 * What can be forwarded into a chat.
 *
 * "user" / "organization" collide by value with ShareRecipient.actor_type, but
 * they answer a different question — WHAT is being shared, not WHO it goes to.
 * The backend keeps the two choice lists separate for the same reason.
 */
export type ShareTargetType = "post" | "recruitment" | "user" | "organization"

export type ShareTarget = {
    type: ShareTargetType
    id: string
}

/** Someone with no existing conversation — the backend get-or-creates one. */
export type ShareRecipient = {
    actor_type: "user" | "organization"
    actor_id: string
}

export type ShareContentPayload = {
    target: ShareTarget
    /** Existing threads to share into. Max 10. */
    conversation_ids?: string[]
    /** People/orgs with no thread yet. Max 10. */
    recipients?: ShareRecipient[]
    /** Optional caption sent alongside the shared content. */
    note?: string
}

/**
 * Why one target failed. Codes come from messaging/services/exceptions.py —
 * treated as an open set here, since the UI falls back to generic copy.
 */
export type ShareFailureReason =
    | "not_a_participant"
    | "conversation_not_found"
    | "content_unavailable"
    | "recipient_not_found"
    | "cannot_share_with_self"
    | (string & {})

export type ShareFailure = {
    /** conversation_id for thread targets, actor_id for recipient targets. */
    id: string
    reason: ShareFailureReason
}

/** Targets are independent — a send can partially succeed. */
export type ShareContentResult = {
    sent: string[]
    failed: ShareFailure[]
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

/**
 * Share a post or recruitment into conversations and/or with people who have
 * no conversation yet. One call per share, however many targets.
 */
export const shareContentApi = async (
    payload: ShareContentPayload
): Promise<ShareContentResult> => {
    const res = await api.post("/conversations/share", payload)
    return res.data.data
}

// ── Messages ──────────────────────────────────────────────────

export const getMessagesApi = async (
    params: MessagesParams
): Promise<MessagesResponse> => {
    const res = await api.get(`/conversations/messages/list`, { params })
    return res.data.data
}

// ── Photo messages ────────────────────────────────────────────

/**
 * The image is already on Cloudinary (signed direct upload). This just records
 * the message; the backend re-validates the URL belongs to us + the sender's
 * chat folder before trusting it.
 */
export type SendImageMessagePayload = {
    media_url: string
    media_public_id: string
    width?: number
    height?: number
    size_bytes?: number
    caption?: string
}

export const sendImageMessageApi = async (
    conversationId: string,
    payload: SendImageMessagePayload
): Promise<Message> => {
    const res = await api.post(
        `/conversations/${conversationId}/messages/media`,
        payload
    )
    return res.data.data
}

export type SendVideoMessagePayload = SendImageMessagePayload & {
    duration_ms?: number
}

export const sendVideoMessageApi = async (
    conversationId: string,
    payload: SendVideoMessagePayload
): Promise<Message> => {
    const res = await api.post(
        `/conversations/${conversationId}/messages/media`,
        { media_type: "video", ...payload }
    )
    return res.data.data
}

/**
 * Unsend a message for everyone. Only the actor that sent it may delete it —
 * the backend soft-deletes and broadcasts "message_deleted" over the chat
 * socket, so other open windows drop it too.
 */
export const deleteMessageApi = async (
    conversationId: string,
    messageId: string
): Promise<void> => {
    await api.delete(`/conversations/${conversationId}/messages/${messageId}`)
}
