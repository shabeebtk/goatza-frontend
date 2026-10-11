/**
 * Role-based navigation — single source of truth.
 *
 * Every nav destination for the authenticated app is declared here, per role.
 * The nav components (AppNav) render PURELY from this config; there is no
 * role-based branching in the JSX. Adding a nav item for a role is a one-line
 * change to that role's array in `NAV_CONFIG`.
 *
 * ── The three surfaces this config feeds ───────────────────────────────────
 *
 * 1. Mobile bottom bar (collapsed) — the five always-visible tabs.
 *    Fed by `getBottomNav` (placement "bottom"), plus `getTopBarNav` for the
 *    mobile top-bar icons. Never shows "sheet" items.
 *
 * 2. Mobile expand sheet (grouped) — the full destination list that slides up
 *    from the bottom bar. Fed by `getSheetSections`, which buckets every
 *    navigable item into "discover" (places to go) and "you" (your stuff),
 *    regardless of placement, plus `getSheetFooter` for Settings, which
 *    renders pinned at the bottom of the sheet rather than inside a group.
 *
 * 3. Desktop top bar — three clusters, not one flat list:
 *      `getDesktopPrimary` → inline links on the left (the "discover" group)
 *      `getDesktopRight`   → Messages/Alerts as right-cluster icons
 *      `getDesktopMore`    → the overflow panel ("you" group + Settings)
 *    The avatar/profile entry is handled separately by the component.
 *
 * Placement:
 *   - "bottom" → mobile bottom tab bar (and, for link items, the desktop top nav)
 *   - "top"    → mobile top-bar icons (and, for link items, the desktop top nav)
 *   - "sheet"  → ONLY the mobile expand sheet and the desktop More panel;
 *                never the bottom bar, never the mobile top bar, never the
 *                inline desktop links.
 *
 * Grouping:
 *   A `link`/`profile` item needs a `group` to appear in the expand sheet or
 *   in the desktop clusters. Untagged items are skipped by those selectors —
 *   tag new destinations with "discover" or "you" when you add them.
 *
 * Item kinds:
 *   - "link"    → a normal navigation tab (Next <Link>)
 *   - "create"  → the create-post trigger (opens a modal, no href)
 *   - "profile" → the profile tab (avatar + long-press account switcher)
 */

import type { UserRole } from "@/shared/constants/roles"

export type NavPlacement = "bottom" | "top" | "sheet"

/** Which section of the expand sheet / desktop cluster an item belongs to. */
export type NavGroup = "discover" | "you"

/** Live badge sources exposed by the nav (per-actor unread counts). */
export type NavBadgeKey = "messages" | "notifications"

type NavItemBase = {
  /** Stable identifier, unique within a role's item list. */
  id: string
  label: string
  /** Idle (outline) icon — Iconify name. */
  icon: string
  /** Active (filled) icon — Iconify name. */
  iconActive: string
  placement: NavPlacement
  /** Optional live unread badge. */
  badge?: NavBadgeKey
  /** Section this item sits in, in the desktop clusters and (by default) the
   *  expand sheet. */
  group?: NavGroup
  /**
   * Section in the MOBILE SHEET, when the desktop grouping is the wrong
   * answer there. Tournaments is the case it exists for: on desktop it is
   * overflow ("you" → the More panel), but in the sheet it is somewhere to
   * go, and filing it under "You" next to Saved and Profile would read as
   * something of the reader's. Defaults to `group`.
   */
  sheetGroup?: NavGroup
  /** Rendered, but not navigable (no href follow, no active state). */
  disabled?: boolean
  /** Shows a "Soon" chip next to the label. */
  comingSoon?: boolean
}

export type LinkNavItem = NavItemBase & { kind: "link"; href: string }
export type CreateNavItem = NavItemBase & { kind: "create" }
export type ProfileNavItem = NavItemBase & { kind: "profile"; href: string }

export type NavItem = LinkNavItem | CreateNavItem | ProfileNavItem

/** Everything that is an actual destination — i.e. not the create trigger. */
export type NavDestination = LinkNavItem | ProfileNavItem

/** One titled section of the mobile expand sheet. */
export type NavSheetSection = {
  group: NavGroup
  items: readonly NavDestination[]
}

// ── Shared item definitions ─────────────────────────────────────────────────
// Declared once and composed per role below so a label/icon/href change lands
// in exactly one place.

const HOME: LinkNavItem = {
  id: "home",
  label: "Home",
  href: "/home",
  icon: "mdi:home-outline",
  iconActive: "mdi:home",
  placement: "bottom",
  kind: "link",
  group: "discover",
}

const EXPLORE: LinkNavItem = {
  id: "explore",
  label: "Explore",
  href: "/explore",
  icon: "mdi:compass-outline",
  iconActive: "mdi:compass",
  placement: "top",
  kind: "link",
  group: "discover",
}

