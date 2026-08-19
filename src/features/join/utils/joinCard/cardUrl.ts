/**
 * Where a founding-player card lives.
 *
 * One builder, the same principle as shareCard/cardUrl.ts: the URL shape can
 * only be wrong in one place. Today the sole caller is the download button on
 * the /join success screen; when the card is also linked from a confirmation
 * email or an admin view, they come through here rather than concatenating a
 * path of their own.
 */

/**
 * Deliberately NOT under `/api/`.
 *
 * `vercel.json` rewrites every `/api/:path*` request straight to Django, so a
 * Next route handler under that prefix is unreachable in production — the
 * request never reaches Vercel's function, Django 404s a path it has never
 * heard of, and the only clue is a Cloudflare header on the response. Local dev
 * hides it completely: `next dev` does not apply `vercel.json`.
 *
 * `/api` belongs to the backend proxy in this architecture. Anything Next
 * serves itself lives outside it — hence `/card`, alongside CARD_ROUTE.
 */
export const JOIN_CARD_ROUTE = "/card/join"

interface JoinCardUrlOptions {
  /**
   * Absolute origin. Omitted for an `<img src>` or a same-origin download,
   * required anywhere the URL leaves the page (an email, a share sheet).
   */
  origin?: string
}

/**
 * The card URL for one signup.
 *
 * NO query string, and nothing to version.
 *
 * The profile card carries `format`, `slots`, `qr` and a `v=` cache-buster
 * because a profile is edited and its card is composed by the person sharing
 * it. A signup row is neither: it is written once by
 * `PlayerSignupService.create` and never updated — no endpoint mutates one, and
 * a repeat submission returns the existing row untouched rather than changing
 * it. There is exactly one image per ref code, forever, so the ref code alone
 * is the whole identity of the resource.
 */
export function buildJoinCardUrl(
  ref: string,
  { origin = "" }: JoinCardUrlOptions = {},
): string {
  return `${origin}${JOIN_CARD_ROUTE}/${encodeURIComponent(ref)}`
}

/** The filename the browser saves it under. Carries the ref code so a player
 *  with several screenshots can tell which is theirs. */
export function joinCardFileName(ref: string): string {
  return `goatza-founding-player-${ref}.png`
}
