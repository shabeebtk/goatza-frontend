import {
  describeBlob,
  getUploadConfigApi,
  putToR2,
  withCacheBust,
  type MediaUploadType,
} from "@/shared/services/mediaUpload"
import { compressImage, preferredImageType } from "@/shared/services/imageVariants"
import { checkRawImageSize } from "@/shared/constants/media"
import { updateOrgMediaApi } from "./organization.api"

/**
 * One org photo, end to end: compress → sign → PUT to R2 → attach.
 *
 * A plain async function, not a hook, because two places run it: the photo
 * editor on an existing page (through `useOrgPhotoUpload`, which adds the
 * cache updates) and the create page, which uploads the logo and the cover
 * right after the org exists — while still acting as the PERSON. That is why
 * `orgId` is passed everywhere instead of read from the active actor: the
 * signature request names the org (`org_id`), which is what scopes the key to
 * `organizations/<id>/`, and the attach names it too.
 */

export type OrgPhotoType = "logo" | "cover"

export const ORG_PHOTO_UPLOAD_TYPE: Record<OrgPhotoType, MediaUploadType> = {
  logo:  "organization_logo",
  cover: "organization_cover",
}

// Format chosen per browser at upload time (`preferredImageType`) — an
// iPhone asked for WebP returns a PNG that `maxSizeMB` cannot shrink.
const COMPRESSION_OPTIONS = {
  maxSizeMB:        2,        // higher ceiling → keeps logo/cover crisp
  maxWidthOrHeight: 2000,     // higher resolution cap
  initialQuality:   0.9,      // near-lossless starting quality
  useWebWorker:     true,
}

export type UploadOrgPhotoInput = {
  orgId:        string
  type:         OrgPhotoType
  /** The CROPPED image (OrgPhotoCropSheet's output), not the original file. */
  blob:         Blob
  /** The picked file's name; only its extension is used, for the temp File. */
  originalName: string
  signal?:      AbortSignal
}

/** Resolves with the stored URL (the server's `?v=` one when it sends it). */
export async function uploadOrgPhoto({
  orgId,
  type,
  blob,
  originalName,
  signal,
}: UploadOrgPhotoInput): Promise<string> {
  const uploadType = ORG_PHOTO_UPLOAD_TYPE[type]
  const ext  = originalName.split(".").pop() || "jpg"
  const file = new File([blob], `${type}.${ext}`, {
    type: blob.type || "image/jpeg",
  })

  // The shared 25 MB pick-time ceiling; the server's 5 MB cap is on the
  // compressed file, which compressImage holds it to.
  const tooLarge = checkRawImageSize(file)
  if (tooLarge) throw new Error(tooLarge)

  const fileType   = await preferredImageType()
  const compressed = await compressImage(
    file,
    { ...COMPRESSION_OPTIONS, fileType },
    { flow: "single", surface: uploadType, signal }
  )

  const res = await getUploadConfigApi(
    uploadType,
    [describeBlob(compressed)],
    orgId,
    signal
  )
  const entry = res.uploads[0]
  if (!entry) throw new Error("Couldn't start the upload. Try again.")

  await putToR2(compressed, entry, undefined, signal)

  // logo/cover are fixed keys overwritten in place, so the bare URL never
  // changes — the server stamps its own ?v= on what it stores. `entry.key`
  // is the bare key the *_public_id column wants.
  const saved = await updateOrgMediaApi(
    orgId,
    type === "logo"
      ? { logo: entry.public_url, logo_public_id: entry.key }
      : { cover_image: entry.public_url, cover_image_public_id: entry.key },
    signal
  )

  // An older server answers without the stored URL; stamp our own so the
  // switcher's logo repaints at once.
  return saved ?? withCacheBust(entry.public_url)
}
