import type { MetadataRoute } from "next"

import {
  fetchPublic,
  siteOrigin,
} from "@/features/profile/services/publicProfile.api"

/**
 * The sitemap `robots.ts` already advertises at `${site}/sitemap.xml`.
 *
 * What is in it follows directly from what robots.ts allows: the marketing and
 * legal pages, plus the two profile surfaces. Nothing behind AuthGuard, which
 * rules out recruitment DETAIL pages — they live in the authenticated route
 * group and robots.ts disallows `/recruitments`, so listing them would be
 * asking Google to crawl a redirect. Recruitments reach the index through the
 * org that published them (`/organization/profile/<username>` renders the live
 * ones), which is why the ORG, not the listing, is the indexable unit.
 *
 * The handles come from `GET /public/sitemap/urls` — a backend allow-list of
 * `{username, updated_at}` and nothing else. The URL SHAPE is decided here, in
 * the app that owns the routes: rename the route group tomorrow and this file
 * is the only thing that changes.
 *
 * Degrading, in two independent steps, because a sitemap is not worth failing
 * a build over:
 *
 *   * no site origin  → the static entries, as relative paths. Same graceful
 *     handling as robots.ts, which simply omits its `sitemap:` line.
 *   * API unreachable → the static entries, absolute. A sitemap missing its
 *     profiles costs some crawl discovery; a route that throws costs the whole
 *     file, including the pages that never needed the API.
 */

/** One row of the backend feed. Mirrors the allow-list exactly. */
type SitemapHandle = {
  username: string
  /** ISO 8601, the profile row's own `updated_at`. */
  updated_at: string
}

type SitemapFeed = {
  users: SitemapHandle[]
  organizations: SitemapHandle[]
}

/**
 * An hour, matching `SITEMAP_TTL` on the endpoint. There is no point revalidating
 * faster than the response behind it changes, and a crawler acts on a sitemap
 * over days regardless.
 */
const FEED_REVALIDATE_SECONDS = 3600

/**
 * Legal pages change on a version bump, months apart, and they are here for
 * completeness rather than traffic — hence the floor priority. The home page
 * is the entry point and carries the highest.
 */
const STATIC_ROUTES: Array<{
  path: string
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]
  priority: number
}> = [
  { path: "/", changeFrequency: "daily", priority: 1 },
  { path: "/terms", changeFrequency: "monthly", priority: 0.3 },
  { path: "/privacy", changeFrequency: "monthly", priority: 0.3 },
  { path: "/guidelines", changeFrequency: "monthly", priority: 0.3 },
  { path: "/safety", changeFrequency: "monthly", priority: 0.3 },
]

/** Profiles are the point of the public route group, so they rank just under home. */
const PROFILE_PRIORITY = 0.7

const stripSlash = (value: string) => value.replace(/\/+$/, "")

/**
 * `updated_at` → a Date, or undefined.
 *
 * `lastModified` is optional in the spec and an `Invalid Date` serializes to
 * the string "Invalid Date", which makes the whole `<url>` entry invalid XML
 * for a crawler. Dropping the hint is strictly better than poisoning the entry.
 */
function lastModified(value: string): Date | undefined {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

function profileEntries(
  handles: SitemapHandle[],
  site: string,
  prefix: string
): MetadataRoute.Sitemap {
  return handles.map((handle) => ({
    url: `${site}${prefix}/${handle.username}`,
    lastModified: lastModified(handle.updated_at),
    changeFrequency: "weekly" as const,
    priority: PROFILE_PRIORITY,
  }))
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // siteOrigin(), not a bare read of NEXT_PUBLIC_SITE_URL: it prefers that var
  // and strips trailing slashes exactly as robots.ts does, then falls back to
  // Vercel's own injected production domain. Its docstring names the sitemap as
  // one of its callers — a canonical URL and a sitemap URL are the same value,
  // and having two ways to compute it is how they drift.
  const site = stripSlash(siteOrigin())

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    // `${site}/` for home so an unset origin still yields "/" rather than "".
    url: route.path === "/" ? `${site}/` : `${site}${route.path}`,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }))

  // Without an absolute origin every profile URL would be a bare path, which
  // no crawler resolves against anything useful. The static half is at least
  // still correct relative to the site it is served from.
  if (!site) return staticEntries

  // fetchPublic already owns the server-side base-URL resolution (the "/api"
  // rewrite is not a URL on the server — see its module docstring), unwraps the
  // {success, data} envelope, and swallows every failure into a typed result
  // instead of throwing. That is exactly the try/catch this route needs.
  const feed = await fetchPublic<SitemapFeed>("/public/sitemap/urls", {
    revalidate: FEED_REVALIDATE_SECONDS,
  })

  if (feed.status !== "ok") return staticEntries

  return [
    ...staticEntries,
    ...profileEntries(feed.data.users ?? [], site, "/profile"),
    ...profileEntries(
      feed.data.organizations ?? [],
      site,
      "/organization/profile"
    ),
  ]
}
