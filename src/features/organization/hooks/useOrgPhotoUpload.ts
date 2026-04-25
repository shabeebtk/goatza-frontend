import { useMutation, useQueryClient } from "@tanstack/react-query"
import imageCompression from "browser-image-compression"

import api from "@/core/api/axios"
import { getUploadSignatureApi, uploadToCloudinaryApi, UploadType } from "@/features/profile/services/upload.api"
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
  maxSizeMB:        1,
  maxWidthOrHeight: 1600,
  useWebWorker:     true,
  fileType:         "image/webp" as const,
}

// ── Org media update API ──────────────────────────────────────

type OrgMediaPayload =
  | { logo: string; logo_public_id: string }
  | { cover_image: string; cover_image_public_id: string }
  | { is_delete_logo: true }
  | { is_delete_cover: true }

const updateOrgMediaApi = async (
  orgId: string,
  payload: OrgMediaPayload
): Promise<void> => {
  await api.post(`/organizations/update/logo/cover`, { org_id: orgId, ...payload })
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

      const compressed           = await imageCompression(file, COMPRESSION_OPTIONS)
      const sig                  = await getUploadSignatureApi(UPLOAD_TYPE_MAP[type])
      const { secure_url, public_id } = await uploadToCloudinaryApi(compressed, sig.uploads[0])

      const payload: OrgMediaPayload =
        type === "logo"
          ? { logo: secure_url, logo_public_id: public_id }
          : { cover_image: secure_url, cover_image_public_id: public_id }

      await updateOrgMediaApi(orgId, payload)
      return { type, secure_url }
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