import { countLabel } from "./format"
import type { PageSections, ReadinessKey, SectionKey } from "./types"

/**
 * One entry per section of the page: its title, its icon, where its editor is,
 * and the hub's one-line status. The order a page shows them in depends on the
 * org's type, mirrored from the server (apps/orgpages/constants.py).
 */

export function orgAdminBase(orgId: string): string {
  return `/organization/admin/${orgId}`
}

export function pageBase(orgId: string): string {
  return `${orgAdminBase(orgId)}/page`
}

type SectionMeta<K extends SectionKey> = {
  title: string
  /** An mdi outline icon. */
  icon: string
  /** Where the hub's row goes: the section's editor, or the screen that owns it. */
  href: (orgId: string) => string
  /** The hub's status line for what is in the section. */
  statusLine: (status: PageSections[K]) => string
}

export const SECTION_META: { [K in SectionKey]: SectionMeta<K> } = {
  about: {
    title: "About & key facts",
    icon: "mdi:information-outline",
    href: (orgId) => `${pageBase(orgId)}/about`,
    statusLine: (status) => (status.filled ? "Complete" : "Not written yet"),
  },
  programs: {
    title: "Programs & fees",
    icon: "mdi:clipboard-list-outline",
    href: (orgId) => `${pageBase(orgId)}/programs`,
    statusLine: (status) =>
      status.count ? countLabel(status.count, "program", "programs") : "Not added yet",
  },
  facilities: {
    title: "Facilities",
    icon: "mdi:soccer-field",
    href: (orgId) => `${pageBase(orgId)}/facilities`,
    statusLine: (status) => {
      const parts = [
        status.items ? countLabel(status.items, "facility", "facilities") : "",
        status.photos ? countLabel(status.photos, "photo", "photos") : "",
      ].filter(Boolean)
      return parts.length ? parts.join(" · ") : "Not added yet"
    },
  },
  coaches: {
    title: "Coaches",
    icon: "mdi:whistle-outline",
    href: (orgId) => `${pageBase(orgId)}/people`,
    statusLine: (status) => (status.count ? `${status.count} shown` : "Not added yet"),
  },
  players: {
    title: "Players we developed",
    icon: "mdi:account-star-outline",
    href: (orgId) => `${pageBase(orgId)}/people?tab=players`,
    statusLine: (status) => (status.count ? `${status.count} shown` : "Not picked yet"),
  },
  squads: {
    title: "Squads",
    icon: "mdi:shield-account-outline",
    href: (orgId) => `${orgAdminBase(orgId)}/squads`,
    statusLine: (status) =>
      status.count
        ? `${countLabel(status.count, "squad", "squads")} · managed in Squads`
        : "No public squads yet",
  },
  locations: {
    title: "Locations",
    icon: "mdi:map-marker-outline",
    href: (orgId) => `${orgAdminBase(orgId)}/profile?edit=profile`,
    statusLine: (status) =>
      status.count ? countLabel(status.count, "branch", "branches") : "Not added yet",
  },
  trials: {
    title: "Open trials",
    icon: "mdi:briefcase-search-outline",
    href: (orgId) => `${orgAdminBase(orgId)}/recruitments`,
    statusLine: (status) => (status.count ? `${status.count} open` : "None open right now"),
  },
  posts: {
    title: "Posts",
    icon: "mdi:newspaper-variant-outline",
    href: (orgId) => `${orgAdminBase(orgId)}/posts`,
    statusLine: () => "Always shown",
  },
}

/** The hub's status line for one section, read from the hub's `sections`. */
export function sectionStatusLine(key: SectionKey, sections: PageSections): string {
  switch (key) {
    case "about":
      return SECTION_META.about.statusLine(sections.about)
    case "facilities":
      return SECTION_META.facilities.statusLine(sections.facilities)
    default:
      return SECTION_META[key].statusLine(sections[key])
  }
}

/** Does the section have anything in it to show? */
export function sectionHasContent(key: SectionKey, sections: PageSections): boolean {
  switch (key) {
    case "about":
      return sections.about.filled
    case "facilities":
      return sections.facilities.items > 0 || sections.facilities.photos > 0
    default:
      return sections[key].count > 0
  }
}

const ACADEMY_ORDER: SectionKey[] = [
  "about",
  "programs",
  "facilities",
  "coaches",
  "players",
  "squads",
  "locations",
  "trials",
  "posts",
]

const CLUB_ORDER: SectionKey[] = [
  "about",
  "squads",
  "trials",
  "coaches",
  "players",
  "programs",
  "facilities",
  "locations",
  "posts",
]

/** The order the page shows its sections in. A type the server doesn't know reads like a club. */
export function sectionOrder(type: string | null | undefined): SectionKey[] {
  return type === "academy" ? ACADEMY_ORDER : CLUB_ORDER
}

// ── Readiness: what the hub offers next ──────────────────────

type ReadinessStep = {
  /** The button. */
  cta: string
  href: (orgId: string) => string
  /** One sentence on why; `noun` is "academy", "club" or "team". */
  why: (noun: string) => string
}

/** For the server's `readiness.next.key`: the button, where it goes, and why. */
export const READINESS_STEPS: Record<ReadinessKey, ReadinessStep> = {
  programs: {
    cta: "Add a program",
    href: (orgId) => `${pageBase(orgId)}/programs/new`,
    why: () => "Parents look for programs and fees first.",
  },
  facilities: {
    cta: "Add facilities",
    href: (orgId) => `${pageBase(orgId)}/facilities`,
    why: () => "Pages with facilities and photos are easier to choose.",
  },
  coaches: {
    cta: "Add coaches",
    href: (orgId) => `${pageBase(orgId)}/people`,
    why: () => "Families want to know who coaches.",
  },
  about: {
    cta: "Write about your page",
    href: (orgId) => `${pageBase(orgId)}/about`,
    why: (noun) => `A few lines about your ${noun} help people decide.`,
  },
  facts: {
    cta: "Add key facts",
    href: (orgId) => `${pageBase(orgId)}/about#facts`,
    why: () => "Key facts answer the first questions people ask.",
  },
  photos: {
    cta: "Add a logo and cover",
    href: (orgId) => `${orgAdminBase(orgId)}/profile?edit=photos`,
    why: () => "A logo and cover make your page look trusted.",
  },
  location: {
    cta: "Add a location",
    href: (orgId) => `${orgAdminBase(orgId)}/profile?edit=profile`,
    why: () => "Add where you train so people nearby find you.",
  },
  contact: {
    cta: "Choose how people reach you",
    href: (orgId) => `${pageBase(orgId)}/contact`,
    why: () => "Let people reach you in one tap.",
  },
}
