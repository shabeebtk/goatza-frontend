/**
 * Where to send someone after they sign in — the `?next=` contract.
 *
 * Public profiles made this necessary: a visitor who taps Follow on a shared
 * profile and lands on the home feed has been dumped somewhere they did not ask
 * for, and the click is wasted. Every login wall passes the page it was opened
 * from, and the auth flow returns there.
 *
 * `safeNextPath` is the security half, and is the reason every read of the
 * param goes through this module. A `next` that is attacker-controlled and
 * followed blindly is an open redirect: `/auth?next=https://evil.example` would
 * hand a freshly-authenticated user to a phishing page wearing our referrer.
 * Only same-origin ABSOLUTE PATHS are accepted — one leading slash, never two
 * (`//evil.example` is protocol-relative and leaves the origin), and never a
 * scheme.
 */

/** Where everyone lands when there is no valid `next`. */
export const DEFAULT_POST_AUTH_PATH = "/home"

/** sessionStorage key used to carry `next` across the Google OAuth round trip. */
const OAUTH_NEXT_KEY = "goatza:auth:next"

/**
 * The path in `raw` if it is a safe same-origin destination, else null.
 *
 * Rejected: absolute URLs, protocol-relative `//host`, backslash variants that
 * some browsers normalise to `//`, and anything not starting with `/`.
 */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw) return null

  const value = raw.trim()

  if (!value.startsWith("/")) return null
  // "//host" and "/\host" both escape the origin once the browser normalises.
  if (value.startsWith("//") || value.startsWith("/\\")) return null
  // A scheme can't appear in a path-only value; if one does, it isn't one.
  if (value.includes("://")) return null

  return value
}

/**
 * `/auth?next=…` for a login wall or a public nav button.
 *
 * `mode` picks the tab AuthCard opens on — it already reads `?mode=signup`.
 */
export function authUrlWithNext(
  next: string | null | undefined,
  mode: "login" | "signup" = "login"
): string {
  const params = new URLSearchParams()

  if (mode === "signup") params.set("mode", "signup")

  const safe = safeNextPath(next)
  if (safe) params.set("next", safe)

  const query = params.toString()
  return query ? `/auth?${query}` : "/auth"
}

/**
 * Read the destination out of the auth page's own query string.
 * Accepts anything with a `.get`, so it works with both `URLSearchParams` and
 * Next's `ReadonlyURLSearchParams`.
 */
export function postAuthPath(
  searchParams: { get: (key: string) => string | null } | null | undefined
): string {
  return (
    safeNextPath(searchParams?.get("next")) ?? DEFAULT_POST_AUTH_PATH
  )
}

/**
 * Stash `next` before handing control to Google.
 *
 * The OAuth `state` is minted and validated by the backend, so there is nowhere
 * in that round trip to thread an app-level destination. sessionStorage is
 * scoped to the tab that started the flow and is read exactly once on return,
 * which is the shortest-lived place that survives a full-page navigation.
 */
export function rememberOAuthNext(next: string | null | undefined): void {
  if (typeof window === "undefined") return

  const safe = safeNextPath(next)

  try {
    if (safe) window.sessionStorage.setItem(OAUTH_NEXT_KEY, safe)
    else window.sessionStorage.removeItem(OAUTH_NEXT_KEY)
  } catch {
    // Private mode / storage disabled — the flow still works, it just lands on
    // the default. Never let this throw and break the sign-in.
  }
}

/** Consume the stashed destination (single use), or the default. */
export function takeOAuthNext(): string {
  if (typeof window === "undefined") return DEFAULT_POST_AUTH_PATH

  try {
    const stored = window.sessionStorage.getItem(OAUTH_NEXT_KEY)
    window.sessionStorage.removeItem(OAUTH_NEXT_KEY)
    return safeNextPath(stored) ?? DEFAULT_POST_AUTH_PATH
  } catch {
    return DEFAULT_POST_AUTH_PATH
  }
}
