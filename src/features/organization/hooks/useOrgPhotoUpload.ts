import { useMutation, useQueryClient } from "@tanstack/react-query"
import { updateOrgMediaApi } from "../services/organization.api"
import { uploadOrgPhoto, type OrgPhotoType } from "../services/uploadOrgPhoto"
import { orgKeys } from "./useOrganizations"

// ── Types ────────────────────────────────────────────────────

export type { OrgPhotoType }

export type OrgPhotoUploadInput = {
  type:         OrgPhotoType
  croppedBlob:  Blob
  originalName: string
}

// ── Hook ─────────────────────────────────────────────────────

/**
 * The photo editor's side of an existing page: `uploadOrgPhoto` does the
 * work (compress → sign → PUT → attach); this adds the cache updates so the
 * header and the account switcher repaint without a refetch.
 */
export const useOrgPhotoUpload = (orgId: string) => {
  const qc = useQueryClient()

  const upload = useMutation({
    mutationFn: async ({ type, croppedBlob, originalName }: OrgPhotoUploadInput) => {
      const secure_url = await uploadOrgPhoto({
        orgId,
        type,
        blob: croppedBlob,
        originalName,
      })
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
