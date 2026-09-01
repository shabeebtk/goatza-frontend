/**
 * A problem-report screenshot: validate, compress, upload.
 *
 * The same three steps as every other image in the app — compress client-side,
 * ask the backend for a presigned PUT, go straight to storage — reusing the
 * shared pipeline rather than a second one. The signature type is `support`,
 * which the backend scopes to `users/<id>/support` or
 * `organizations/<id>/support` and caps at three images of 5MB.
 *
 * Nothing here persists anything. The pair comes back to the sheet, which
 * sends it with the rest of the report. The consequence, which posts, matches
 * and achievements already accept: attaching a screenshot and then abandoning
 * the sheet leaves an orphan in storage. Holding the blob until Send would
 * avoid that, at the cost of making somebody who is already annoyed wait for
 * three uploads after they press the button.
 */

import imageCompression from "browser-image-compression"

import {
    describeBlob,
    getUploadConfigApi,
    putToR2,
    type UploadProgress,
} from "@/shared/services/mediaUpload"

import type { ProblemScreenshot } from "./support.api"

/** Mirrors the backend's POLICY entry for `support`. */
export const MAX_SCREENSHOTS = 3

/**
 * The gate before compression, not a storage limit.
 *
 * A screenshot is a screenshot — a phone writes them at well under this — so
 * anything larger is a photo of a screen, or the wrong file. Compression takes
 * whatever passes down to about 1MB regardless.
 */
export const MAX_SCREENSHOT_MB = 10

const COMPRESSION_OPTIONS = {
    // A screenshot is READ, unlike a match photo or an avatar: the point is
    // that somebody can see which button was greyed out. 1920px keeps small
    // text legible where 1600 starts to smear it, and WebP at 0.9 keeps flat
    // UI colour from banding.
    maxSizeMB: 1,
    maxWidthOrHeight: 1920,
    initialQuality: 0.9,
    useWebWorker: true,
    fileType: "image/webp",
}

/** Returns a message when the file cannot be used, or null when it can. */
export const validateScreenshot = (file: File): string | null => {
    if (!file.type.startsWith("image/")) {
        return "Pick an image — a screenshot of what went wrong."
    }

    if (file.size > MAX_SCREENSHOT_MB * 1024 * 1024) {
        return `That image is over ${MAX_SCREENSHOT_MB} MB. Try a smaller one.`
    }

    return null
}

/**
 * Compress, sign, upload ONE screenshot. Resolves to the `{url, key}` pair the
 * report stores.
 *
 * One file per call, deliberately, even though the config endpoint signs a
 * batch: the sheet uploads on selection so that pressing Send never sits on
 * three transfers, and a per-file call is what lets each thumbnail carry its
 * own progress and its own failure.
 */
export const uploadScreenshot = async (
    file: File,
    onProgress?: UploadProgress,
    signal?: AbortSignal
): Promise<ProblemScreenshot> => {
    const compressed = await imageCompression(file, COMPRESSION_OPTIONS)

    const res = await getUploadConfigApi("support", [describeBlob(compressed)])
    const entry = res.uploads[0]

    if (!entry) throw new Error("Couldn't start the upload. Try again.")

    await putToR2(compressed, entry, onProgress, signal)

    return {
        url: entry.public_url,
        key: entry.key,
    }
}
