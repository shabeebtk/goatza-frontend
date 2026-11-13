"use client"

import { ORG_PERMISSIONS, hasOrgPermission } from "@/shared/permissions/orgPermissions"
import { useAuthStore } from "@/store/auth.store"

export type SquadPermissions = {
  /** squads.view: see the squads at all. */
  canView: boolean
  /** squads.review: answer requests, invite, edit/remove/move players. */
  canReview: boolean
  /** squads.manage: create, edit and delete squads; photo, visibility, link, staff. */
  canManage: boolean
}

/**
 * What this person may do with the squads of `orgId`, from the org's
 * `my_permissions` (never a role name). The org is looked up by id rather than
 * taken from the active actor, the same as every squads call names its org.
 * Hints only: the server re-checks every write.
 */
export function useSquadPermissions(orgId: string): SquadPermissions {
  const canView = useAuthStore((state) =>
    hasOrgPermission(orgFor(state, orgId), ORG_PERMISSIONS.SQUADS_VIEW)
  )
  const canReview = useAuthStore((state) =>
    hasOrgPermission(orgFor(state, orgId), ORG_PERMISSIONS.SQUADS_REVIEW)
  )
  const canManage = useAuthStore((state) =>
    hasOrgPermission(orgFor(state, orgId), ORG_PERMISSIONS.SQUADS_MANAGE)
  )

  return { canView, canReview, canManage }
}

type AuthState = ReturnType<typeof useAuthStore.getState>

function orgFor(state: AuthState, orgId: string) {
  return state.currentOrganization?.id === orgId
    ? state.currentOrganization
    : state.organizations.find((organization) => organization.id === orgId)
}

/** The club's name for sentences ("{Org} · {Squad}"), from the org list in the store. */
export function useOrgName(orgId: string): string {
  return useAuthStore((state) => orgFor(state, orgId)?.name) || "your club"
}