const RECRUITMENT: LinkNavItem = {
  id: "recruitments",
  label: "Recruitments",
  href: "/recruitments",
  icon: "mdi:briefcase-search-outline",
  iconActive: "mdi:briefcase-search",
  placement: "bottom",
  kind: "link",
  group: "discover",
}

const COACHING: LinkNavItem = {
  id: "coaching",
  label: "Coaching",
  href: "/coaching",
  icon: "mdi:whistle-outline",
  iconActive: "mdi:whistle",
  placement: "bottom",
  kind: "link",
  group: "discover",
}

const SCOUTING: LinkNavItem = {
  id: "scouting",
  label: "Scouting",
  href: "/scouting",
  icon: "mdi:binoculars",
  iconActive: "mdi:binoculars",
  placement: "bottom",
  kind: "link",
  group: "discover",
}

const TOURNAMENTS: LinkNavItem = {
  id: "tournaments",
  label: "Tournaments",
  href: "/tournaments",
  icon: "mdi:trophy-outline",
  iconActive: "mdi:trophy",
  placement: "sheet",
  kind: "link",
  // "you" keeps it out of the desktop bar's primary row and puts it in the
  // More panel; `sheetGroup` keeps it under Discover on mobile, where there
  // is room for a destination that is not here yet.
  group: "you",
  sheetGroup: "discover",
  disabled: true,
  comingSoon: true,
}

const CREATE: CreateNavItem = {
  id: "create",
  label: "Create",
  icon: "mdi:plus",
  iconActive: "mdi:plus",
  placement: "bottom",
  kind: "create",
}

const MESSAGES: LinkNavItem = {
  id: "messages",
  label: "Messages",
  href: "/messages",
  icon: "mdi:message-outline",
  iconActive: "mdi:message",
  placement: "bottom",
  kind: "link",
  badge: "messages",
  group: "you",
}

const NOTIFICATIONS: LinkNavItem = {
  id: "notifications",
  label: "Alerts",
  href: "/notifications",
  icon: "mdi:bell-outline",
  iconActive: "mdi:bell",
  placement: "top",
  kind: "link",
  badge: "notifications",
  group: "you",
}

const MATCH_DIARY: LinkNavItem = {
  id: "match_diary",
  label: "Match diary",
  // The player's match diary page, not a settings screen.
  href: "/matches",
  icon: "mdi:notebook-outline",
  iconActive: "mdi:notebook",
  placement: "sheet",
  kind: "link",
  group: "you",
}

const SAVED: LinkNavItem = {
  id: "saved",
  label: "Saved",
  href: "/settings/saved",
  icon: "mdi:bookmark-outline",
  iconActive: "mdi:bookmark",
  placement: "sheet",
  kind: "link",
  group: "you",
}

const PROFILE: ProfileNavItem = {
  id: "profile",
  label: "Profile",
  href: "/profile",
  icon: "mdi:account-circle-outline",
  iconActive: "mdi:account-circle",
  placement: "bottom",
  kind: "profile",
  group: "you",
}

const SETTINGS: LinkNavItem = {
  id: "settings",
  label: "Settings",
  href: "/settings",
  icon: "mdi:cog-outline",
  iconActive: "mdi:cog",
  placement: "sheet",
  kind: "link",
  group: "you",
}

/**
 * Per-role navigation. Declaration order is the render order for every
 * surface — which is why Tournaments sits at the END rather than next to
 * Explore: it is the last row of the desktop More panel, and its section in
 * the mobile sheet (Discover, via `sheetGroup`) holds nothing after it
 * either, so the one position satisfies both.
 *
 * The surfaces:
 *   bottom bar     → items filtered to placement "bottom"
 *   mobile top bar → `link` items filtered to placement "top"
 *   expand sheet   → every `link`/`profile` item, bucketed by `group`
 *   desktop        → "discover" links inline, Messages/Alerts right,
 *                    "you" links in More
 *
 * `org_user` intentionally mirrors `player` (recruitments) — its behavior is
 * unchanged. `coach`/`scout` swap Recruitments for Coaching/Scouting.
 */
export const NAV_CONFIG: Record<UserRole, readonly NavItem[]> = {
  player: [
    HOME,
    EXPLORE,
    RECRUITMENT,
    CREATE,
    MESSAGES,
    NOTIFICATIONS,
    MATCH_DIARY,
    SAVED,
    PROFILE,
    SETTINGS,
    TOURNAMENTS,
  ],
  coach: [
    HOME,
    EXPLORE,
    COACHING,
    CREATE,
    MESSAGES,
    NOTIFICATIONS,
    MATCH_DIARY,
    SAVED,
    PROFILE,
    SETTINGS,
    TOURNAMENTS,
  ],
  scout: [
    HOME,
    EXPLORE,
    SCOUTING,
    CREATE,
    MESSAGES,
    NOTIFICATIONS,
    MATCH_DIARY,
    SAVED,
    PROFILE,
    SETTINGS,
    TOURNAMENTS,
  ],
  org_user: [
    HOME,
    EXPLORE,
    RECRUITMENT,
    CREATE,
    MESSAGES,
    NOTIFICATIONS,
    MATCH_DIARY,
    SAVED,
    PROFILE,
    SETTINGS,
    TOURNAMENTS,
  ],
}

