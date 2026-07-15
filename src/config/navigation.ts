/**
 * Role-based navigation — single source of truth.
 *
 * Every nav destination for the authenticated app is declared here, per role.
 * The nav components (AppNav) render PURELY from this config; there is no
 * role-based branching in the JSX. Adding a nav item for a role is a one-line
 * change to that role's array in `NAV_CONFIG`.
 *
 * Placement:
 *   - "bottom" → mobile bottom tab bar (and, for link items, the desktop top nav)
 *   - "top"    → mobile top-bar icons (and, for link items, the desktop top nav)
 *
 * The desktop top navigation is composed from every `link` item (both
 * placements) in declaration order, so coach/scout automatically see
 * Coaching/Scouting where a player sees Recruitments.
 *
 * Item kinds:
 *   - "link"    → a normal navigation tab (Next <Link>)
 *   - "create"  → the create-post trigger (opens a modal, no href)
 *   - "profile" → the profile tab (avatar + long-press account switcher)
 */

import type { UserRole } from "@/shared/constants/roles"

export type NavPlacement = "bottom" | "top"

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
}

export type LinkNavItem = NavItemBase & { kind: "link"; href: string }
export type CreateNavItem = NavItemBase & { kind: "create" }
export type ProfileNavItem = NavItemBase & { kind: "profile"; href: string }

export type NavItem = LinkNavItem | CreateNavItem | ProfileNavItem

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
}

const EXPLORE: LinkNavItem = {
  id: "explore",
  label: "Explore",
  href: "/explore",
  icon: "mdi:compass-outline",
  iconActive: "mdi:compass",
  placement: "top",
  kind: "link",
}

const RECRUITMENT: LinkNavItem = {
  id: "recruitments",
  label: "Recruitments",
  href: "/recruitments",
  icon: "mdi:briefcase-search-outline",
  iconActive: "mdi:briefcase-search",
  placement: "bottom",
  kind: "link",
}

const COACHING: LinkNavItem = {
  id: "coaching",
  label: "Coaching",
  href: "/coaching",
  icon: "mdi:whistle-outline",
  iconActive: "mdi:whistle",
  placement: "bottom",
  kind: "link",
}

const SCOUTING: LinkNavItem = {
  id: "scouting",
  label: "Scouting",
  href: "/scouting",
  icon: "mdi:binoculars",
  iconActive: "mdi:binoculars",
  placement: "bottom",
  kind: "link",
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
}

const PROFILE: ProfileNavItem = {
  id: "profile",
  label: "Profile",
  href: "/profile",
  icon: "mdi:account-circle-outline",
  iconActive: "mdi:account-circle",
  placement: "bottom",
  kind: "profile",
}

/**
 * Per-role navigation. Declaration order is the render order:
 *   bottom bar → items filtered to placement "bottom"
 *   top bar    → items filtered to placement "top"
 *   desktop    → every `link` item, both placements
 *
 * `org_user` intentionally mirrors `player` (recruitments) — its behavior is
 * unchanged. `coach`/`scout` swap Recruitments for Coaching/Scouting.
 */
export const NAV_CONFIG: Record<UserRole, readonly NavItem[]> = {
  player: [HOME, EXPLORE, RECRUITMENT, CREATE, MESSAGES, NOTIFICATIONS, PROFILE],
  coach: [HOME, EXPLORE, COACHING, CREATE, MESSAGES, NOTIFICATIONS, PROFILE],
  scout: [HOME, EXPLORE, SCOUTING, CREATE, MESSAGES, NOTIFICATIONS, PROFILE],
  org_user: [HOME, EXPLORE, RECRUITMENT, CREATE, MESSAGES, NOTIFICATIONS, PROFILE],
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

/** Mobile bottom tab bar, in order. */
export function getBottomNav(items: readonly NavItem[]): readonly NavItem[] {
  return items.filter((item) => item.placement === "bottom")
}

/** Mobile top-bar icons, in order. */
export function getTopBarNav(items: readonly NavItem[]): readonly LinkNavItem[] {
  return items.filter((item): item is LinkNavItem => item.placement === "top" && item.kind === "link")
}

/** Desktop horizontal top nav — every navigable destination, in order. */
export function getDesktopNav(items: readonly NavItem[]): readonly LinkNavItem[] {
  return items.filter((item): item is LinkNavItem => item.kind === "link")
}
