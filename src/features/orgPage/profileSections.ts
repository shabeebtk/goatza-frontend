import { LEVEL_LABELS } from "@/features/organization/orgLevel"
import { formatAges, formatDays } from "./format"
import {
  SWITCHABLE_SECTIONS,
  type SectionKey,
  type ShowcaseFacility,
  type ShowcaseFacts,
  type ShowcasePlayer,
} from "./types"

/**
 * The rules of the page's sections on the profile, with no React in them: which
 * keys this build draws, what each one has to show, and the order the body is
 * laid out in. The sections and the sticky bar both read them, so the bar never
 * offers a section that drew nothing.
 */

const KNOWN: ReadonlySet<string> = new Set<string>([...SWITCHABLE_SECTIONS, "posts"])

/** The sticky bar's words. */
export const SECTION_CHIP_LABELS: Record<SectionKey, string> = {
  about: "About",
  programs: "Programs",
  facilities: "Facilities",
  coaches: "Coaches",
  players: "Players",
  squads: "Squads",
  locations: "Locations",
  trials: "Trials",
  posts: "Posts",
}

/** The element a section is drawn in, which the bar scrolls to. */
export function sectionDomId(key: string): string {
  return `page-${key}`
}

/**
 * The server's order with anything this build doesn't know dropped, each key
 * once, and posts last (and always there: it has no switch).
 */
export function knownOrder(order: readonly string[] | null | undefined): SectionKey[] {
  const seen = new Set<string>()
  const keys: SectionKey[] = []
  for (const key of order ?? []) {
    if (!KNOWN.has(key) || key === "posts" || seen.has(key)) continue
    seen.add(key)
    keys.push(key as SectionKey)
  }
  return [...keys, "posts"]
}

/**
 * Branches with anything to show: a facility, the club's own words or a photo.
 * Each list defaults to empty, so a short payload draws less, never breaks.
 */
export function facilitiesWithContent(
  facilities: readonly ShowcaseFacility[] | null | undefined
): ShowcaseFacility[] {
  return (facilities ?? [])
    .map((branch) => ({
      ...branch,
      items: branch.items ?? [],
      custom_items: branch.custom_items ?? [],
      photos: branch.photos ?? [],
    }))
    .filter((branch) => branch.items.length > 0 || branch.custom_items.length > 0 || branch.photos.length > 0)
}

// ── About: key facts and links ────────────────────────────────

export type FactRow = { key: string; icon: string; label: string; value: string }

/** "Ages 6 – 18" → Ages · 6 – 18; "Up to age 12" → Ages · Up to 12. */
function agesRow(min: number | null, max: number | null): FactRow | null {
  const text = formatAges(min, max)
  if (!text) return null
  const split = /^(Ages?) (.+)$/.exec(text)
  return {
    key: "ages",
    icon: "mdi:account-child-outline",
    label: split ? split[1] : "Ages",
    value: split ? split[2] : text.replace(/^Up to age /, "Up to "),
  }
}

/** The key facts that are filled, in the page's order. */
export function factRows(facts: ShowcaseFacts | null | undefined, level: string | null | undefined): FactRow[] {
  const rows: (FactRow | null)[] = [
    facts?.founded_year
      ? { key: "founded", icon: "mdi:flag-outline", label: "Founded", value: String(facts.founded_year) }
      : null,
    facts ? agesRow(facts.age_min, facts.age_max) : null,
    facts?.coaching_languages?.length
      ? {
          key: "languages",
          icon: "mdi:translate",
          label: "Coaching in",
          value: facts.coaching_languages.join(", "),
        }
      : null,
    facts?.training_days?.length
      ? {
          key: "days",
          icon: "mdi:calendar-week-outline",
          label: "Training days",
          value: formatDays(facts.training_days),
        }
      : null,
    facts?.student_range_label
      ? { key: "students", icon: "mdi:account-group-outline", label: "Students", value: facts.student_range_label }
      : null,
    level && LEVEL_LABELS[level]
      ? { key: "level", icon: "mdi:medal-outline", label: "Level", value: LEVEL_LABELS[level] }
      : null,
  ]
  return rows.filter((row): row is FactRow => Boolean(row && row.value))
}

export type LinkPill = { key: string; icon: string; label: string; href: string; ariaLabel: string }

