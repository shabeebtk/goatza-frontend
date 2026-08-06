import type { MessageType } from "../services/conversations.api"

/**
 * One-line preview text for a message, shown in the conversations list and
 * anywhere a thread is summarised to a single line.
 *
 * This is the single source of truth for message_type → preview copy, reused
 * by ConversationsList and the live socket update so the two never drift.
 *
 * `isMine` switches to first-person phrasing the way Instagram does:
 *   text            → "You: hey"            / "hey"
 *   shared_post     → "You shared a post"   / "Shared a post"
 *   shared_recruitment → "You shared a recruitment" / "Shared a recruitment"
 *   shared_*_profile → "You shared a profile" / "Shared a profile"
 *   image/video     → "You: 📷 Photo"        / "📷 Photo"
 */

const TEXT_TRUNCATE = 40

export type MessagePreviewInput = {
  message_type: MessageType
  content: string
}

function truncate(text: string): string {
  return text.length > TEXT_TRUNCATE ? text.slice(0, TEXT_TRUNCATE) + "…" : text
}

export function getMessagePreviewText(
  msg: MessagePreviewInput,
  isMine: boolean
): string {
  switch (msg.message_type) {
    case "shared_recruitment":
      return isMine ? "You shared a recruitment" : "Shared a recruitment"

    case "shared_post":
      return isMine ? "You shared a post" : "Shared a post"

    // One line for both profile kinds — "a profile" reads naturally whether the
    // card is a player or a club, and the thread list has no room to say which.
    // Matches MESSAGE_SHARE_NOUN on the backend.
    case "shared_user_profile":
    case "shared_org_profile":
      return isMine ? "You shared a profile" : "Shared a profile"

    case "image":
      return `${isMine ? "You: " : ""}📷 Photo`

    case "video":
      return `${isMine ? "You: " : ""}🎥 Video`

    // System lines are pre-phrased server-side; show verbatim, no prefix.
    case "system":
      return msg.content

    case "text":
    default:
      return `${isMine ? "You: " : ""}${truncate(msg.content)}`
  }
}
