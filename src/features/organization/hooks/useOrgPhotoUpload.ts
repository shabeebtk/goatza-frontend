import { useMutation, useQueryClient } from "@tanstack/react-query"
import imageCompression from "browser-image-compression"

import api from "@/core/api/axios"
import type { UploadType } from "@/features/profile/services/upload.api"
import {
  describeBlob,
  getUploadConfigApi,
  putToR2,
  withCacheBust,
} from "@/shared/services/mediaUpload"
import { orgKeys } from "./useOrganizations"

// ── Types ────────────────────────────────────────────────────

export type OrgPhotoType = "logo" | "cover"

export type OrgPhotoUploadInput = {
  type:         OrgPhotoType
  croppedBlob:  Blob
  originalName: string
}

const UPLOAD_TYPE_MAP: Record<OrgPhotoType, UploadType> = {
  logo:  "organization_logo",
  cover: "organization_cover",
}

const COMPRESSION_OPTIONS = {
  maxSizeMB:        2,        // higher ceiling → keeps logo/cover crisp
  maxWidthOrHeight: 2000,     // higher resolution cap
  initialQuality:   0.9,      // near-lossless starting quality
  useWebWorker:     true,
  fileType:         "image/webp" as const,
}

// ── Org media update API ──────────────────────────────────────

type OrgMediaPayload =
  | { logo: string; logo_public_id: string }
  | { cover_image: string; cover_image_public_id: string }
  | { is_delete_logo: true }
  | { is_delete_cover: true }

/**
 * Returns the stored URL when the endpoint reports one (it may come back with a
 * ?v= cache-buster, which must be surfaced as-is), otherwise undefined.
 */
const updateOrgMediaApi = async (
  orgId: string,
  payload: OrgMediaPayload
): Promise<string | undefined> => {
  const res = await api.post(`/organizations/update/logo/cover`, { org_id: orgId, ...payload })
  const data = res.data?.data
  if (!data || typeof data !== "object") return undefined
  const url = "logo" in payload ? data.logo : data.cover_image
  return typeof url === "string" && url ? url : undefined
}

// ── Hook ─────────────────────────────────────────────────────

export const useOrgPhotoUpload = (orgId: string) => {
  const qc = useQueryClient()

  const upload = useMutation({
    mutationFn: async ({ type, croppedBlob, originalName }: OrgPhotoUploadInput) => {
      const ext      = originalName.split(".").pop() ?? "jpg"
      const file     = new File([croppedBlob], `${type}.${ext}`, {
        type: croppedBlob.type || "image/jpeg",
      })

      if (file.size > 5 * 1024 * 1024) throw new Error("File must be under 5 MB")

      const compressed = await imageCompression(file, COMPRESSION_OPTIONS)

      // org_id is passed explicitly: a user acting personally can still upload
      // for an org they belong to, and it is what scopes the key to that org.
      const res = await getUploadConfigApi(
        UPLOAD_TYPE_MAP[type],
        [describeBlob(compressed)],
        orgId
      )
      const entry = res.uploads[0]
      if (!entry) throw new Error("Couldn't start the upload. Try again.")

      await putToR2(compressed, entry)

      // logo/cover are fixed keys overwritten in place, so the stored URL never
      // changes — the server stamps its own ?v= on it. `entry.key` is the bare
      // key the *_public_id column wants.
      const secure_url = entry.public_url
      const public_id = entry.key

      const payload: OrgMediaPayload =
        type === "logo"
          ? { logo: secure_url, logo_public_id: public_id }
          : { cover_image: secure_url, cover_image_public_id: public_id }

      const saved = await updateOrgMediaApi(orgId, payload)

      // Surface the server's cache-busted URL when it sends one back; it does
      // not today, so stamp our own so the switcher logo repaints immediately.
      return { type, secure_url: saved ?? withCacheBust(secure_url) }
    },

    onSuccess: ({ type, secure_url }) => {
      // Update org detail cache
      qc.setQueriesData(
        { queryKey: orgKeys.detail(orgId) },
        (old: unknown) => {
          if (!old || typeof old !== "object") return old
          return type === "logo"
            ? { ...(old as object), logo: secure_url }
            : { ...(old as object), cover_image: secure_url }
        }
      )
      // Also invalidate the list so org switcher logo refreshes
      qc.invalidateQueries({ queryKey: orgKeys.list() })
    },
  })

  const deleteLogo = useMutation({
    mutationFn: () => updateOrgMediaApi(orgId, { is_delete_logo: true }),
    onSuccess: () => {
      qc.setQueriesData({ queryKey: orgKeys.detail(orgId) }, (old: unknown) => {
        if (!old || typeof old !== "object") return old
        return { ...(old as object), logo: null }
      })
      qc.invalidateQueries({ queryKey: orgKeys.list() })
    },
  })

  const deleteCover = useMutation({
    mutationFn: () => updateOrgMediaApi(orgId, { is_delete_cover: true }),
    onSuccess: () => {
      qc.setQueriesData({ queryKey: orgKeys.detail(orgId) }, (old: unknown) => {
        if (!old || typeof old !== "object") return old
        return { ...(old as object), cover_image: null }
      })
    },
  })

  return { upload, deleteLogo, deleteCover }
}