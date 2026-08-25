import { useMutation, useQueryClient } from "@tanstack/react-query"
import imageCompression from "browser-image-compression"
import { updateMediaApi, type UploadType } from "../services/upload.api"
import {
  describeBlob,
  getUploadConfigApi,
  putToR2,
  withCacheBust,
} from "@/shared/services/mediaUpload"
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
  maxSizeMB: 2,             // higher ceiling → keeps profile/cover crisp
  maxWidthOrHeight: 2000,   // higher resolution cap for fullscreen viewing
  initialQuality: 0.9,      // near-lossless starting quality
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

      // 4. Get a presigned PUT for exactly this blob
      const res = await getUploadConfigApi(type, [describeBlob(compressed)])
      const entry = res.uploads[0]
      if (!entry) throw new Error("Couldn't start the upload. Try again.")

      // 5. PUT the bytes straight to storage
      await putToR2(compressed, entry)

      // 6. Save to backend.
      //
      // profile/cover live at ONE fixed key per user and overwrite in place, so
      // the server stamps a ?v= cache-buster on the URL it stores. The
      // public_id column keeps the bare key, which is what `entry.key` is.
      const secure_url = entry.public_url
      const public_id = entry.key

      const payload =
        type === "profile"
          ? { profile_photo: secure_url, profile_photo_public_id: public_id }
          : { cover_photo: secure_url, cover_photo_public_id: public_id }

      await updateMediaApi(payload)

      // The cache write below needs a URL the browser has not already painted.
      // The endpoint returns no body, so stamp one here; the next profile
      // refetch replaces it with the server's own ?v=, same object.
      return { type, secure_url: withCacheBust(secure_url) }
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