// ── Selectors ────────────────────────────────────────────────────────────────

/**
 * Resolve the nav items for a role, or `null` while the role is unknown
 * (session still resolving). Callers render a skeleton on `null` so a wrong
 * nav never flashes for coach/scout.
 */
export function getNavItems(role: UserRole | null | undefined): readonly NavItem[] | null {
  if (!role) return null
  return NAV_CONFIG[role] ?? null
}

/** Mobile bottom tab bar, in order. "sheet" items are excluded by placement. */
export function getBottomNav(items: readonly NavItem[]): readonly NavItem[] {
  return items.filter((item) => item.placement === "bottom")
}

/** Mobile top-bar icons, in order. */
export function getTopBarNav(items: readonly NavItem[]): readonly LinkNavItem[] {
  return items.filter((item): item is LinkNavItem => item.placement === "top" && item.kind === "link")
}

/**
 * Desktop horizontal top nav — every inline navigable destination, in order.
 * "sheet" items are deliberately excluded: they live in the More panel
 * (`getDesktopMore`), so this keeps returning exactly the bar links it always
 * has (Home, Explore, Recruitments/…, Messages, Alerts).
 *
 * NOTE: nothing calls this any more. The desktop bar is built from the three
 * cluster selectors below (primary / right / more) since Messages and Alerts
 * became right-cluster icons. Kept as the one flat-list view of the bar;
 * safe to delete once it is clear nothing wants it back.
 */
export function getDesktopNav(items: readonly NavItem[]): readonly LinkNavItem[] {
  return items.filter((item): item is LinkNavItem => item.kind === "link" && item.placement !== "sheet")
}

// ── Surface-specific selectors (expand sheet + desktop clusters) ─────────────

/** True for real destinations (link/profile) — the create trigger is not one. */
function isDestination(item: NavItem): item is NavDestination {
  return item.kind === "link" || item.kind === "profile"
}

/** The settings entry is pinned to the sheet footer / More panel, never a group. */
function isSettings(item: NavItem): boolean {
  return item.id === SETTINGS.id
}

/** Messages/Alerts render as desktop right-cluster icons, not inline links. */
function isRightCluster(item: NavItem): boolean {
  return item.id === MESSAGES.id || item.id === NOTIFICATIONS.id
}

/**
 * Mobile expand sheet, grouped. Every destination (all placements, both
 * `link` and `profile`) lands in its `group`, in declaration order. The
 * create trigger and Settings are excluded — Settings renders in the sheet
 * footer via `getSheetFooter`.
 *
 * Sections are always returned in a stable order ("discover" then "you") and
 * may be empty; the component decides whether to render an empty section.
 */
export function getSheetSections(items: readonly NavItem[]): readonly NavSheetSection[] {
  const sheetItems = items.filter(
    (item): item is NavDestination => isDestination(item) && !isSettings(item),
  )

  const sectionOf = (item: NavDestination) => item.sheetGroup ?? item.group

  return [
    { group: "discover", items: sheetItems.filter((item) => sectionOf(item) === "discover") },
    { group: "you", items: sheetItems.filter((item) => sectionOf(item) === "you") },
  ]
}

/** The sheet's pinned footer row — Settings, or `null` if the role has none. */
export function getSheetFooter(items: readonly NavItem[]): LinkNavItem | null {
  return items.find((item): item is LinkNavItem => item.kind === "link" && isSettings(item)) ?? null
}

/**
 * Desktop inline links — the "discover" group, in order
 * (Home, Explore, Recruitments/Coaching/Scouting, Tournaments).
 */
export function getDesktopPrimary(items: readonly NavItem[]): readonly LinkNavItem[] {
  return items.filter((item): item is LinkNavItem => item.kind === "link" && item.group === "discover")
}

/** Desktop right-cluster icons — Messages then Alerts, in declaration order. */
export function getDesktopRight(items: readonly NavItem[]): readonly LinkNavItem[] {
  return items.filter((item): item is LinkNavItem => item.kind === "link" && isRightCluster(item))
}

/**
 * Desktop More panel — the "you" links that are not right-cluster icons
 * (Match diary, Saved) followed by Settings, which the same filter picks up
 * last in declaration order. Profile is the avatar, handled separately.
 */
export function getDesktopMore(items: readonly NavItem[]): readonly LinkNavItem[] {
  return items.filter(
    (item): item is LinkNavItem =>
      item.kind === "link" && item.group === "you" && !isRightCluster(item),
  )
}
