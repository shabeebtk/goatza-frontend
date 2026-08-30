/**
 * Types and option lists for the pre-launch waitlist.
 *
 * Every `value` below mirrors a `TextChoices` value in the backend's
 * `waitlist.models.PlayerSignup` EXACTLY. They are not display strings and they
 * are not free text — a mismatch here is a 400 the player reads as "something
 * went wrong", so the lists are kept next to the types rather than inlined in
 * the form where a typo would be invisible.
 *
 * There is no slug→label helper here any more. The share card's redesign gave
 * the line under the name to the number and the city, so nothing outside the
 * form needs to turn "left_wing" into "Left Wing" — and an exported helper with
 * no caller is a thing the next person has to check before changing.
 *
 * Location is NOT one of these lists. It used to be Kerala's fourteen districts
 * in a dropdown; it is now a place picked from Google Places, which cannot be
 * an enum — see `SignupLocation` and `toSignupLocation`.
 */

import {
  toLocationPayload,
  type LocationPayload,
  type PlaceResult,
} from "@/shared/services/places.service"

export type Option = {
  value: string
  label: string
}

export const POSITIONS: readonly Option[] = [
  { value: "goalkeeper", label: "Goalkeeper" },
  { value: "defender", label: "Defender" },
  { value: "midfielder", label: "Midfielder" },
  { value: "left_wing", label: "Left Wing" },
  { value: "right_wing", label: "Right Wing" },
  { value: "striker", label: "Striker" },
] as const

export const LEVELS: readonly Option[] = [
  { value: "school", label: "School" },
  { value: "club", label: "Club" },
  { value: "district", label: "District" },
  { value: "state", label: "State" },
  { value: "university", label: "University" },
  { value: "none", label: "None / just play" },
] as const

/**
 * Shown until GET /public/waitlist/stats answers, and kept if it never does.
 * Matches the backend's WAITLIST_GOAL default so the bar does not jump when the
 * real number lands.
 */
export const WAITLIST_GOAL_FALLBACK = 1000

export const LAUNCH_DATE_LABEL = "1 Jan 2027"

/** Where the card's footer and the share caption both point. One constant, so
 *  the domain on the image and the domain in the text cannot disagree. */
export const SITE_DOMAIN = "goatza.com"

export const INSTAGRAM_HANDLE = "goatza.sports"
export const INSTAGRAM_URL = `https://instagram.com/${INSTAGRAM_HANDLE}`

// ── Location ──────────────────────────────────────────────────

/**
 * The nested `location` object the backend's serializer accepts.
 *
 * Every key is optional there, and every key is sent from here — a resolved
 * place has all of them, and half a location is harder to reason about later
 * than none.
 *
 * `name` is the FULL label ("Kozhikode, Kerala, India") and `city` is the short
 * one ("Kozhikode"). PlaceResult calls those two `label` and `name`, which is
 * the one rename in this file and the reason `toSignupLocation` exists rather
 * than a spread at the call site: passing a PlaceResult through untouched would
 * store the city in the label column and nothing in the city column.
 *
 * `provider` and `external_id` are what let a signup and a profile naming the
 * same place share ONE Location row — the backend looks a place up by that
 * pair. This is just the shared `LocationPayload` under the waitlist's own
 * name, kept as its own type because the waitlist is a public endpoint with an
 * explicit allow-list rather than a general write path.
 */
export type SignupLocation = LocationPayload

/**
 * PlaceResult → the POST body's `location`.
 *
 * Delegates to the shared `toLocationPayload` so the label/name rename and the
 * provider fields cannot drift from the other five write paths that send the
 * same object.
 */
export function toSignupLocation(city: PlaceResult): SignupLocation {
  return toLocationPayload(city)
}

// ── API shapes ────────────────────────────────────────────────

export type WaitlistStats = {
  count: number
  goal: number
}

/**
 * The POST body. Everything but `name` and `phone` is omitted entirely when
 * empty rather than sent as "" — `date_of_birth` is a DateField on the backend
 * and an empty string is a 400 there, while an absent key is simply "not
 * answered". One rule for every optional field is easier to keep true than a
 * per-field one.
 */
export type SignupPayload = {
  name: string
  phone: string
  email?: string
  date_of_birth?: string
  /**
   * The picked city, geocoded. Omitted entirely when nothing was selected —
   * never `null` and never `{}`, which the backend would have to special-case
   * on top of the "absent means unanswered" rule every other optional field
   * here already follows.
   */
  location?: SignupLocation
  position?: string
  level?: string
  instagram?: string
  club_or_academy?: string
  /** Honeypot. Only ever present when a bot filled the hidden field in. */
  website?: string
  /** The ?src= tag off the landing URL — which post drove this signup. */
  source?: string
}

export type SignupResult = {
  /**
   * The number the player is SHOWN. The backend adds WAITLIST_DISPLAY_OFFSET
   * before it leaves the server, so the raw row number never reaches this
   * client and nothing here should try to reconstruct it.
   */
  signup_number: number
  ref_code: string
  name: string
  /** Short city name ("Kozhikode"), or "" when no location was given. */
  city: string
  /**
   * Whether this player made the founding cohort — display number <= the goal.
   * Decided by the backend on the same rule the card endpoint uses, so the
   * badge on the success screen and the badge on a shared card cannot differ.
   */
  is_founding: boolean
  /**
   * True when this phone was already on the list. NOT an error: there is no
   * account to log into and no way for somebody to check whether they signed
   * up except by submitting again, so the success screen renders either way —
   * only the heading changes.
   */
  already_registered: boolean
}

// ── Helpers ───────────────────────────────────────────────────

/**
 * The caption that goes out with the card.
 *
 * Written here rather than in the component because it is content, not markup,
 * and because the two places it can be delivered — `navigator.share`'s `text`
 * and the clipboard — must send the same words. Three short lines: who they
 * are, what Goatza is, and where to go. Nothing that reads as an ad somebody
 * was paid to post.
 *
 * The founding claim is CONDITIONAL, for the same reason the card's eyebrow is:
 * once the cohort closes the backend stops calling people founding players, and
 * a caption is the last place to keep saying it.
 */
export function shareCaption(isFounding: boolean): string {
  return [
    isFounding
      ? "I've joined Goatza as a founding player."
      : "I've joined the Goatza waitlist.",
    "Where the greatest get discovered.",
    `Launching ${LAUNCH_DATE_LABEL} — ${SITE_DOMAIN}`,
  ].join("\n")
}

/** "Arjun Menon" → "Arjun". The success screen greets, it does not address. */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName
}
