/**
 * Types and option lists for the pre-launch waitlist.
 *
 * Every `value` below mirrors a `TextChoices` value in the backend's
 * `waitlist.models.PlayerSignup` EXACTLY. They are not display strings and they
 * are not free text — a mismatch here is a 400 the player reads as "something
 * went wrong", so the lists are kept next to the types rather than inlined in
 * the form where a typo would be invisible.
 *
 * The labels are the other direction: the success screen and the share card get
 * a district back from the API as a slug, and `districtLabel` is what turns it
 * into something a person recognises.
 */

export type Option = {
  value: string
  label: string
}

/** Kerala's 14 districts, north to south is NOT the order — this is the
 *  official administrative order, which is what people scan for. */
export const DISTRICTS: readonly Option[] = [
  { value: "thiruvananthapuram", label: "Thiruvananthapuram" },
  { value: "kollam", label: "Kollam" },
  { value: "pathanamthitta", label: "Pathanamthitta" },
  { value: "alappuzha", label: "Alappuzha" },
  { value: "kottayam", label: "Kottayam" },
  { value: "idukki", label: "Idukki" },
  { value: "ernakulam", label: "Ernakulam" },
  { value: "thrissur", label: "Thrissur" },
  { value: "palakkad", label: "Palakkad" },
  { value: "malappuram", label: "Malappuram" },
  { value: "kozhikode", label: "Kozhikode" },
  { value: "wayanad", label: "Wayanad" },
  { value: "kannur", label: "Kannur" },
  { value: "kasaragod", label: "Kasaragod" },
  { value: "other", label: "Other" },
] as const

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

export const INSTAGRAM_HANDLE = "goatza.sports"
export const INSTAGRAM_URL = `https://instagram.com/${INSTAGRAM_HANDLE}`

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
  district?: string
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
  signup_number: number
  ref_code: string
  name: string
  district: string
  /**
   * True when this phone was already on the list. NOT an error: there is no
   * account to log into and no way for somebody to check whether they signed
   * up except by submitting again, so the success screen renders either way —
   * only the heading changes.
   */
  already_registered: boolean
}

// ── Helpers ───────────────────────────────────────────────────

const DISTRICT_LABELS: Record<string, string> = Object.fromEntries(
  DISTRICTS.map((district) => [district.value, district.label]),
)

const POSITION_LABELS: Record<string, string> = Object.fromEntries(
  POSITIONS.map((position) => [position.value, position.label]),
)

/** "kozhikode" → "Kozhikode". Unknown or empty → "" so callers can skip it. */
export function districtLabel(value: string | null | undefined): string {
  if (!value) return ""
  return DISTRICT_LABELS[value] ?? value
}

/** "left_wing" → "Left Wing". Unknown or empty → "" so callers can skip it. */
export function positionLabel(value: string | null | undefined): string {
  if (!value) return ""
  return POSITION_LABELS[value] ?? value
}

/** "Arjun Menon" → "Arjun". The success screen greets, it does not address. */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName
}
