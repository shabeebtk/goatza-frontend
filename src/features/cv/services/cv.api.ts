/**
 * The Sports CV — the anonymous read, and the owner's settings.
 *
 * Two transports on purpose, and the split is not cosmetic:
 *
 *   PUBLIC  → `fetchPublic` from publicProfile.api, plain `fetch`. It runs on
 *     the server for every CV render, and the shared axios instance reads a
 *     Zustand store in a request interceptor — a module-level singleton during
 *     SSR, so one visitor's state can bleed into another's page. The helper is
 *     imported rather than copied so there is one description of that hazard.
 *
 *   OWNER   → the shared axios instance, which is exactly right: these calls
 *     are authenticated, actor-scoped, and only ever made from the browser.
 *
 * The types mirror the backend allow-lists (cv/serializers/cv_serializers.py).
 * Note what the CV payload does NOT and cannot carry: email, raw birthdate,
 * latitude/longitude. `age_group` is the server-derived band that replaces the
 * date of birth.
 */

import api from "@/core/api/axios"
import type { Achievement } from "@/features/achievements/types"
import type { CareerEntry } from "@/features/career/types"
import {
  fetchPublic,
  siteOrigin,
  type PublicFetchResult,
  type PublicPrimarySport,
  type PublicSportAttribute,
  type PublicUserProfile,
} from "@/features/profile/services/publicProfile.api"

// ── Public payload ────────────────────────────────────────────

/**
 * Same as the profile's primary sport, except `attributes` is OPTIONAL: the
 * `show_attributes` toggle removes the key from the payload rather than sending
 * an empty list, because an empty list still ships inside the server-rendered
 * page source.
 */
export type CVPrimarySport = Omit<PublicPrimarySport, "attributes"> & {
  attributes?: PublicSportAttribute[]
}

export type CVProfile = Omit<PublicUserProfile, "primary_sport"> & {
  primary_sport: CVPrimarySport | null
}

/** Phone only. There is no email field and no toggle that produces one. */
export type CVContact = {
  phone: string
}

/**
 * One clip on the CV rail. The shape `HighlightSerializer` returns for a
 * non-owner — `visibility` and `views_count` are stripped server-side.
 *
 * Only `everyone` clips ever appear here, for every viewer including a
 * signed-in scout: a CV is printed, scanned and forwarded, so a clip its owner
 * restricted to recruiters must not become a public URL.
 */
export type CVHighlight = {
  id: string
  title: string
  file_url: string
  thumbnail_url: string
  duration: number | null
  width: number | null
  height: number | null
  order: number
  created_at: string
}

/**
 * The CV bundle.
 *
 * Every optional key is ABSENT when its toggle is off — never empty, never
 * null. Treat `undefined` as "the owner chose not to publish this", which is
 * different from "they have none": both render nothing, but only the second is
 * worth an empty state.
 */
export type PublicCV = {
  profile: CVProfile
  views_count: number
  contact?: CVContact
  career?: CareerEntry[]
  achievements?: Achievement[]
  highlights?: CVHighlight[]
}

// ── Owner settings ────────────────────────────────────────────

/**
 * The switches, in the order the settings screen prints them. Exported so the
 * screen and the optimistic patch cannot disagree about what a toggle is.
 */
export const CV_TOGGLES = [
  "is_enabled",
  "show_contact",
  "show_attributes",
  "show_career",
  "show_achievements",
  "show_highlights",
] as const

export type CVToggle = (typeof CV_TOGGLES)[number]

export type CVSettings = Record<CVToggle, boolean> & {
  /** The owner's own number. Never on the public payload as anything but a count. */
  views_count: number
  username: string | null
  /**
   * The CV requires this. A CV with `is_enabled` on and a private profile
   * resolves to the same 404 as a typo — the settings screen says so in words,
   * and this is the value it says it about.
   */
  is_public_profile: boolean
  updated_at: string
}

export type CVSettingsPatch = Partial<Record<CVToggle, boolean>>

// ── URLs ──────────────────────────────────────────────────────

export function cvPath(username: string): string {
  return `/cv/${username}`
}

/**
 * The absolute, shareable CV URL — what the copy button copies and what the QR
 * encodes. `siteOrigin()` resolves the configured production origin first and
 * only falls back to the running one, so a link printed on a preview
 * deployment is still the link somebody can type in.
 */
export function cvUrl(username: string): string {
  return `${siteOrigin()}${cvPath(username)}`
}

// ── Calls ─────────────────────────────────────────────────────

/**
 * The public CV, with the reason it is missing preserved.
 *
 * "not_found" (the CV is off, the profile is private, this is not a player, or
 * the username does not exist — the backend deliberately refuses to say which)
 * and "unavailable" (we never reached the API) are different situations, and
 * collapsing them is what once turned a misconfigured environment into a
 * site-wide 404.
 */
export function getPublicCVResult(
  username: string
): Promise<PublicFetchResult<PublicCV>> {
  return fetchPublic<PublicCV>(`/public/cv/${encodeURIComponent(username)}`)
}

/**
 * The signed-in player's own settings.
 *
 * Get-or-creates server-side, so a player who has never opened this screen
 * reads the defaults rather than a 404. Players only — a coach, a scout or an
 * organization actor gets a 403 that names the reason.
 */
export const getCVSettingsApi = async (): Promise<CVSettings> => {
  const res = await api.get("/user/cv/settings")
  return res.data.data
}

/** Partial update — send only the toggle that moved. */
export const updateCVSettingsApi = async (
  patch: CVSettingsPatch
): Promise<CVSettings> => {
  const res = await api.patch("/user/cv/settings", patch)
  return res.data.data
}
