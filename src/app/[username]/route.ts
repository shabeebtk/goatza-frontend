/**
 * GET /<username> — the vanity URL, redirected to the real profile page.
 *
 * The share card's footer prints `goatza.com/<username>` and the QR beside it
 * points at `/profile/<username>`. Until this route existed the printed line
 * was a lie: somebody reading it off an image we asked them to trust, typing it
 * in, and landing on a 404. This is that URL made real.
 *
 * ── Route precedence ─────────────────────────────────────────
 *
 * A static segment always beats a dynamic one in the App Router, so every page
 * that exists today — /home, /profile/x, /auth, /card/… — resolves exactly as
 * it did and never reaches this handler. Route groups do not appear in the URL,
 * so `(autheticated)/home` is `/home` for this purpose.
 *
 * The risk runs the other way, and it is a real one: a NEW top-level route
 * added later silently shadows any user who already owns that username, and
 * their vanity link starts resolving to a page that is not theirs. RESERVED
 * below is the register of names that are ours. Adding a top-level route means
 * adding its segment there.
 *
 * ── Why 308 ──────────────────────────────────────────────────
 *
 * Permanent, and method- and body-preserving. The canonical URL of a profile is
 * `/profile/<username>` — that is what the page's `alternates.canonical` says
 * and what the sitemap lists — so this must not look to a crawler like a second
 * address for the same content.
 */

import {
  getPublicOrganizationProfile,
  getPublicUserProfile,
} from "@/features/profile/services/publicProfile.api"
import { profilePath } from "@/shared/services/profileUrl"

/**
 * Names that are the platform's, not a person's.
 *
 * Every top-level segment under `src/app` (route groups excluded, their
 * children included), plus the paths Next and Vercel serve from outside the
 * router: `/api` is rewritten wholesale to Django by vercel.json, `_next` is
 * the build output, and everything in `public/` is served at the root.
 *
 * Checked BEFORE the backend call, so a crawler walking `/robots.txt`,
 * `/sitemap.xml` and a hundred other guesses costs us nothing. Most of these
 * are already claimed by a static route or a static file and would never arrive
 * here — the list is the belt to that pair of braces, and it is what stops a
 * username from ever being taken for one of them.
 */
const RESERVED = new Set([
  // Proxied to Django, never Next's to serve.
  "api",
  // Build output and framework-owned paths.
  "_next",
  "_vercel",
  // Top-level app segments.
  "auth",
  "card",
  "chat",
  "coaching",
  "explore",
  "highlights",
  "home",
  "messages",
  "notifications",
  "organization",
  "posts",
  "profile",
  "recruitments",
  "scouting",
  "search",
  "settings",
  // Generated at the root.
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  // Served from public/.
  "fonts",
  "icons",
  "landing",
  "manifest.json",
  "firebase-messaging-sw.js",
  "file.svg",
  "globe.svg",
  "goatza-logo.svg",
  "next.svg",
  "vercel.svg",
  "window.svg",
])

/**
 * Not found, and deliberately indistinguishable from a typo — the same rule the
 * card renderer follows, for the same reason. A hidden profile and a username
 * nobody has ever registered must look identical from out here, or this route
 * becomes a way to enumerate which accounts exist behind the public toggle.
 *
 * Briefly cacheable: a crawler retrying a dead link should not cost a backend
 * round trip every time, and a profile that goes public starts working within
 * the minute.
 */
function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "public, max-age=60",
    },
  })
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params

  if (RESERVED.has(username.toLowerCase())) return notFound()

  // Users first: they are the ones the card prints a vanity URL for, so the
  // common case is one round trip. `/public/profile/` 404s for an organization
  // rather than returning its bundle, so an org costs the second call — and
  // `type` on whichever bundle comes back is what picks the destination.
  const bundle =
    (await getPublicUserProfile(username)) ??
    (await getPublicOrganizationProfile(username))

  if (!bundle?.profile?.username) return notFound()

  const { search } = new URL(request.url)
  const destination = `${profilePath(bundle.profile.username, bundle.type)}${search}`

  return new Response(null, {
    status: 308,
    headers: {
      Location: new URL(destination, request.url).toString(),
      // Long enough to be worth having at the CDN, short enough that a username
      // change is not pinned to the old destination for a browsing session.
      "Cache-Control": "public, max-age=300",
    },
  })
}
