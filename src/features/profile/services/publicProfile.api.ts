/**
 * The public (logged-out) profile bundle, fetched with plain `fetch`.
 *
 * Deliberately NOT the shared axios instance. `core/api/axios.ts` reads
 * `useAuthStore` in a request interceptor, and a Zustand store on the server is
 * a module-level singleton shared across every concurrent request — reaching
 * for it during SSR is both wrong (there is no session) and unsafe (one
 * visitor's state could bleed into another's render). Everything here runs on
 * the server, so it uses the platform primitive and sends no credentials.
 *
 * These endpoints are anonymous by design (see core/public_urls.py on the
 * backend), so there is no token to send in the first place.
 */

import type { Post } from "@/features/posts/services/posts.api"

// ── Types (mirror the backend allow-list serializers) ─────────

export type PublicLocation = {
  name: string
  city: string
  /** ISO-3166 alpha-2, e.g. "IN". */
  country_code: string
}

export type PublicSport = {
  name: string
  icon_name: string
  icon_url: string
  experience_level: string
  is_primary: boolean
}

export type PublicPosition = {
  name: string
  sport: string
  is_primary: boolean
}

/**
 * One of the primary sport's configurable attributes, with this player's value
 * for it. Sport-agnostic by construction — "Preferred foot" for a footballer,
 * "Batting style" for a cricketer, no code here knowing either exists.
 *
 * The backend narrows `data_type` to select | boolean | number: `text` is
 * arbitrarily long and `multi_select` is comma soup, and both are unrenderable
 * in a share-card slot sized for two words.
 */
export type PublicSportAttribute = {
  name: string
  data_type: "select" | "boolean" | "number"
  value: string
}

export type PublicPrimarySport = {
  sport: string
  icon_name: string
  icon_url: string
  experience_level: string
  primary_position: string | null
  attributes: PublicSportAttribute[]
}

/**
 * A user's public header. Note what is NOT here and cannot be: email, phone,
 * verification flags, raw birthdate, latitude/longitude. `age_group` is the
 * server-derived badge ("U17" / "Senior") that replaces the birthdate.
 */
export type PublicUserProfile = {
  id: string
  username: string
  role: string
  created_at: string
  /**
   * Later of the user's and the profile's own timestamps. Only used as the
   * share card's cache-buster — the card is cached hard, so an edited profile
   * has to change this to produce a fresh one.
   */
  updated_at: string
  name: string
  headline: string
  about: string
  profile_photo: string
  cover_photo: string
  followers_count: number
  following_count: number
  connections_count: number
  height_cm: number | null
  weight_kg: number | null
  age_group: string | null
  location: PublicLocation | null
  sports: PublicSport[]
  positions: PublicPosition[]
  primary_sport: PublicPrimarySport | null
}

export type PublicOrgSport = {
  /** The sport's catalog id — public reference data, used as a render key. */
  id: string
  name: string
  icon_name: string
  icon_url: string
  is_primary: boolean
}

export type PublicOrgLocation = {
  id: string
  name: string
  address: string
  city: string
  state: string
  country_code: string
  latitude: number | null
  longitude: number | null
  is_primary: boolean
}

export type PublicOrganizationProfile = {
  id: string
  username: string
  name: string
  type: string
  is_verified: boolean
  created_at: string
  logo: string
  cover_image: string
  headline: string
  description: string
  website: string
  level: string
  followers_count: number
  following_count: number
  posts_count: number
  sports: PublicOrgSport[]
  locations: PublicOrgLocation[]
}

export type PublicPostsPage = {
  count: number
  limit: number
  offset: number
  results: Post[]
}

/** Career and achievement rows are the same shape the in-app profile renders. */
export type PublicCareerEntry = Record<string, unknown> & { id: string }
export type PublicAchievement = Record<string, unknown> & { id: string }
export type PublicHighlight = Record<string, unknown> & { id: string }
export type PublicRecruitment = Record<string, unknown> & { id: string }

