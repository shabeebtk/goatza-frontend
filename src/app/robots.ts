import type { MetadataRoute } from "next"

/**
 * What crawlers may index.
 *
 * Profiles are the point: a Goatza profile should be findable by name, and the
 * public route group exists so it can be. Everything behind AuthGuard is
 * disallowed — not as a security control (it is already a 401 without a token)
 * but so crawl budget is not spent on routes that render a redirect.
 *
 * A profile whose owner turned the public toggle off is handled at the page
 * level, not here: it 404s and its generateMetadata sets robots noindex, which
 * is per-URL and therefore the only thing that can express "this one, not the
 * rest".
 */
export default function robots(): MetadataRoute.Robots {
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "")

  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/profile/",
          "/organization/profile/",
        ],
        disallow: [
          "/auth",
          "/home",
          "/messages",
          "/chat",
          "/notifications",
          "/settings",
          "/search",
          "/explore",
          "/highlights",
          "/recruitments",
          "/coaching",
          "/scouting",
          // The org dashboard — member-only, and nothing under it is public.
          "/organization/admin/",
          // Follower/following lists are a scraping vector; the pages gate them
          // behind the login wall for humans, this keeps bots off them too.
          "/profile/*/network",
          "/organization/profile/*/network",
        ],
      },
    ],
    sitemap: site ? `${site}/sitemap.xml` : undefined,
  }
}
