/**
 * The client's half of notification deep-linking: accept the backend's URL, or
 * refuse it.
 *
 * There is deliberately no path-building here. The backend resolves every
 * notification URL against the recipient's route space (see
 * notifications/services/deeplink_service.py); re-deriving one from `type` and
 * a handful of ids is exactly how the in-app list, the push payload and the
 * foreground toast came to disagree with each other.
 *
 * The only judgement this makes is whether the value is a same-origin path.
 * `url` reaches the client through an FCM data payload, which is not a trusted
 * channel — anything that could navigate off-origin or execute is dropped.
 */

/** Where a notification with no usable URL goes. Never "/" and never "#". */
const NOTIFICATIONS_FALLBACK = "/notifications"

export function resolveNotificationHref(url?: string | null): string {
  if (!url) return NOTIFICATIONS_FALLBACK

  // Must be a relative path. "//evil.com" is protocol-relative and leaves the
  // origin despite starting with "/", and browsers normalise a backslash to a
  // slash in that position — so the second character is checked too.
  // "http:" and "javascript:" fail the first test outright.
  if (!url.startsWith("/")) return NOTIFICATIONS_FALLBACK
  if (url[1] === "/" || url[1] === "\\") return NOTIFICATIONS_FALLBACK

  return url
}
