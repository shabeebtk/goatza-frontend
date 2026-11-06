import { Icon } from "@iconify/react"

import Avatar from "@/shared/components/ui/Avatar/Avatar"
import type { ConversationParticipant } from "../../services/conversations.api"

const GLYPH_SIZE = { xs: 14, sm: 18, md: 22, lg: 28 } as const

/**
 * The other side of a thread. A deleted account has no username and no photo, and
 * "DE" from its placeholder name would read as somebody's initials, so it gets the
 * plain default instead.
 */
export default function ChatActorAvatar({
  actor,
  size = "md",
}: {
  actor: Pick<ConversationParticipant, "avatar" | "name" | "username">
  size?: keyof typeof GLYPH_SIZE
}) {
  return (
    <Avatar
      src={actor.avatar || undefined}
      initials={
        actor.username ? (
          actor.name?.slice(0, 2).toUpperCase() || "?"
        ) : (
          <Icon
            icon="mdi:account"
            width={GLYPH_SIZE[size]}
            height={GLYPH_SIZE[size]}
            aria-label="Deleted account"
          />
        )
      }
      size={size}
    />
  )
}
