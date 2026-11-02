/**
 * The match diary's one photo: validate, compress, upload.
 *
 * Same three steps as every other image in the app — compress client-side,
 * ask the backend for a presigned PUT, go straight to storage — so a phone on a
 * bus never pushes 8MB through the API. The signature type is `matches`, which
 * the backend scopes to `users/<id>/matches` and refuses to an organization
 * actor (`GetUploadConfigAPIView.ALLOWED_TYPES`).
 *
 * Nothing here persists anything. The pair comes back to the sheet, which puts
 * it in the form and sends it with everything else — so the photo is one field
 * of a match, not a separate save the player has to think about.
 *
 * The consequence, which posts and achievements already accept: uploading and
 * then abandoning the sheet leaves an orphan in storage. Holding the blob
 * until submit would avoid that, at the cost of making the player wait for the
 * upload after they press Save — which is the one moment they are least willing
 * to wait.
 */

import {
    describeBlob,
    getUploadConfigApi,
    putToR2,
} from "@/shared/services/mediaUpload"
import { compressImage, preferredImageType } from "@/shared/services/imageVariants"
import { MAX_RAW_IMAGE_MB, isImageFile } from "@/shared/constants/media"

export type UploadedMatchPhoto = {
    photo_url: string
    photo_public_id: string
}

/**
 * The gate before compression, not a storage limit — the shared 25 MB
 * pick-time ceiling every photo flow uses.
 *
 * A photo arrives here straight from a phone camera, and a 2026 handset
 * writes 8–12MB stills (a 48 MP shot more); refusing them would read as the
 * feature being broken. Compression takes whatever passes down to about 1MB,
 * so the ceiling only decides what the browser is asked to decode.
 */
export const MAX_MATCH_PHOTO_MB = MAX_RAW_IMAGE_MB

// Format chosen per browser at upload time (`preferredImageType`) — an
// iPhone asked for WebP returns a PNG that `maxSizeMB` cannot shrink.
const COMPRESSION_OPTIONS = {
    // A match photo shows as a 44px thumbnail in the diary row and full-width
    // at most on a detail screen. 1600px at 0.85 is more than either needs and
    // a fraction of the upload time on a phone signal.
    maxSizeMB: 1,
    maxWidthOrHeight: 1600,
    initialQuality: 0.85,
    useWebWorker: true,
}

/** Returns a message when the file cannot be used, or null when it can. */
export const validateMatchPhoto = (file: File): string | null => {
    // By type, or by extension when the browser gave none (a .heic on Windows).
    if (!isImageFile(file)) {
        return "Pick an image — a photo of the match, the scoreboard, the team."
    }

    if (file.size > MAX_MATCH_PHOTO_MB * 1024 * 1024) {
        return `That photo is over ${MAX_MATCH_PHOTO_MB} MB. Try a smaller one.`
    }

    return null
}

/**
 * Compress, sign, upload. Resolves to the pair the match entry stores.
 *
 * The two columns are meaningless apart — `MatchService._clean_photo` rejects
 * one without the other — so this returns both or throws.
 */
export const uploadMatchPhoto = async (
    file: File
): Promise<UploadedMatchPhoto> => {
    const fileType = await preferredImageType()
    const compressed = await compressImage(
        file,
        { ...COMPRESSION_OPTIONS, fileType },
        { flow: "single", surface: "matches" }
    )

    const res = await getUploadConfigApi("matches", [describeBlob(compressed)])
    const entry = res.uploads[0]

    if (!entry) throw new Error("Couldn't start the upload. Try again.")

    await putToR2(compressed, entry)

    return {
        photo_url: entry.public_url,
        photo_public_id: entry.key,
    }
}
