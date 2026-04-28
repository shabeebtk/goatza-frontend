"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import imageCompression from "browser-image-compression"
import api from "@/core/api/axios"

import {
  createOrganizationApi,
  getOrganizationDetailApi,
  updateOrgMediaApi,
} from "../services/organization.api"
import {
  CreateOrganizationPayload,
  OrganizationDetail,
  OrganizationMini,
} from "../types"
import {
  getUploadSignatureApi,
  uploadToCloudinaryApi,
} from "@/features/profile/services/upload.api"

// ── Query keys ────────────────────────────────────────────────────

export const orgKeys = {
  all:    ()           => ["organizations"]                   as const,
  list:   ()           => ["organizations", "list"]           as const,
  detail: (id: string) => ["organizations", "detail", id]    as const,
}

// ── Compression (shared with OrgPhotoUpload) ──────────────────────

const LOGO_COMPRESSION = {
  maxSizeMB:        0.5,
  maxWidthOrHeight: 800,
  useWebWorker:     true,
  fileType:         "image/webp" as const,
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

// ── Create + optional logo upload ────────────────────────────────
//
// Flow:
//   1. POST /organizations/create  → get org.id
//   2. If logoFile provided:
//        a. compress
//        b. GET signature (with org_id so backend scopes the folder)
//        c. upload to Cloudinary
//        d. PATCH /organizations/update/logo/cover?org_id=…
//   3. Invalidate queries → redirect

export type CreateOrgInput = {
  payload:   CreateOrganizationPayload
  logoFile?: File | null     // raw File from the local preview, no Cloudinary yet
}

export const useCreateOrganization = () => {
  const qc     = useQueryClient()
  const router = useRouter()

  return useMutation({
    mutationFn: async ({ payload, logoFile }: CreateOrgInput) => {
      // Step 1 — create org (no logo in payload)
      const org = await createOrganizationApi(payload)

      // Step 2 — upload logo if user picked one
      if (logoFile) {
        try {
          const compressed = await imageCompression(logoFile, LOGO_COMPRESSION)

          // Pass org_id so the backend can scope the Cloudinary folder/public_id
          const sigRes = await getUploadSignatureApi("organization_logo", 1, org.id)
          const sig    = sigRes.uploads[0]

          const { secure_url, public_id } = await uploadToCloudinaryApi(compressed, sig)

          await updateOrgMediaApi(org.id, {
            logo:           secure_url,
            logo_public_id: public_id,
          })
        } catch {
          // Logo upload is non-fatal — org is already created.
          // User can re-upload from profile settings.
          console.warn("Logo upload failed after org creation — skipping")
        }
      }

      return org
    },

    onSuccess: (org) => {
      qc.invalidateQueries({ queryKey: orgKeys.all() })
      router.push(`/organization/admin/${org.id}/home`)
    },
  })
}

// ── Follow ────────────────────────────────────────────────────────

const followOrganizationApi = async (orgId: string): Promise<void> => {
  await api.post(`/organizations/${orgId}/follow`)
}

const unfollowOrganizationApi = async (orgId: string): Promise<void> => {
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
      if (ctx?.prev) qc.setQueryData(orgKeys.detail(orgId), ctx.prev)
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
        old ? { ...old, followers_count: Math.max(0, old.followers_count - 1) } : old
      )
      return { prev }
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(orgKeys.detail(orgId), ctx.prev)
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: orgKeys.detail(orgId) })
    },
  })

  return { follow, unfollow }
}

// ── Update Organization ─────────────────────────────────────────

import { updateOrganizationApi, upsertOrgLocationApi, deleteOrgLocationApi } from "../services/organization.api"
import { OrgLocationPayload } from "../types"

export const useUpdateOrganization = (orgId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => updateOrganizationApi(payload as any),
    onSuccess: () => {
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