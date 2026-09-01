/**
 * Where a BROWSER-side request to the API goes.
 *
 * Lives here rather than in one feature because more than one public surface
 * needs it — the waitlist form and the logged-out problem report so far — and
 * the alternative is a third copy of the same three lines drifting apart.
 *
 * A path-shaped `NEXT_PUBLIC_API_URL` ("/api") is exactly right for this: it
 * resolves against the current origin, stays same-origin, and Vercel's rewrite
 * proxies it to Django. Local dev points the same var straight at Django's
 * absolute origin; both work unchanged.
 *
 * NEVER EMIT A TRAILING SLASH. `/api` is a rewrite, and `/api/public/…/`
 * round-trips through a Vercel 308 into Django's APPEND_SLASH 301, which drops
 * the `/api` prefix and 404s — in production only, which is the worst place to
 * find out.
 *
 * This is the BROWSER half deliberately. Server-rendered public reads need the
 * origin resolved properly (API_ORIGIN, siteOrigin, the rewrite made absolute)
 * because a relative URL is not a URL during SSR — that lives in
 * `features/profile/services/publicProfile.api.ts` and is exported there as
 * `fetchPublic`. Anything running on the server wants that, not this.
 */

const stripSlash = (value: string) => value.replace(/\/+$/, "")

export function apiBase(): string {
  return stripSlash(process.env.NEXT_PUBLIC_API_URL ?? "")
}
