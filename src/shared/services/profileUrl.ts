/**
 * The canonical, absolute URL of a profile — what gets copied, shared natively,
 * and pointed at by `alternates.canonical` on the public page.
 *
 * Deliberately NOT useNavigation().toProfile: that returns an org-admin-scoped
 * path when the acting actor is inside the dashboard, which is right for in-app
 * routing and wrong for a link somebody pastes into WhatsApp. There is exactly
 * one public URL per profile and this builds it.
 */

export type ProfileUrlKind = "user" | "organization"

export function profilePath(username: string, kind: ProfileUrlKind): string {
  return kind === "organization"
    ? `/organization/profile/${username}`
    : `/profile/${username}`
}

export function profileUrl(username: string, kind: ProfileUrlKind): string {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "")

  // Falls back to the running origin so a preview deployment (or a dev box
  // without the env var set) still produces a working link.
  const origin =
    configured || (typeof window !== "undefined" ? window.location.origin : "")

  return `${origin}${profilePath(username, kind)}`
}
