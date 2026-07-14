/**
 * Single source of truth for the 4 user roles.
 *
 * The backend enum values (`player` | `coach` | `scout` | `org_user`) are the
 * source of truth — these strings must match `User.Role` on the server. UI labels
 * and descriptions live ONLY here; never hardcode a role label anywhere else.
 */

export const USER_ROLES = ["player", "coach", "scout", "org_user"] as const

export type UserRole = (typeof USER_ROLES)[number]

export type RoleMeta = {
  label: string
  description: string
  icon: string
}

export const ROLE_META: Record<UserRole, RoleMeta> = {
  player: {
    label: "Player",
    description:
      "Build your athlete profile, get discovered, and apply to trials & opportunities",
    icon: "mdi:run-fast",
  },
  coach: {
    label: "Coach",
    description:
      "Showcase your coaching journey and connect with players and organizations",
    icon: "mdi:whistle-outline",
  },
  scout: {
    label: "Scout",
    description: "Discover, follow, and track talent across sports",
    icon: "mdi:binoculars",
  },
  org_user: {
    label: "Club / Academy Management",
    description:
      "Create and manage your club, academy, or team — post, recruit, and grow",
    icon: "mdi:office-building-outline",
  },
}

/**
 * Human-readable label for a role value. Falls back gracefully for unknown values
 * (e.g. a role the backend adds before the frontend knows about it).
 */
export function getRoleLabel(role: string | null | undefined): string {
  if (!role) return "Member"
  return (ROLE_META as Record<string, RoleMeta>)[role]?.label ?? role
}
