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
 * scheme. Being on the origin is necessary, not sufficient: the auth flow, the
 * API rewrite, static files and a handful of other non-pages are refused too
 * (see `BLOCKED_NEXT_PREFIXES`). Every rejection is a null, and every caller
 * turns null into `/home`.
 */

/** Where everyone lands when there is no valid `next`. */
export const DEFAULT_POST_AUTH_PATH = "/home"

/** sessionStorage key used to carry `next` across the Google OAuth round trip. */
const OAUTH_NEXT_KEY = "goatza:auth:next"

/**
 * Same-origin paths that are never a place to land AFTER signing in.
 *
 * Each of these is on the origin, so the open-redirect rules let it through,
 * and each is somewhere a freshly-authenticated user has no business being:
 *
 * - `/auth`      the flow itself. `/auth/google/callback`, `/auth/select-role`,
 *                `/auth/guardian/waiting`, `/auth/forgot-password` — landing in
 *                any of them is a loop or a half-finished step reached out of
 *                order.
 * - `/api`       `vercel.json` rewrites this wholesale to Django, so
 *                `next=/api/user/details` walks the browser out of the app and
 *                into raw JSON.
 * - `/guardian`  the PARENT's consent page (`/guardian/<token>`). It runs on its
 *                own fetch with no JWT; the person who just signed in is never
 *                the one it is for.
 * - `/card`      `card/profile/[username]/route.ts` is a route handler that
 *                returns an image, not a page.
 * - `/_next`, `/_vercel`  build output and framework-owned paths.
 * - `/join`      the pre-launch waitlist; an account has no use for it.
 *
 * Matched on SEGMENT boundaries, never raw `startsWith`: `/auth` blocks `/auth`
 * and `/auth/…` but not `/authentic`, because `app/[username]/page.tsx` treats
 * any unknown top-level path as a vanity profile and `/authentic` is somebody's.
 *
 * The bare root `/` is blocked too, separately: `LandingGate` bounces a signed-in
 * user to `/home` anyway, so it would only ever be a wasted hop.
 */
export const BLOCKED_NEXT_PREFIXES = [
  "/auth",
  "/api",
  "/guardian",
  "/card",
  "/_next",
  "/_vercel",
  "/join",
] as const

/**
 * Longer than any real route plus a generous query string. A `next` past this
 * is not a place someone was, it is padding.
 */
const MAX_NEXT_LENGTH = 512

/** C0 controls and DEL — none of them belong in a URL, encoded or otherwise. */
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/

/**
 * The path in `raw` if it is a safe same-origin destination, else null.
 *
 * Two families of rejection, and every caller inherits both because this is
 * the only place the value is ever read:
 *
 * 1. Leaves the origin — absolute URLs, protocol-relative `//host`, a scheme,
 *    a backslash anywhere (browsers normalise `\` to `/`, so `/\host` and
 *    `/x\..\..host` are `//host` once followed), and anything not starting
 *    with `/`.
 * 2. Stays on the origin but is not a page — `BLOCKED_NEXT_PREFIXES` above,
 *    plus any path segment with a dot in it, which keeps `/manifest.json`,
 *    `/favicon.ico`, `/robots.txt`, `/firebase-messaging-sw.js` and every svg
 *    in `public/` out with one rule instead of a dozen entries. No real route
 *    has a dot in a segment: usernames are `[a-z0-9_]` and every id is a UUID.
 *
 * Prefix and dot checks look at the PATH only, lower-cased. The query string
 * is where `?tab=achievements` and `?v=1.2` legitimately live, and `/AUTH` is
 * `/auth` to the router. `..` is refused outright before any of that, because
 * `/x/../auth` normalises to `/auth` in the browser and would otherwise walk
 * straight past the blocklist. The value comes back exactly as given.
 */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw) return null

  const value = raw.trim()

  if (value.length > MAX_NEXT_LENGTH) return null
  if (CONTROL_CHARS.test(value)) return null

  if (!value.startsWith("/")) return null
  // "//host" escapes the origin once the browser normalises.
  if (value.startsWith("//")) return null
  // So does a backslash — anywhere, not just second. `/\host` is the classic,
  // but `/a\..\evil` gets there too once each `\` becomes `/`.
  if (value.includes("\\")) return null
  // A scheme can't appear in a path-only value; if one does, it isn't one.
  if (value.includes("://")) return null
  // Dot-segments are resolved by the browser before the router sees them,
  // which is exactly how `/x/../auth` would get around the prefix check.
  if (value.includes("..")) return null

  // Everything below looks at the path alone — the query string is allowed to
  // carry dots and blocked words (`?next=/auth` inside `next` is just data).
  const pathEnd = value.search(/[?#]/)
  const path = (pathEnd === -1 ? value : value.slice(0, pathEnd)).toLowerCase()

  // The root is a wasted hop: LandingGate sends a signed-in user to /home.
  if (path === "/") return null
  // A dot in any segment means a static file or a route handler, not a page.
  if (path.includes(".")) return null
  // Segment boundary: the prefix itself, or the prefix followed by `/`.
  const blocked = BLOCKED_NEXT_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  )
  if (blocked) return null

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
