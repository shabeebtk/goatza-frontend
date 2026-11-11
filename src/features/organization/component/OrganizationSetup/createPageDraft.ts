/**
 * The create page's data, with no React in it: the draft, its steps, how it
 * is checked, saved and turned into the create request. Kept pure so the
 * rules can be tested without rendering the wizard.
 */

import type { CreateOrganizationPayload, OrgLevel, OrgType } from "../../types"
import type { PlaceResult } from "@/shared/services/places.service"
import { USERNAME_MAX_LENGTH, validateUsernameFormat } from "@/shared/constants/username"

// ── Steps ─────────────────────────────────────────────────────────

export const CREATE_STEPS = ["type", "basics", "location", "review"] as const
export type CreateStep = (typeof CREATE_STEPS)[number]

export const STEP_LABELS: Record<CreateStep, string> = {
  type:     "Type",
  basics:   "Basics",
  location: "Location & sports",
  review:   "Review",
}

export const isCreateStep = (value: unknown): value is CreateStep =>
  typeof value === "string" && (CREATE_STEPS as readonly string[]).includes(value)

export const stepIndex = (step: CreateStep) => CREATE_STEPS.indexOf(step)

// ── Options ───────────────────────────────────────────────────────

export type OrgTypeOption = {
  type:        OrgType
  label:       string
  icon:        string
  description: string
  examples:    string
}

export const ORG_TYPE_OPTIONS: OrgTypeOption[] = [
  {
    type:        "club",
    label:       "Club",
    icon:        "mdi:shield-star-outline",
    description: "A sports club with members, teams and regular activities.",
    examples:    "Football club, cricket club, sports society",
  },
  {
    type:        "team",
    label:       "Team",
    icon:        "mdi:account-group-outline",
    description: "A competitive team that plays in a league or tournament.",
    examples:    "District team, college team, franchise",
  },
  {
    type:        "academy",
    label:       "Academy",
    icon:        "mdi:school-outline",
    description: "A training programme that develops athletes.",
    examples:    "Football academy, tennis coaching centre",
  },
  {
    type:        "school",
    label:       "School",
    icon:        "mdi:domain",
    description: "An educational institution with sports programmes.",
    examples:    "School, college, university sports department",
  },
]

export const ORG_LEVEL_OPTIONS: { value: OrgLevel; label: string }[] = [
  { value: "youth",             label: "Youth" },
  { value: "amateur",           label: "Amateur" },
  { value: "semi_professional", label: "Semi-professional" },
  { value: "professional",      label: "Professional" },
]

export const typeLabel = (type: OrgType | null) =>
  ORG_TYPE_OPTIONS.find((option) => option.type === type)?.label ?? ""

export const levelLabel = (level: OrgLevel | "") =>
  ORG_LEVEL_OPTIONS.find((option) => option.value === level)?.label ?? ""

// ── Limits (the server's, or tighter) ─────────────────────────────

export const NAME_MIN        = 2
export const NAME_MAX        = 80
export const TAGLINE_MAX     = 120
export const ABOUT_MAX       = 600
export const WEBSITE_MAX     = 500
export const BRANCH_NAME_MAX = 80
export const ADDRESS_MAX     = 200
export const DEFAULT_BRANCH_NAME = "Main Branch"

// ── The draft ─────────────────────────────────────────────────────

export type CreateDraft = {
  type:           OrgType | null
  name:           string
  /** The page link. Follows the name until the person edits it. */
  username:       string
  usernameEdited: boolean
  headline:       string
  level:          OrgLevel | ""
  description:    string
  website:        string
  city:           PlaceResult | null
  branchName:     string
  address:        string
  /** In the order they were picked: the first is the primary. */
  sportIds:       string[]
}

export const EMPTY_DRAFT: CreateDraft = {
  type:           null,
  name:           "",
  username:       "",
  usernameEdited: false,
  headline:       "",
  level:          "",
  description:    "",
  website:        "",
  city:           null,
  branchName:     DEFAULT_BRANCH_NAME,
  address:        "",
  sportIds:       [],
}

/** Has the person entered anything worth asking about before it is thrown away? */
export function isDraftDirty(draft: CreateDraft): boolean {
  return (
    draft.type !== null ||
    draft.name.trim() !== "" ||
    (draft.usernameEdited && draft.username.trim() !== "") ||
    draft.headline.trim() !== "" ||
    draft.level !== "" ||
    draft.description.trim() !== "" ||
    draft.website.trim() !== "" ||
    draft.city !== null ||
    draft.address.trim() !== "" ||
    draft.branchName.trim() !== DEFAULT_BRANCH_NAME ||
    draft.sportIds.length > 0
  )
}

// ── Saved in this tab (sessionStorage) ────────────────────────────
//
// Everything except the photos: a File cannot be stored, and a refresh that
// silently dropped a picked logo would be worse than one that asks again.

export const DRAFT_STORAGE_KEY = "goatza:org-create-draft"
const DRAFT_VERSION = 1

const str = (value: unknown, max = 1000) =>
  typeof value === "string" ? value.slice(0, max) : ""

