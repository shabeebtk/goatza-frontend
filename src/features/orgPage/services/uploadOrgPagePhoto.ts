import { checkRawImageSize } from "@/shared/constants/media"
import { compressImage, preferredImageType } from "@/shared/services/imageVariants"
import { describeBlob, getUploadConfigApi, putToR2 } from "@/shared/services/mediaUpload"

/**
 * The upload type the server signs the page's photos as: facility photos and a
 * coach who isn't on Goatza. Org only, one image ≤ 5 MB, keys under
 * organizations/<org_id>/page/.
 */
export const ORG_PAGE_UPLOAD_TYPE = "org_page" as const

/** Facility photos are cropped 4:3; a coach's photo is square. */
export const FACILITY_PHOTO_ASPECT = 4 / 3
export const COACH_PHOTO_ASPECT = 1

// The same options as uploadSquadPhoto (and uploadOrgPhoto). The format is chosen
// per browser at upload time: an iPhone asked for WebP returns a PNG that
// maxSizeMB cannot shrink.
const COMPRESSION_OPTIONS = {
  maxSizeMB: 2,
  maxWidthOrHeight: 2000,
  initialQuality: 0.9,
  useWebWorker: true,
}

export type UploadOrgPagePhotoInput = {
  orgId: string
  /** The CROPPED image (OrgPhotoCropSheet's output), not the original file. */
  blob: Blob
  /** The picked file's name; only its extension is used. */
  originalName: string
  signal?: AbortSignal
}

/** What the attach calls take. */
export type OrgPagePhoto = { photo_url: string; photo_public_id: string }

/**
 * One page photo up to R2: compress → sign as "org_page" with the org's id, AS the
 * org (the type is org-only, and the screen may outlive an account switch) → PUT.
 * Unlike uploadSquadPhoto it attaches nothing: it resolves with the pair the
 * caller sends (POST photos, or a coach's photo_url / photo_public_id).
 */
export async function uploadOrgPagePhoto({
  orgId,
  blob,
  originalName,
  signal,
}: UploadOrgPagePhotoInput): Promise<OrgPagePhoto> {
  const ext = originalName.split(".").pop() || "jpg"
  const file = new File([blob], `page.${ext}`, { type: blob.type || "image/jpeg" })

  // The shared 25 MB pick-time ceiling; the server's 5 MB cap is on the
  // compressed file, which compressImage holds it to.
  const tooLarge = checkRawImageSize(file)
  if (tooLarge) throw new Error(tooLarge)

  const fileType = await preferredImageType()
  const compressed = await compressImage(
    file,
    { ...COMPRESSION_OPTIONS, fileType },
    { flow: "single", surface: ORG_PAGE_UPLOAD_TYPE, signal }
  )

  const res = await getUploadConfigApi(
    ORG_PAGE_UPLOAD_TYPE,
    [describeBlob(compressed)],
    orgId,
    signal,
    undefined,
    { type: "organization", id: orgId }
  )
  const entry = res.uploads[0]
  if (!entry) throw new Error("Couldn't start the upload. Try again.")

  await putToR2(compressed, entry, undefined, signal)

  // `entry.key` is the bare key the photo_public_id column wants.
  return { photo_url: entry.public_url, photo_public_id: entry.key }
}