export type PublicUserBundle = {
  type: "user"
  profile: PublicUserProfile
  highlights: PublicHighlight[]
  career: PublicCareerEntry[]
  achievements: PublicAchievement[]
  posts: PublicPostsPage
}

export type PublicOrgBundle = {
  type: "organization"
  profile: PublicOrganizationProfile
  recruitments: PublicRecruitment[]
  posts: PublicPostsPage
}

// ── Base URL ──────────────────────────────────────────────────

const stripSlash = (value: string) => value.replace(/\/+$/, "")

/**
 * Canonical absolute origin of the site — for og:url, canonical links, the
 * sitemap and the share card.
 *
 * NEXT_PUBLIC_SITE_URL is the intended source, but it is a value somebody has
 * to remember to set in the Vercel dashboard, and when it is missing every
 * absolute URL this app emits silently becomes a relative one that no scraper
 * follows. So Vercel's own injected vars are the fallback:
 * VERCEL_PROJECT_PRODUCTION_URL first (the stable production domain — a
 * canonical URL must NOT be a per-deployment hostname), then VERCEL_URL.
 */
export function siteOrigin(): string {
  const configured = stripSlash(process.env.NEXT_PUBLIC_SITE_URL ?? "")
  if (configured) return configured

  const vercel =
    process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.NEXT_PUBLIC_VERCEL_URL ||
    process.env.VERCEL_URL

  if (vercel) return `https://${stripSlash(vercel)}`

  // Last resort in the browser. Never available on the server, which is why
  // the vars above matter.
  if (typeof window !== "undefined") return window.location.origin

  return ""
}

/**
 * Where to send an API request from wherever this is running.
 *
 * The two environments want different answers, and conflating them is what
 * broke production:
 *
 *   Browser — a path-shaped NEXT_PUBLIC_API_URL ("/api") is exactly right. It
 *     resolves against the current origin, stays same-origin (no CORS, cookies
 *     ride along), and Vercel's rewrite does the proxying.
 *
 *   Server — a relative URL is not a URL. `fetch("/api/…")` throws
 *     "Failed to parse URL", which used to be swallowed into a null bundle and
 *     rendered as a hard 404 on every profile page. So the server needs an
 *     absolute origin, and it must not depend on one hand-set env var.
 *
 * Server resolution order:
 *   1. API_ORIGIN — an explicit, server-only origin pointing STRAIGHT at
 *      Django. Preferred in production: going through the site origin means the
 *      serverless function calls back into Vercel's edge and out again, which
 *      is two extra network hops and a rewrite that can be reconfigured out
 *      from under us.
 *   2. An already-absolute NEXT_PUBLIC_API_URL (local dev points at Django).
 *   3. The path-shaped value joined onto siteOrigin() — the Vercel rewrite
 *      path, now with a reliable origin in front of it.
 *
 * Never emit a trailing slash: `/api` is a rewrite, and `/api/public/…/`
 * round-trips through a Vercel 308 into Django's APPEND_SLASH 301, which drops
 * the `/api` prefix and 404s — in production only.
 */
