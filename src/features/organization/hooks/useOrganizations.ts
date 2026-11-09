"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import api from "@/core/api/axios"

import {
  followOrganizationApi,
  getCreateEligibilityApi,
  getOrganizationDetailApi,
  unfollowOrganizationApi,
} from "../services/organization.api"
import {
  OrganizationDetail,
  OrganizationMini,
} from "../types"
import { useAuthStore } from "@/store/auth.store"

// ── Query keys ────────────────────────────────────────────────────

export const orgKeys = {
  all:    ()           => ["organizations"]                   as const,
  list:   ()           => ["organizations", "list"]           as const,
  detail: (id: string) => ["organizations", "detail", id]    as const,
}

// ── List ──────────────────────────────────────────────────────────

const fetchOrganizations = async (): Promise<OrganizationMini[]> => {
  const res = await api.get("/organizations/list")
  return res.data.data
}

export const useOrganizations = () => {
  return useQuery({
    queryKey: orgKeys.list(),
    queryFn:  fetchOrganizations,
    staleTime: 1000 * 60 * 5,
  })
}

// ── Detail ────────────────────────────────────────────────────────

/**
 * `enabled` is opt-out: the public org profile already has the payload from its
 * server render and must not fire this — /organizations/details is
 * IsAuthenticated.
 */
export const useOrgDetail = (
  identifier: string,
  by: "id" | "username" = "id",
  enabled = true
) => {
  return useQuery({
    queryKey: orgKeys.detail(identifier),
    queryFn: () => getOrganizationDetailApi(identifier, by),
    staleTime: 1000 * 60 * 3,
    enabled: !!identifier && enabled,
  })
}

// ── Create ───────────────────────────────────────────────────────
//
// The create itself is useCreateOrganization (its own file: create → logo →
// cover → land). This is the question asked before the form is shown.

/** Not under orgKeys.all(): invalidating the org caches must not refetch it. */
export const createEligibilityKey = ["organization-create", "eligibility"] as const

/**
 * May this person make another page? Never served from cache (gcTime 0): an
 * answer from before their last create would show the form to someone who is
 * already at the limit.
 */
export const useCreateEligibility = (enabled = true) =>
  useQuery({
    queryKey: createEligibilityKey,
    queryFn:  getCreateEligibilityApi,
    staleTime: 0,
    gcTime:    0,
    // Asked once, on arrival. A refetch on focus or reconnect could answer
    // "at the limit" while this person's own create is landing.
    refetchOnWindowFocus: false,
    refetchOnReconnect:   false,
    enabled,
  })

// ── Follow ────────────────────────────────────────────────────────

export const useFollowOrg = (orgId: string, username?: string) => {
  const qc = useQueryClient()
  const keys = [orgKeys.detail(orgId), ...(username ? [orgKeys.detail(username)] : [])]

  const mutateOrgCache = (
    updater: (old: OrganizationDetail) => OrganizationDetail
  ) => {
    keys.forEach((key) => {
      qc.setQueryData<OrganizationDetail>(key, (old) =>
        old ? updater(old) : old
      )
    })
  }

  const follow = useMutation({
    mutationFn: () => followOrganizationApi({
      target_type: "organization",
      target_id: orgId,
    }),

    onMutate: async () => {
      await Promise.all(keys.map((key) => qc.cancelQueries({ queryKey: key })))

      const prevEntries = keys.map((key) => ({
        key,
        data: qc.getQueryData<OrganizationDetail>(key),
      }))

      mutateOrgCache((old) => ({
        ...old,
        followers_count: old.followers_count + 1,
        relationship: old.relationship
          ? { ...old.relationship, is_following: true }
          : {
              is_me: false,
              is_following: true,
              is_followed_by: false,
              is_connected: false,
              // You cannot follow an account you are blocked with, so an
              // optimistic follow always implies both are false.
              is_blocked: false,
              is_blocked_by_me: false,
            },
      }))

      const prev = prevEntries.flatMap((entry) =>
        entry.data ? [{ key: entry.key, data: entry.data }] : []
      )

      return { prev }
    },

    onError: (_err, _vars, ctx) => {
      ctx?.prev?.forEach(({ key, data }) => {
        qc.setQueryData<OrganizationDetail>(key, data)
      })
    },

    onSettled: () => {
      keys.forEach((key) => {
        qc.invalidateQueries({ queryKey: key })
      })
    },
  })

  const unfollow = useMutation({
    mutationFn: () => unfollowOrganizationApi({
      target_type: "organization",
      target_id: orgId,
    }),

    onMutate: async () => {
      await Promise.all(keys.map((key) => qc.cancelQueries({ queryKey: key })))

      const prevEntries = keys.map((key) => ({
        key,
        data: qc.getQueryData<OrganizationDetail>(key),
      }))

      mutateOrgCache((old) => ({
        ...old,
        followers_count: Math.max(0, old.followers_count - 1),
        relationship: old.relationship
          ? { ...old.relationship, is_following: false }
          : {
              is_me: false,
              is_following: false,
              is_followed_by: false,
              is_connected: false,
              // You cannot follow an account you are blocked with, so an
              // optimistic follow always implies both are false.
              is_blocked: false,
              is_blocked_by_me: false,
            },
      }))

      const prev = prevEntries.flatMap((entry) =>
        entry.data ? [{ key: entry.key, data: entry.data }] : []
      )

      return { prev }
    },

    onError: (_err, _vars, ctx) => {
      ctx?.prev?.forEach(({ key, data }) => {
        qc.setQueryData<OrganizationDetail>(key, data)
      })
    },

    onSettled: () => {
      keys.forEach((key) => {
        qc.invalidateQueries({ queryKey: key })
      })
    },
  })

  return { follow, unfollow }
}

// ── Update Organization ─────────────────────────────────────────

import { updateOrganizationApi, upsertOrgLocationApi, deleteOrgLocationApi } from "../services/organization.api"
import { OrgLocationPayload } from "../types"

export const useUpdateOrganization = (orgId: string) => {
  const qc = useQueryClient()
  const upsertOrganization = useAuthStore((s) => s.upsertOrganization)

  return useMutation({
    mutationFn: (payload: Partial<OrganizationDetail>) => updateOrganizationApi(payload),
    onSuccess: (updatedOrganization) => {
      upsertOrganization({
        id: updatedOrganization.id,
        name: updatedOrganization.name,
        username: updatedOrganization.username,
        type: updatedOrganization.type,
        logo: updatedOrganization.logo,
        headline: updatedOrganization.headline,
        is_verified: updatedOrganization.is_verified,
        my_role: updatedOrganization.my_role,
        my_permissions: updatedOrganization.my_permissions,
      })

      qc.invalidateQueries({ queryKey: orgKeys.detail(orgId) })
      qc.invalidateQueries({ queryKey: orgKeys.list() })
    },
  })
}

export const useUpsertOrgLocation = (orgId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: OrgLocationPayload) => upsertOrgLocationApi(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: orgKeys.detail(orgId) })
    },
  })
}

export const useDeleteOrgLocation = (orgId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (locationId: string) => deleteOrgLocationApi(locationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: orgKeys.detail(orgId) })
    },
  })
}
