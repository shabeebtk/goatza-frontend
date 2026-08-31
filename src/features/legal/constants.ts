/**
 * The four documents, as the client knows them.
 *
 * One list, used by the re-consent modal, the settings section and the site
 * footer, because three hand-written lists is three chances for /safety to be
 * the one somebody forgot.
 *
 * The keys are the backend's document keys AND the route segments — they are
 * the same string on purpose (see `LEGAL_DOCUMENTS` in
 * shared/services/legal.ts and `RESERVED_USERNAMES` on the backend, which
 * reserves every one of them so no user can shadow the page).
 */

export const LEGAL_SLUGS = ["terms", "privacy", "guidelines", "safety"] as const

export type LegalSlug = (typeof LEGAL_SLUGS)[number]

export const LEGAL_LABELS: Record<LegalSlug, string> = {
  terms: "Terms of Service",
  privacy: "Privacy Policy",
  guidelines: "Community Guidelines",
  safety: "Youth Safety",
}

/** The short form, for the footer where four full titles would wrap. */
export const LEGAL_SHORT_LABELS: Record<LegalSlug, string> = {
  terms: "Terms",
  privacy: "Privacy",
  guidelines: "Guidelines",
  safety: "Youth Safety",
}

export const legalHref = (slug: LegalSlug) => `/${slug}`

/**
 * Only these two gate the product; guidelines and safety are published, not
 * agreed to. Mirrors REQUIRED_DOCUMENTS on the backend, which is the authority
 * — the client never decides what blocks, it only renders what it is told is
 * pending.
 */
export const GATING_SLUGS = ["terms", "privacy"] as const

export type GatingSlug = (typeof GATING_SLUGS)[number]

export const isLegalSlug = (value: string): value is LegalSlug =>
  (LEGAL_SLUGS as readonly string[]).includes(value)

/** A document key from the API turned into something printable. */
export const legalLabel = (slug: string): string =>
  isLegalSlug(slug) ? LEGAL_LABELS[slug] : slug
