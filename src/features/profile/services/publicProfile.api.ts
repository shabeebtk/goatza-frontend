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

/**
 * Absolute origin for the API, usable from the server.
 *
 * In production `NEXT_PUBLIC_API_URL` is the Vercel rewrite path `/api`, which
 * the browser resolves against the current origin but `fetch` on the server
 * cannot — a relative URL there throws. So a path-shaped value is joined onto
 * NEXT_PUBLIC_SITE_URL; an already-absolute one (local dev points straight at
 * Django) is used as-is.
 *
 * Never emit a trailing slash: `/api` is a rewrite, and `/api/public/…/`
 * round-trips through a Vercel 308 into Django's APPEND_SLASH 301, which drops
 * the `/api` prefix and 404s — in production only.
 */
function apiBase(): string {
  const configured = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "")

  if (/^https?:\/\//i.test(configured)) return configured

  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "")
  return `${site}${configured}`
}

/** Absolute canonical origin of the site, for OG tags and canonical links. */
export function siteOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "")
}

// ── Fetchers ──────────────────────────────────────────────────

/**
 * One round trip for the whole page. `null` means 404 — the profile does not
 * exist, is deactivated, has no username, or its owner turned the public
 * profile off. The backend deliberately does not distinguish them, and neither
 * does the caller: all four render notFound().
 *
 * Any other failure also returns null rather than throwing. A 500 from the API
 * during a crawl should produce a plain 404 page, not an unhandled error
 * boundary on a URL somebody just shared.
 */
async function fetchBundle<T>(path: string): Promise<T | null> {
  const base = apiBase()
  if (!base) return null

  try {
    const res = await fetch(`${base}${path}`, {
      headers: { Accept: "application/json" },
      // Matches `export const revalidate = 60` on the pages. ISR is what makes
      // a viral link cheap: thousands of opens, one origin hit a minute.
      next: { revalidate: 60 },
    })

    if (!res.ok) return null

    const body = await res.json()
    if (!body?.success) return null

    return body.data as T
  } catch {
    return null
  }
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
