import { resolveNotificationHref } from "@/features/Notifications/services/notificationHref"
import type { NotificationType } from "@/features/Notifications/services/notifications.api"
import type { ToastContextValue, ToastVariant } from "@/shared/components/ui/Toast/Toast"

/**
 * Foreground push → toast.
 *
 * Only the PRESENTATION is decided here. Title and body come from the payload
 * (the backend owns notification copy) and the action target is always
 * `data.url` (the backend owns notification URLs) — this file builds no paths
 * of its own. It used to, for four of the fifteen types, which is how the
 * toast ended up pointing at /post/<id> long after the in-app list had moved
 * to /posts/<id>.
 */

type ToastPresentation = {
  /** Shown in place of the actor avatar when the payload carries none. */
  icon: string
  variant: ToastVariant
  duration: number
  actionLabel: string
}

// Icons match NOTIF_ICON in NotificationsList so a toast and the row it later
// becomes read as the same event. Longer durations go to the types that ask
// the reader to DO something rather than just informing them.
const TOAST_PRESENTATION: Record<NotificationType, ToastPresentation> = {
  follow: {
    icon: "mdi:account-plus",
    variant: "default",
    duration: 4000,
    actionLabel: "View profile",
  },
  follow_back: {
    icon: "mdi:account-check",
    variant: "default",
    duration: 4000,
    actionLabel: "View profile",
  },
  like: {
    icon: "mdi:heart",
    variant: "default",
    duration: 4000,
    actionLabel: "View post",
  },
  comment: {
    icon: "mdi:comment",
    variant: "info",
    duration: 5000,
    actionLabel: "Reply",
  },
  mention: {
    icon: "mdi:at",
    variant: "info",
    duration: 5000,
    actionLabel: "View post",
  },
  message: {
    icon: "mdi:message-text",
    variant: "info",
    duration: 5000,
    actionLabel: "Open chat",
  },
  recruitment_application: {
    icon: "mdi:account-multiple-plus",
    variant: "info",
    duration: 5000,
    actionLabel: "View applicants",
  },
  recruitment_application_status: {
    icon: "mdi:clipboard-check-outline",
    variant: "info",
    duration: 6000,
    actionLabel: "View application",
  },
  career_verification_request: {
    icon: "mdi:shield-search",
    variant: "warning",
    duration: 6000,
    actionLabel: "Review",
  },
  career_verified: {
    icon: "mdi:check-decagram",
    variant: "success",
    duration: 5000,
    actionLabel: "View profile",
  },
  career_rejected: {
    icon: "mdi:shield-off-outline",
    variant: "default",
    duration: 5000,
    actionLabel: "View profile",
  },
  career_add_prompt: {
    icon: "mdi:timeline-plus-outline",
    variant: "success",
    duration: 6000,
    actionLabel: "Add to career",
  },
  achievement_verification_request: {
    icon: "mdi:trophy-outline",
    variant: "warning",
    duration: 6000,
    actionLabel: "Review",
  },
  achievement_verified: {
    icon: "mdi:check-decagram",
    variant: "success",
    duration: 5000,
    actionLabel: "View profile",
  },
  achievement_rejected: {
    icon: "mdi:shield-off-outline",
    variant: "default",
    duration: 5000,
    actionLabel: "View profile",
  },
}

// A type this build doesn't know about still gets an action — the URL is
// resolved server-side, so there is nothing for the client to understand.
const FALLBACK_PRESENTATION: ToastPresentation = {
  icon: "mdi:bell",
  variant: "default",
  duration: 4000,
  actionLabel: "View",
}

export const handleNotificationToast = (
  data: Record<string, string>,
  toast: ToastContextValue,
  /**
   * Client-side navigation — pass Next's `router.push`. Assigning
   * `window.location.href` here reloaded the whole app on every toast click,
   * throwing away the React Query cache and dropping the chat websocket.
   */
  navigate: (href: string) => void
) => {
  const presentation =
    TOAST_PRESENTATION[data.type as NotificationType] ?? FALLBACK_PRESENTATION

  const href = resolveNotificationHref(data.url)
  const hasAvatar = Boolean(data.actor_avatar)

  toast.show({
    title: data.title || "New notification",
    message: data.body || "",
    // Avatar when the actor has one, the type icon otherwise — Toast prefers
    // `icon` over the avatar when both are set, so they're mutually exclusive.
    avatarSrc: hasAvatar ? data.actor_avatar : undefined,
    avatarInitials: hasAvatar ? data.actor_initials : undefined,
    icon: hasAvatar ? undefined : presentation.icon,
    variant: presentation.variant,
    position: "top-right",
    duration: presentation.duration,
    action: {
      label: presentation.actionLabel,
      onClick: () => navigate(href),
    },
  })
}
