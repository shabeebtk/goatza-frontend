/**
 * What a member of an organization may do, on the client.
 *
 * THE RULE: never check a role name to decide what to show. Check a permission.
 * `my_permissions` comes from the server (/organizations/list and
 * /organizations/details), and it already accounts for role defaults and
 * per-person overrides, so a later "let this coach post announcements" needs no
 * change on any screen.
 *
 * These are hints. They decide what the UI offers, and every gated action is
 * re-checked on the server (apps/organization/permissions.py, which these names
 * have to match).
 */

import { useAuthStore } from "@/store/auth.store"

import type { OrgMemberRole } from "@/features/organization/types"

export const ORG_PERMISSIONS = {
  MEMBERS_VIEW: "members.view",
  MEMBERS_MANAGE: "members.manage",
  ORG_PRIVACY: "org.privacy",
  RECRUITMENTS_SPEAK: "recruitments.speak",
  VERIFICATIONS_REVIEW: "verifications.review",
  ORG_BLOCK: "org.block",
  ORG_RECEIVE_ALERTS: "org.receive_alerts",
} as const

export type OrgPermission = (typeof ORG_PERMISSIONS)[keyof typeof ORG_PERMISSIONS]

type WithPermissions = { my_permissions?: string[] | null } | null | undefined

export function hasOrgPermission(org: WithPermissions, permission: OrgPermission): boolean {
  return org?.my_permissions?.includes(permission) ?? false
}

/** The same check for the organization the person is acting as right now. */
export function useOrgPermission(permission: OrgPermission): boolean {
  return useAuthStore((state) => hasOrgPermission(state.currentOrganization, permission))
}

/** Words for a role. A label only: see THE RULE above. */
export const ORG_ROLE_LABELS: Record<OrgMemberRole, string> = {
  owner: "Owner",
  coach: "Coach",
  staff: "Staff",
}

export function orgRoleLabel(role: string | null | undefined): string {
  return ORG_ROLE_LABELS[role as OrgMemberRole] ?? "Member"
}