function apiBase(): string {
  const configured = stripSlash(process.env.NEXT_PUBLIC_API_URL ?? "")

  if (typeof window !== "undefined") return configured

  const explicit = stripSlash(process.env.API_ORIGIN ?? "")
  if (explicit) return explicit

  if (/^https?:\/\//i.test(configured)) return configured

  const origin = siteOrigin()
  return origin ? `${origin}${configured}` : ""
}

// ── Fetchers ──────────────────────────────────────────────────

/**
 * Why a public fetch produced no data.
 *
 * The distinction is load-bearing and its absence was a bug: "the profile is
 * not publicly visible" and "we could not reach the API" both used to come back
 * as null, and the caller turned both into a hard 404. A misconfigured
 * environment therefore 404'd every profile on the site, for logged-in users
 * too, with nothing in the logs.
 */
export type PublicFetchResult<T> =
  | { status: "ok"; data: T }
  /** The API answered, and the answer is that this is not publicly visible. */
  | { status: "not_found" }
  /** We never got a usable answer — misconfigured, unreachable, or a 5xx. */
  | { status: "unavailable"; reason: string }

async function fetchPublic<T>(path: string): Promise<PublicFetchResult<T>> {
  const base = apiBase()

  if (!base) {
    // Loud on purpose. This is the failure that is invisible from the outside:
    // the page renders, it just renders as "not found" for everyone.
    console.error(
      "[publicProfile] No API base URL. On the server, set API_ORIGIN " +
        "(preferred) or NEXT_PUBLIC_SITE_URL so the path-shaped " +
        "NEXT_PUBLIC_API_URL can be made absolute."
    )
    return { status: "unavailable", reason: "no_api_base" }
  }

  try {
    const res = await fetch(`${base}${path}`, {
      headers: { Accept: "application/json" },
      // Matches `export const revalidate = 60` on the pages. ISR is what makes
      // a viral link cheap: thousands of opens, one origin hit a minute.
      next: { revalidate: 60 },
    })

    // A 404 is the backend deliberately refusing to distinguish hidden,
    // deactivated, usernameless and nonexistent. Anything else is our problem,
    // not the profile's.
    if (res.status === 404) return { status: "not_found" }

    if (!res.ok) {
      console.error(`[publicProfile] ${res.status} for ${path}`)
      return { status: "unavailable", reason: `http_${res.status}` }
    }

    const body = await res.json()
    if (!body?.success) return { status: "not_found" }

    return { status: "ok", data: body.data as T }
  } catch (error) {
    console.error(`[publicProfile] fetch failed for ${path}`, error)
    return { status: "unavailable", reason: "fetch_failed" }
  }
}

/**
 * `T | null` view of the above, for callers that genuinely cannot act on the
 * difference (the share-card route: no data means no card, either way).
 */
async function fetchBundle<T>(path: string): Promise<T | null> {
  const result = await fetchPublic<T>(path)
  return result.status === "ok" ? result.data : null
}

/**
 * The full result, for the page components — they must treat "not publicly
 * visible" and "API unreachable" differently. See PublicProfileView.
 */
export function getPublicUserProfileResult(
  username: string
): Promise<PublicFetchResult<PublicUserBundle>> {
  return fetchPublic<PublicUserBundle>(
    `/public/profile/${encodeURIComponent(username)}`
  )
}

export function getPublicOrganizationProfileResult(
  username: string
): Promise<PublicFetchResult<PublicOrgBundle>> {
  return fetchPublic<PublicOrgBundle>(
    `/public/organization/${encodeURIComponent(username)}`
  )
}

export function getPublicUserProfile(
  username: string
): Promise<PublicUserBundle | null> {
  return fetchBundle<PublicUserBundle>(
    `/public/profile/${encodeURIComponent(username)}`
  )
}

export function getPublicOrganizationProfile(
  username: string
): Promise<PublicOrgBundle | null> {
  return fetchBundle<PublicOrgBundle>(
    `/public/organization/${encodeURIComponent(username)}`
  )
}

/**
 * A page of a profile's public posts, for the standalone /posts route.
 *
 * The limit is higher than the bundle's, because this page is the posts and
 * nothing else. It is capped server-side (PUBLIC_POSTS_MAX_LIMIT), so asking
 * for more just gets the cap.
 */
export function getPublicUserPosts(
  username: string,
  limit = 30
): Promise<PublicPostsPage | null> {
  return fetchBundle<PublicPostsPage>(
    `/public/profile/${encodeURIComponent(username)}/posts?limit=${limit}`
  )
}

export function getPublicOrganizationPosts(
  username: string,
  limit = 30
): Promise<PublicPostsPage | null> {
  return fetchBundle<PublicPostsPage>(
    `/public/organization/${encodeURIComponent(username)}/posts?limit=${limit}`
  )
}