function readPlace(value: unknown): PlaceResult | null {
  if (!value || typeof value !== "object") return null
  const place = value as Partial<PlaceResult>
  if (typeof place.name !== "string" || typeof place.external_id !== "string") return null
  if (typeof place.latitude !== "number" || typeof place.longitude !== "number") return null
  return place as PlaceResult
}

/** The saved draft, or null when there is none (or it can't be read). */
export function loadDraft(): CreateDraft | null {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { v?: number; draft?: Record<string, unknown> }
    if (parsed?.v !== DRAFT_VERSION || !parsed.draft) return null
    const d = parsed.draft
    const type = ORG_TYPE_OPTIONS.some((o) => o.type === d.type) ? (d.type as OrgType) : null
    const level = ORG_LEVEL_OPTIONS.some((o) => o.value === d.level) ? (d.level as OrgLevel) : ""
    return {
      type,
      name:           str(d.name, NAME_MAX),
      username:       str(d.username, USERNAME_MAX_LENGTH + 20),
      usernameEdited: d.usernameEdited === true,
      headline:       str(d.headline, TAGLINE_MAX),
      level,
      description:    str(d.description, ABOUT_MAX),
      website:        str(d.website, WEBSITE_MAX),
      city:           readPlace(d.city),
      branchName:     typeof d.branchName === "string" ? str(d.branchName, BRANCH_NAME_MAX) : DEFAULT_BRANCH_NAME,
      address:        str(d.address, ADDRESS_MAX),
      sportIds:       Array.isArray(d.sportIds)
        ? d.sportIds.filter((id): id is string => typeof id === "string").slice(0, 50)
        : [],
    }
  } catch {
    return null
  }
}

export function saveDraft(draft: CreateDraft): void {
  try {
    if (!isDraftDirty(draft)) {
      window.sessionStorage.removeItem(DRAFT_STORAGE_KEY)
      return
    }
    window.sessionStorage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({ v: DRAFT_VERSION, draft })
    )
  } catch {
    // Private mode or a full quota: the draft just isn't kept.
  }
}

