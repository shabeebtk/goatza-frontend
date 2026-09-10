/**
 * The canonical, absolute URL of a post — what gets copied and shared natively
 * out of the share sheet.
 *
 * Sibling of profileUrl.ts and recruitmentUrl.ts, and the same rule: there is
 * exactly one URL per post and this builds it. `useNavigation()` returns an
 * org-admin-scoped path when the acting actor is inside the dashboard, which is
 * right for in-app routing and wrong for a link somebody pastes into WhatsApp.
 *
 * Unlike a profile or a recruitment, `/posts/<id>` lives in the `(autheticated)`
 * group — there is no public post page yet. A signed-out recipient therefore
 * lands on the auth screen rather than the post, which is why the share sheet
 * itself is behind the login wall for posts. When a public post route ships,
 * this is the one place that has to change.
 */

export function postPath(postId: string): string {
  return `/posts/${postId}`
}

export function postUrl(postId: string): string {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "")

  // Falls back to the running origin so a preview deployment (or a dev box
  // without the env var set) still produces a working link.
  const origin =
    configured || (typeof window !== "undefined" ? window.location.origin : "")

  return `${origin}${postPath(postId)}`
}
