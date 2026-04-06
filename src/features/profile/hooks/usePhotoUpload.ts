import { useMutation, useQueryClient } from "@tanstack/react-query"
import imageCompression from "browser-image-compression"
import {
  getUploadSignatureApi,
  uploadToCloudinaryApi,
  updateMediaApi,
  type UploadType,
} from "../services/upload.api"
import { profileKeys } from "@/features/profile/hooks/useProfileQueries"
import type { UserProfile } from "@/features/profile/services/profile.api"

// ── Types ────────────────────────────────────────────────────

export type PhotoUploadInput = {
  type: UploadType
  /** Cropped blob produced by react-easy-crop's getCroppedCanvas() */
  croppedBlob: Blob
  /** Original filename for the extension */
  originalName: string
}

// ── Compression options ──────────────────────────────────────

const COMPRESSION_OPTIONS = {
  maxSizeMB: 1,             // compress to under 1 MB
  maxWidthOrHeight: 1600,   // cap resolution
  useWebWorker: true,
  fileType: "image/webp",   // modern format
}

// ── Hook ─────────────────────────────────────────────────────

export const usePhotoUpload = (username: string) => {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ type, croppedBlob, originalName }: PhotoUploadInput) => {
      // 1. Convert blob → File
      const ext = originalName.split(".").pop() ?? "jpg"
      const file = new File([croppedBlob], `${type}.${ext}`, {
        type: croppedBlob.type || "image/jpeg",
      })

      // 2. Validate size (5 MB hard cap before compression)
      if (file.size > 5 * 1024 * 1024) {
        throw new Error("File must be under 5 MB")
      }

      // 3. Compress
      const compressed = await imageCompression(file, COMPRESSION_OPTIONS)

      // 4. Get signed upload config
      const res = await getUploadSignatureApi(type)
      const sig = res.uploads[0] 

      // 5. Upload to Cloudinary
      const { secure_url, public_id } = await uploadToCloudinaryApi(compressed, sig)

      // 6. Save to backend
      const payload =
        type === "profile"
          ? { profile_photo: secure_url, profile_photo_public_id: public_id }
          : { cover_photo: secure_url, cover_photo_public_id: public_id }

      await updateMediaApi(payload)

      return { type, secure_url }
    },

    // Optimistic cache update so the avatar/cover refreshes immediately
    onSuccess: ({ type, secure_url }) => {
      qc.setQueryData<UserProfile>(profileKeys.user(username), (old) => {
        if (!old) return old
        return type === "profile"
          ? { ...old, profile_photo: secure_url }
          : { ...old, cover_photo: secure_url }
      })
      qc.setQueryData<UserProfile>(profileKeys.me(), (old) => {
        if (!old) return old
        return type === "profile"
          ? { ...old, profile_photo: secure_url }
          : { ...old, cover_photo: secure_url }
      })
    },
  })
}