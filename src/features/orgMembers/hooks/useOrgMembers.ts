"use client"

import { useCallback } from "react"
import { useRouter } from "next/navigation"
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query"

import { orgKeys } from "@/features/organization/hooks/useOrganizations"
import { getOrganizationsApi } from "@/features/organization/services/organization.api"
import type { OrgMemberRole, OrganizationMini } from "@/features/organization/types"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { useAuthStore } from "@/store/auth.store"
import { markLeaving, unmarkLeaving } from "../leavingOrganizations"
import {
  acceptInviteApi,
  cancelInviteApi,
  changeMemberRoleApi,
  declineInviteApi,
  getMyInvitesApi,
  getOrgMembersApi,
  getPendingInvitesApi,
  inviteMemberApi,
  leaveOrganizationApi,
  orgMemberKeys,
  removeMemberApi,
  type InviteTarget,
} from "../services/orgMembers.api"

// ── Reads ─────────────────────────────────────────────────────

export const useOrgMembers = (orgId: string) =>
  useQuery({
    queryKey: orgMemberKeys.members(orgId),
    queryFn: () => getOrgMembersApi(orgId),
  })

export const usePendingInvites = (orgId: string, enabled: boolean) =>
  useQuery({
    queryKey: orgMemberKeys.invites(orgId),
    queryFn: () => getPendingInvitesApi(orgId),
    enabled,
  })

/** This person's open invites, wherever they are in the app and whoever they are acting as. */
export const useMyInvites = () => {
  const userId = useAuthStore((state) => state.user?.id)

  return useQuery({
    queryKey: orgMemberKeys.myInvites(userId),
    queryFn: getMyInvitesApi,
    enabled: !!userId,
    staleTime: 1000 * 60,
  })
}

// ── The org list in the store ─────────────────────────────────

/**
 * Fetch /organizations/list and put it in the auth store now. ActorRouteSync
 * would get there too, but not before the Switch action on a toast shown a moment
 * later needs the new org to be in the store.
 */
export async function refreshOrganizations(queryClient: QueryClient): Promise<void> {
  const organizations = await queryClient.fetchQuery({
    queryKey: orgKeys.list(),
    queryFn: getOrganizationsApi,
    staleTime: 0,
  })
  useAuthStore.getState().setOrganizations(organizations)
}

// ── Writes on the org's side ──────────────────────────────────

export const useInviteMember = (orgId: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ target, role }: { target: InviteTarget; role: OrgMemberRole }) =>
      inviteMemberApi(orgId, target, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orgMemberKeys.invites(orgId) })
    },
  })
}

export const useCancelInvite = (orgId: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (inviteId: string) => cancelInviteApi(orgId, inviteId),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: orgMemberKeys.invites(orgId) })
    },
  })
}

export const useChangeMemberRole = (orgId: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: OrgMemberRole }) =>
      changeMemberRoleApi(orgId, memberId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orgMemberKeys.members(orgId) })
    },
  })
}

export const useRemoveMember = (orgId: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (memberId: string) => removeMemberApi(orgId, memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orgMemberKeys.members(orgId) })
    },
  })
}

/**
 * Leave, then land on the personal account. The server's own "left" event reaches
 * this device too, sometimes before this response does, so the org is marked
 * first: the realtime listener then leaves it to this path, and the person gets
 * one toast rather than two.
 */
export const useLeaveOrganization = (orgId: string, orgName: string) => {
  const queryClient = useQueryClient()
  const router = useRouter()
  const toast = useToast()

  return useMutation({
    mutationFn: async () => {
      markLeaving(orgId)
      await leaveOrganizationApi(orgId)
    },
    onError: () => unmarkLeaving(orgId),
    onSuccess: () => {
      // removeOrganization also switches to the person when this was the actor.
      useAuthStore.getState().removeOrganization(orgId)
      queryClient.clear()
      void refreshOrganizations(queryClient).catch(() => undefined)
      toast.show({
        title: `You left ${orgName}`,
        variant: "success",
        position: "top-center",
      })
      router.push("/home")
      unmarkLeaving(orgId)
    },
  })
}

// ── Answering an invite ───────────────────────────────────────

/**
 * What happens after any accept, by id or by token: the new org is in the switcher
 * straight away, and the toast offers to go there.
 */
export const useJoinedOrganization = () => {
  const queryClient = useQueryClient()
  const router = useRouter()
  const toast = useToast()

  const switchTo = useCallback(
    (organizationId: string) => {
      useAuthStore.getState().switchToOrganization(organizationId)
      queryClient.clear()
      router.push(`/organization/admin/${organizationId}/dashboard`)
    },
    [queryClient, router]
  )

  const announce = useCallback(
    async (organization: OrganizationMini) => {
      useAuthStore.getState().upsertOrganization(organization)
      queryClient.invalidateQueries({ queryKey: orgMemberKeys.all() })
      await refreshOrganizations(queryClient).catch(() => undefined)

      toast.show({
        title: `You joined ${organization.name}`,
        variant: "success",
        position: "top-center",
        duration: 8000,
        action: { label: "Switch", onClick: () => switchTo(organization.id) },
      })
    },
    [queryClient, switchTo, toast]
  )

  return { announce, switchTo }
}

export const useAcceptInvite = () => {
  const { announce } = useJoinedOrganization()

  return useMutation({
    mutationFn: (inviteId: string) => acceptInviteApi(inviteId),
    onSuccess: (organization) => announce(organization),
  })
}

export const useDeclineInvite = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (inviteId: string) => declineInviteApi(inviteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orgMemberKeys.all() })
    },
  })
}
