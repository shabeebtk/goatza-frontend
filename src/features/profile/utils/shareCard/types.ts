/**
 * The shapes the share-card renderer works in.
 *
 * `CardData` is deliberately not the public profile bundle: the layout should
 * not know that `location.city` is nested or that `age_group` is a server-
 * derived badge. One adapter (`toCardData`) flattens the bundle into this, and
 * the layout renders nothing but this — which is also what makes the layout
 * testable without a fixture of the whole API payload.
 */

/** 1080×1920 for stories, 1200×630 for the link preview. */
export type CardFormat = "story" | "link"

export const CARD_SIZES: Record<CardFormat, { width: number; height: number }> = {
  story: { width: 1080, height: 1920 },
  link: { width: 1200, height: 630 },
}

/**
 * One of the three detail slots.
 *
 * `value` is stored in natural case and uppercased by the card's CSS, because
 * the same string is also the picker's hint, where "178 cm" reads better than
 * "178 CM".
 */
export interface SlotCandidate {
  key: string
  label: string
  value: string
}

/** The verified-club block, or null when the player has no verified entry. */
export interface CardClub {
  name: string
  /** Up to two letters. The reference draws a monogram, not a crest — one
   *  fewer network fetch inside the render, and club logos are inconsistent. */
  monogram: string
}

export interface CardData {
  username: string
  name: string
  /** "U19" / "Senior" / null — the server-derived badge, never a birthdate. */
  ageGroup: string | null
  sport: string | null
  position: string | null
  avatarUrl: string | null
  coverUrl: string | null
  club: CardClub | null
  slots: SlotCandidate[]
  /** Footer meta, e.g. "Player profile". Short by necessity — it shares a row
   *  with the URL. */
  kindLabel: string
  /**
   * The absolute URL the footer's QR code encodes, or null for no QR.
   *
   * Absolute, always: a QR is scanned by a camera that has no origin to resolve
   * a path against. Null when the viewer turned it off (`?qr=0`) and always
   * null for the link format, which is an OG preview — already clickable, so a
   * QR on it is noise. Built by the route, never by the layout: `ProfileCard`
   * renders `CardData` and knows nothing about origins or query params.
   */
  qrUrl: string | null
}
