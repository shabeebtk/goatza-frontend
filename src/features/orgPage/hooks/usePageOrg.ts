"use client"

import type { OrganizationMini } from "@/features/organization/types"
import { useAuthStore } from "@/store/auth.store"

type AuthState = ReturnType<typeof useAuthStore.getState>

/** The org with this id from the store: the active one, or any the person belongs to. */
export function storeOrgFor(state: AuthState, orgId: string): OrganizationMini | undefined {
  return state.currentOrganization?.id === orgId
    ? state.currentOrganization
    : state.organizations.find((organization) => organization.id === orgId)
}

/**
 * The page's org as the store has it: name, username, type, logo and this person's
 * `my_permissions`. Enough for the hub's words and links without another request.
 */
export function usePageOrg(orgId: string): OrganizationMini | undefined {
  return useAuthStore((state) => storeOrgFor(state, orgId))
}
