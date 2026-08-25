/**
 * The Open Graph image for a shared profile link.
 *
 * ─────────────────────────────────────────────────────────────
 * THIS IS THE SHARE-CARD SEAM, AND IT HAS NOW BEEN SWAPPED.
 *
 * A player's profile resolves to the generated card — the designed 1200×630
 * image with their name, sport, position and three stats laid out on it, drawn
 * by /card/profile/<username>?format=link. Every caller still asks this one
 * function for a URL and still does not care how it was produced.
 *
 * An ORGANIZATION does not have a card. Org cards are a different job with a
 * different composition and are deliberately not built, so that path shares the
 * org's logo directly: not a designed card, but a real mark, and a WhatsApp
 * link with an image in it gets opened where a bare link does not.
 * ─────────────────────────────────────────────────────────────
 */

import { buildCardUrl } from "./shareCard/cardUrl"

/** What every platform expects. Also what the card is drawn at. */
export const OG_IMAGE_WIDTH = 1200
export const OG_IMAGE_HEIGHT = 630

/**
 * Fallback for a profile with no photo. A branded static asset, not a
 * transform: there is nothing to transform, and an OG tag pointing at a 404 is
 * worse than a generic card — several platforms drop the preview entirely.
 */
const FALLBACK_PATH = "/icons/icon-512.png"

/**
 * Is this something a scraper can actually fetch?
 *
 * Any absolute http(s) URL qualifies — the media domain, the r2.dev URL a dev
 * environment uses, and any other absolute URL our API hands back.
 * There is no host allow-list on purpose: the value comes from our own API, and
 * the previous single-provider check silently sent every org whose logo lives
 * anywhere else (i.e. every org after the migration) to the fallback icon.
 *
 * Relative paths are rejected: an OG tag must be absolute or scrapers ignore it.
 */
function isAbsoluteUrl(url: string): boolean {
  return url.startsWith("https://") || url.startsWith("http://")
}

/** A user profile gets the generated card. */
interface CardProfile {
  username: string
  updated_at?: string
  profile_photo?: string
  cover_photo?: string
}

/** An organization shares its logo directly — `logo` is the discriminant as
 *  well as the source, and only org payloads carry it. */
interface OrgProfile {
  logo?: string
  cover_image?: string
  username?: string
  profile_photo?: string
  cover_photo?: string
}

/**
 * Absolute URL of the preview image for a profile.
 *
 * `siteOrigin` is required because OG images must be absolute — a relative path
 * is silently ignored by every scraper.
 */
export function buildProfileOgImageUrl(
  profile: CardProfile | OrgProfile,
  siteOrigin: string
): string {
  // `logo` is only ever a key on an organization payload, so its presence — not
  // its value, which is "" for an org that has not uploaded one — is what tells
  // the two apart.
  const isOrganization = "logo" in profile || "cover_image" in profile

  // A user profile: the generated card. It draws its own fallbacks (branded
  // pattern for no cover, initials medallion for no avatar), so unlike the
  // transform below there is no photo to check for — the card is always a
  // complete image.
  if (!isOrganization && profile.username) {
    return buildCardUrl({
      username: profile.username,
      format: "link",
      updatedAt: (profile as CardProfile).updated_at,
      origin: siteOrigin,
    })
  }

  // An organization. Prefer the mark over the cover: a logo reads at thumbnail
  // size in a chat list, a wide stadium shot does not.
  const org = profile as OrgProfile
  const source =
    org.logo || org.profile_photo || org.cover_image || org.cover_photo || ""

  // The stored URL is already a final, directly-fetchable image — there is no
  // transform to apply any more, and the OG box is advisory: every platform
  // crops the image it is given to its own preview shape.
  if (source && isAbsoluteUrl(source)) return source

  // No logo at all, or a relative path a scraper could not resolve.
  return `${siteOrigin}${FALLBACK_PATH}`
}
