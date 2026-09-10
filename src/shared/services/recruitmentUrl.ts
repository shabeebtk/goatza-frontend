/**
 * The canonical, absolute URL of a recruitment — what gets copied, shared
 * natively, and pointed at by `alternates.canonical` on the public page.
 *
 * Sibling of profileUrl.ts, and the same rule: there is exactly one public URL
 * per posting and this builds it. `useNavigation()` returns an org-admin-scoped
 * path when the acting actor is inside the dashboard, which is right for in-app
 * routing and wrong for a link somebody pastes into WhatsApp.
 *
 * ── Why /r/<id> and not /recruitments/<id> ───────────────────
 *
 * `/recruitments/[recruitmentId]` is taken. It lives in the `(autheticated)`
 * group, and Next.js refuses to build two pages that resolve to the same path,
 * whatever route group they sit in — so the public page cannot share it. The
 * authed route stays exactly where it is (every in-app link points at it) and
 * the SHAREABLE address is `/r/<id>`.
 *
 * Short is a feature here, not a consolation: this is the link that goes in a
 * poster caption and a group chat, next to a uuid that is already 36
 * characters. `/r/` is added to RESERVED in src/app/[username]/page.tsx and to
 * RESERVED_USERNAMES on the backend, like every other top-level segment.
 *
 * The public page sends a signed-in visitor on to `recruitmentDetailPath` — the
 * full authed detail, with apply, save and the application status on it.
 */

/** The public, shareable path. Opens for anyone, logged in or not. */
export function recruitmentPath(recruitmentId: string): string {
  return `/r/${recruitmentId}`
}

/** The authenticated in-app detail — apply, save, application status. */
export function recruitmentDetailPath(recruitmentId: string): string {
  return `/recruitments/${recruitmentId}`
}

export function recruitmentUrl(recruitmentId: string): string {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "")

  // Falls back to the running origin so a preview deployment (or a dev box
  // without the env var set) still produces a working link.
  const origin =
    configured || (typeof window !== "undefined" ? window.location.origin : "")

  return `${origin}${recruitmentPath(recruitmentId)}`
}
