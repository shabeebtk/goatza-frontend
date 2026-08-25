"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import imageCompression from "browser-image-compression"
import api from "@/core/api/axios"

import {
  createOrganizationApi,
  followOrganizationApi,
  getOrganizationDetailApi,
  unfollowOrganizationApi,
  updateOrgMediaApi,
} from "../services/organization.api"
import {
  CreateOrganizationPayload,
  OrganizationDetail,
  OrganizationMini,
} from "../types"
import { useAuthStore } from "@/store/auth.store"
import {
  describeBlob,
  getUploadConfigApi,
  putToR2,
} from "@/shared/services/mediaUpload"

// ── Query keys ────────────────────────────────────────────────────

export const orgKeys = {
  all:    ()           => ["organizations"]                   as const,
  list:   ()           => ["organizations", "list"]           as const,
  detail: (id: string) => ["organizations", "detail", id]    as const,
}

// ── Compression (shared with OrgPhotoUpload) ──────────────────────

const LOGO_COMPRESSION = {
  maxSizeMB:        1,        // was 0.5 — less aggressive, sharper logo
  maxWidthOrHeight: 1200,     // was 800
  initialQuality:   0.9,
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
  const switchToOrganization = useAuthStore((s) => s.switchToOrganization)

  return useMutation({
    mutationFn: async ({ payload, logoFile }: CreateOrgInput) => {
      // Step 1 — create org (no logo in payload)
      const org = await createOrganizationApi(payload)

      // Step 2 — upload logo if user picked one
      if (logoFile) {
        try {
          const compressed = await imageCompression(logoFile, LOGO_COMPRESSION)

          // Pass org_id so the backend scopes the object key to this org — the
          // actor is still the person, who has only just become its owner.
          const sigRes = await getUploadConfigApi(
            "organization_logo",
            [describeBlob(compressed)],
            org.id
          )
          const entry = sigRes.uploads[0]
          if (!entry) throw new Error("Upload config missing")

          await putToR2(compressed, entry)

          await updateOrgMediaApi(org.id, {
            logo:           entry.public_url,
            logo_public_id: entry.key,
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
      switchToOrganization(org.id)
      qc.invalidateQueries({ queryKey: orgKeys.all() })
      router.push(`/organization/admin/${org.id}/dashboard`)
    },
  })
}

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
