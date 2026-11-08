/**
 * Pages that take the whole phone screen. On these AppNav hides its mobile
 * top bar and tab dock (as it always has on a chat), and AppShell drops the
 * padding it keeps for them. Desktop is unaffected.
 *
 * - `/messages/<who>` — a chat thread, which brings its own header and composer.
 * - `/organization/create` — the create-a-page flow, with its own header,
 *   progress bar and footer; a tab bar under its footer was a mis-tap waiting
 *   to happen.
 */

export const isChatRoute = (pathname: string) => /^\/messages\/.+/.test(pathname)

export const FOCUSED_ROUTES = ["/organization/create"] as const

export function isFocusedRoute(pathname: string): boolean {
  if (isChatRoute(pathname)) return true
  return FOCUSED_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))
}