/** Website (the profile's own), then Instagram, YouTube, Facebook: whichever are set. */
export function linkPills(
  orgName: string,
  website: string | null | undefined,
  links: ShowcaseFacts["links"] | null | undefined
): LinkPill[] {
  const pills: LinkPill[] = []
  const add = (key: string, icon: string, label: string, href: string | null | undefined, ariaLabel: string) => {
    const url = (href ?? "").trim()
    if (url) pills.push({ key, icon, label, href: url, ariaLabel })
  }
  add("website", "mdi:web", "Website", website, `${orgName}'s website`)
  add("instagram", "mdi:instagram", "Instagram", links?.instagram, `${orgName} on Instagram`)
  add("youtube", "mdi:youtube", "YouTube", links?.youtube, `${orgName} on YouTube`)
  add("facebook", "mdi:facebook", "Facebook", links?.facebook, `${orgName} on Facebook`)
  return pills
}

/** The facts the desktop aside lists as Quick facts, in its order. */
export const QUICK_FACT_KEYS = ["founded", "ages", "students", "days"] as const

/** Quick facts: Founded, Ages, Students, Training days, each only when filled. */
export function quickFactRows(facts: ShowcaseFacts | null | undefined): FactRow[] {
  const rows = factRows(facts, null)
  return QUICK_FACT_KEYS.map((key) => rows.find((row) => row.key === key)).filter(
    (row): row is FactRow => Boolean(row)
  )
}

/**
 * Whether About has anything to show a visitor: what AboutSection draws, less
 * the facts that are drawn elsewhere at this width (`omitFacts`).
 */
export function aboutHasContent({
  orgName,
  description,
  website,
  level,
  facts,
  omitFacts = [],
}: {
  orgName: string
  description: string | null | undefined
  website: string | null | undefined
  level: string | null | undefined
  facts: ShowcaseFacts | null | undefined
  omitFacts?: readonly string[]
}): boolean {
  const rows = factRows(facts, level).filter((row) => !omitFacts.includes(row.key))
  return Boolean(description?.trim() || rows.length > 0 || linkPills(orgName, website, facts?.links).length > 0)
}

// ── Players we developed ──────────────────────────────────────

/** "Goalkeeper · here 2019 – 2023". */
export function playerLine(player: Pick<ShowcasePlayer, "position" | "years_label">): string {
  return [player.position, player.years_label ? `here ${player.years_label}` : ""].filter(Boolean).join(" · ")
}

/** "Now at Gokulam Kerala", else the club's own words about them. */
export function playerNote(player: Pick<ShowcasePlayer, "now_at" | "highlight">): string {
  if (player.now_at?.trim()) return `Now at ${player.now_at.trim()}`
  return player.highlight?.trim() ?? ""
}

// ── Locations ─────────────────────────────────────────────────

/** What the profile bundle carries per branch, signed in or not. */
export type ProfileLocation = {
  id: string
  name: string
  address: string
  city: string
  state: string
  country_code?: string
  latitude: number | null
  longitude: number | null
  is_primary: boolean
}

/** Google Maps directions: the pin when there is one, else the address (with its city). */
export function directionsUrl(location: ProfileLocation): string | null {
  if (location.latitude != null && location.longitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`
  }
  const address = location.address?.trim()
  if (!address) return null
  const query = [address, location.city?.trim()].filter(Boolean).join(", ")
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

// ── The body ──────────────────────────────────────────────────

/** Whether each section has anything to draw for this viewer. */
export type SectionPresence = Record<SectionKey, boolean>

/** The keys that render, in the page's order: what the sticky bar offers. */
export function renderedSections(order: readonly SectionKey[], presence: SectionPresence): SectionKey[] {
  return order.filter((key) => presence[key])
}

export type BodySlot = SectionKey | "sports"

/**
 * The body in order, with the Sports grid (which has no key) right after the
 * about slot, or first when About is switched off. Right after the slot even
 * when About itself has nothing to draw.
 */
export function bodySlots(
  order: readonly SectionKey[],
  rendered: readonly SectionKey[],
  hasSports: boolean
): BodySlot[] {
  const drawn = new Set(rendered)
  const slots: BodySlot[] = []
  for (const key of order) {
    if (drawn.has(key)) slots.push(key)
    if (key === "about" && hasSports) slots.push("sports")
  }
  if (hasSports && !order.includes("about")) slots.unshift("sports")
  return slots
}
