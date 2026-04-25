"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import api from "@/core/api/axios"

import {
  createOrganizationApi,
  getOrganizationDetailApi,
} from "../services/organization.api"
import {
  CreateOrganizationPayload,
  OrganizationDetail,
  OrganizationMini,
} from "../types"

// ── Query keys ────────────────────────────────────────────────────

export const orgKeys = {
  all:    ()        => ["organizations"]                    as const,
  list:   ()        => ["organizations", "list"]            as const,
  detail: (id: string) => ["organizations", "detail", id]  as const,
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

export const useOrgDetail = (orgId: string) => {
  return useQuery({
    queryKey: orgKeys.detail(orgId),
    queryFn:  () => getOrganizationDetailApi(orgId),
    staleTime: 1000 * 60 * 3,
    enabled:  !!orgId,
  })
}

// ── Create ────────────────────────────────────────────────────────

export const useCreateOrganization = () => {
  const qc     = useQueryClient()
  const router = useRouter()

  return useMutation({
    mutationFn: (payload: CreateOrganizationPayload) =>
      createOrganizationApi(payload),

    onSuccess: (org) => {
      qc.invalidateQueries({ queryKey: orgKeys.all() })
      router.push(`/organization/admin/${org.id}/home`)
    },
  })
}





























// ── Follow ───────────────cahnge this to users ─────────────────────────────────────────


export const followOrganizationApi = async (orgId: string): Promise<void> => {
  await api.post(`/organizations/${orgId}/follow`)
}
 
export const unfollowOrganizationApi = async (orgId: string): Promise<void> => {
  await api.delete(`/organizations/${orgId}/follow`)
}
 
 
export const useFollowOrg = (orgId: string) => {
  const qc = useQueryClient()
 
  const follow = useMutation({
    mutationFn: () => followOrganizationApi(orgId),
 
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: orgKeys.detail(orgId) })
      const prev = qc.getQueryData<OrganizationDetail>(orgKeys.detail(orgId))
 
      qc.setQueryData<OrganizationDetail>(orgKeys.detail(orgId), (old) =>
        old ? { ...old, followers_count: old.followers_count + 1 } : old
      )
 
      return { prev }
    },
 
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData(orgKeys.detail(orgId), ctx.prev)
      }
    },
 
    onSettled: () => {
      qc.invalidateQueries({ queryKey: orgKeys.detail(orgId) })
    },
  })
 
  const unfollow = useMutation({
    mutationFn: () => unfollowOrganizationApi(orgId),
 
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: orgKeys.detail(orgId) })
      const prev = qc.getQueryData<OrganizationDetail>(orgKeys.detail(orgId))
 
      qc.setQueryData<OrganizationDetail>(orgKeys.detail(orgId), (old) =>
        old
          ? { ...old, followers_count: Math.max(0, old.followers_count - 1) }
          : old
      )
 
      return { prev }
    },
 
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData(orgKeys.detail(orgId), ctx.prev)
      }
    },
 
    onSettled: () => {
      qc.invalidateQueries({ queryKey: orgKeys.detail(orgId) })
    },
  })
 
  return { follow, unfollow }
}