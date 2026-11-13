import { checkRawImageSize } from "@/shared/constants/media"
import { compressImage, preferredImageType } from "@/shared/services/imageVariants"
import { describeBlob, getUploadConfigApi, putToR2 } from "@/shared/services/mediaUpload"
import type { SquadDetail } from "../types"
import { setSquadPhotoApi } from "./squads.api"

/** The upload type the server signs a squad photo as (org only, one image). */
export const SQUAD_PHOTO_UPLOAD_TYPE = "squads" as const

/** The crop: the band the list card and the squad page show. */
export const SQUAD_PHOTO_ASPECT = 16 / 9

// The same options as uploadOrgPhoto, and the format is chosen per browser at
// upload time (preferredImageType): an iPhone asked for WebP returns a PNG that
// maxSizeMB cannot shrink.
const COMPRESSION_OPTIONS = {
  maxSizeMB: 2,
  maxWidthOrHeight: 2000,
  initialQuality: 0.9,
  useWebWorker: true,
}

export type UploadSquadPhotoInput = {
  orgId: string
  squadId: string
  /** The CROPPED image (OrgPhotoCropSheet's output), not the original file. */
  blob: Blob
  /** The picked file's name; only its extension is used. */
  originalName: string
  signal?: AbortSignal
}

/**
 * One squad photo, end to end: compress → sign as "squads" with the org's id
 * (which scopes the key to organizations/<id>/squads) → PUT to R2 → attach.
 * Resolves with the squad as the server now has it.
 */
export async function uploadSquadPhoto({
  orgId,
  squadId,
  blob,
  originalName,
  signal,
}: UploadSquadPhotoInput): Promise<SquadDetail> {
  const ext = originalName.split(".").pop() || "jpg"
  const file = new File([blob], `squad.${ext}`, { type: blob.type || "image/jpeg" })

  // The shared 25 MB pick-time ceiling; the server's 5 MB cap is on the
  // compressed file, which compressImage holds it to.
  const tooLarge = checkRawImageSize(file)
  if (tooLarge) throw new Error(tooLarge)

  const fileType = await preferredImageType()
  const compressed = await compressImage(
    file,
    { ...COMPRESSION_OPTIONS, fileType },
    { flow: "single", surface: SQUAD_PHOTO_UPLOAD_TYPE, signal }
  )

  const res = await getUploadConfigApi(
    SQUAD_PHOTO_UPLOAD_TYPE,
    [describeBlob(compressed)],
    orgId,
    signal
  )
  const entry = res.uploads[0]
  if (!entry) throw new Error("Couldn't start the upload. Try again.")

  await putToR2(compressed, entry, undefined, signal)

  // `entry.key` is the bare key the photo_public_id column wants.
  return setSquadPhotoApi(orgId, squadId, {
    photo_url: entry.public_url,
    photo_public_id: entry.key,
  })
}