export function clearDraft(): void {
  try {
    window.sessionStorage.removeItem(DRAFT_STORAGE_KEY)
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}

// ── The page link, from the name ──────────────────────────────────

/**
 * "Kannur FC Academy" → "kannur_fc_academy". Lowercase, accents folded,
 * spaces and separators to "_", anything else outside [a-z0-9_] dropped,
 * underscores collapsed and trimmed, at most 30 characters.
 */
export function toHandle(name: string): string {
  const folded = name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
  return folded
    .replace(/[\s\-.]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, USERNAME_MAX_LENGTH)
    .replace(/_+$/g, "")
}

/** What the handle field keeps of what was typed: lowercase, no spaces. */
export const normalizeHandleInput = (raw: string) =>
  raw.toLowerCase().replace(/\s+/g, "_")

// ── Website ───────────────────────────────────────────────────────

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i

/** Adds https:// when no scheme was typed. Empty stays empty. */
export function normalizeWebsite(raw: string): string {
  const value = raw.trim()
  if (!value) return ""
  return HAS_SCHEME.test(value) ? value : `https://${value}`
}

export const WEBSITE_ERROR = "Enter a web address, like yourclub.com"

/**
 * The address as it is SENT. A link pasted from a social profile often has
 * spaces in its path ("fb.com/Kannur FC Academy"); the browser's URL parser
 * takes them, Django's URLValidator refuses any whitespace, so they go as %20.
 * The field keeps showing what was typed.
 */
export const toServerWebsite = (website: string): string => website.replace(/\s/g, "%20")

/**
 * One host label the way Django's URLValidator takes it, once the browser has
 * punycoded the host: letters, digits and inner hyphens. No underscore —
 * `new URL` accepts "my_club.com", the server answers 400.
 */
const HOST_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
/** The last label: two letters or more ("club.c" is refused there too), or punycode. */
const TOP_LEVEL_LABEL = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/

export function validateWebsite(raw: string): string | null {
  const value = normalizeWebsite(raw)
  if (!value) return null
  if (toServerWebsite(value).length > WEBSITE_MAX) {
    return `Web address can be up to ${WEBSITE_MAX} characters`
  }
  try {
    const url = new URL(value)
    if (url.protocol !== "http:" && url.protocol !== "https:") return WEBSITE_ERROR
    // A host with a dot (yourclub.com), not "https://club", and one the
    // server's validator will take: the same rules, so nothing that passes
    // here comes back as a 400 after the Review.
    const labels = url.hostname.split(".")
    if (labels.length < 2 || !labels.every((label) => HOST_LABEL.test(label))) {
      return WEBSITE_ERROR
    }
    if (!TOP_LEVEL_LABEL.test(labels[labels.length - 1])) return WEBSITE_ERROR
    return null
  } catch {
    return WEBSITE_ERROR
  }
}

// ── Field rules ───────────────────────────────────────────────────

export type CreateField =
  | "type"
  | "photos"
  | "name"
  | "username"
  | "headline"
  | "level"
  | "description"
  | "website"
  | "city"
  | "branchName"
  | "address"
  | "sports"

export type FieldErrors = Partial<Record<CreateField, string>>

/** Which step a field lives on — for jumping to a server error. */
export const FIELD_STEP: Record<CreateField, CreateStep> = {
  type:        "type",
  photos:      "basics",
  name:        "basics",
  username:    "basics",
  headline:    "basics",
  level:       "basics",
  description: "basics",
  website:     "basics",
  city:        "location",
  branchName:  "location",
  address:     "location",
  sports:      "location",
}

/** The create request's field names → ours. */
export const SERVER_FIELD: Record<string, CreateField> = {
  type:        "type",
  name:        "name",
  username:    "username",
  headline:    "headline",
  level:       "level",
  description: "description",
  website:     "website",
  logo:        "photos",
  location:    "city",
  sport_ids:   "sports",
}

/** The order fields appear on screen, for "focus the first error". */
export const FIELD_ORDER: CreateField[] = [
  "type", "photos", "name", "username", "headline", "level", "description",
  "website", "city", "branchName", "address", "sports",
]

export function validateName(name: string): string | null {
  const value = name.trim()
  if (!value) return "Enter your page's name"
  if (value.length < NAME_MIN) return `Name must be at least ${NAME_MIN} characters`
  if (value.length > NAME_MAX) return `Name can be up to ${NAME_MAX} characters`
  return null
}

export function validateHandle(handle: string): string | null {
  if (!handle.trim()) return "Choose a page link"
  return validateUsernameFormat(handle)
}

/** One field's own rule; availability is the handle check's job, not this. */
export function validateField(field: CreateField, draft: CreateDraft): string | null {
  switch (field) {
    case "type":        return draft.type ? null : "Pick the kind of page"
    case "name":        return validateName(draft.name)
    case "username":    return validateHandle(draft.username)
    case "headline":
      return draft.headline.trim().length > TAGLINE_MAX
        ? `Tagline can be up to ${TAGLINE_MAX} characters` : null
    case "description":
      return draft.description.trim().length > ABOUT_MAX
        ? `About can be up to ${ABOUT_MAX} characters` : null
    case "website":     return validateWebsite(draft.website)
    case "branchName":
      return draft.branchName.trim().length > BRANCH_NAME_MAX
        ? `Branch name can be up to ${BRANCH_NAME_MAX} characters` : null
    case "address":
      return draft.address.trim().length > ADDRESS_MAX
        ? `Address can be up to ${ADDRESS_MAX} characters` : null
    default:            return null
  }
}

export const STEP_FIELDS: Record<CreateStep, CreateField[]> = {
  type:     ["type"],
  basics:   ["name", "username", "headline", "description", "website"],
  location: ["branchName", "address"],
  review:   [],
}

export function validateStep(step: CreateStep, draft: CreateDraft): FieldErrors {
  const errors: FieldErrors = {}
  for (const field of STEP_FIELDS[step]) {
    const message = validateField(field, draft)
    if (message) errors[field] = message
  }
  return errors
}

export const firstErrorField = (errors: FieldErrors): CreateField | null =>
  FIELD_ORDER.find((field) => errors[field]) ?? null

/**
 * The first step whose required data is missing or wrong, or null when every
 * step before Review is complete. Location & sports is optional, so it is
 * never the answer unless its fields are over their limits.
 */
export function firstIncompleteStep(draft: CreateDraft): CreateStep | null {
  for (const step of CREATE_STEPS) {
    if (Object.keys(validateStep(step, draft)).length > 0) return step
  }
  return null
}

// ── The request ───────────────────────────────────────────────────

export function buildCreatePayload(draft: CreateDraft): CreateOrganizationPayload {
  if (!draft.type) throw new Error("A page type is required")

  const headline    = draft.headline.trim()
  const description = draft.description.trim()
  const website     = toServerWebsite(normalizeWebsite(draft.website))
  const city        = draft.city

  return {
    name:     draft.name.trim(),
    type:     draft.type,
    username: draft.username.trim().toLowerCase(),
    ...(headline    && { headline }),
    ...(description && { description }),
    ...(website     && { website }),
    ...(draft.level && { level: draft.level }),
    ...(draft.sportIds.length > 0 && { sport_ids: draft.sportIds }),
    ...(city && {
      location: {
        // BRANCH fields — the org's own.
        name:         draft.branchName.trim() || DEFAULT_BRANCH_NAME,
        address:      draft.address.trim(),
        city:         city.name,
        state:        city.state,
        country_code: city.country_code,
        latitude:     city.latitude,
        longitude:    city.longitude,
        // PLACE fields. `location_name` carries the picked label because
        // `name` above is the branch's; provider + external_id are what let
        // this branch share one Location row with every other actor in the
        // same town.
        location_name: city.label,
        provider:      city.provider,
        external_id:   city.external_id,
        type:          city.place_type,
        country:       city.country,
      },
    }),
  }
}
