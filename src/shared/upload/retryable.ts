/**
 * Can trying the same thing again help? The upload bar offers Retry only
 * when it can: a dropped connection, a server that was briefly down, a worker
 * that timed out. A file that is too long, unreadable or the wrong kind fails
 * identically every time — those offer Discard (and, for a post, Edit).
 */

import { isAxiosError } from "axios"

import { isHighlightCapError } from "@/features/highlights/services/highlights.api"
import { isImagePrepareError } from "@/shared/services/imageVariants"
import { UploadError } from "@/shared/services/mediaUpload"
import { isMediaJobError } from "@/shared/services/sourceUpload"
import { isVideoAudioLostError, isVideoPrepareError } from "@/shared/services/videoEncode"
import type { QueueTaskKind } from "@/store/uploadQueue.store"
import { UploadRefusal } from "./uploadRefusal"

export { UploadRefusal }

/**
 * A server-side job or publication failure worth another go: the worker
 * timed out or broke, was missing ffmpeg, or the original was gone (a retry
 * uploads it again). Everything else is about the file itself, or the
 * account (ACTOR_NO_LONGER_VALID, PUBLISH_REJECTED).
 */
const RETRYABLE_JOB_CODES = new Set([
    "PROCESSING_TIMEOUT",
    "INTERNAL",
    "PROCESSOR_UNAVAILABLE",
    "SOURCE_MISSING",
    "server_processing_unavailable",
])

/** The phone could not prepare it, and never will on this device. */
const FINAL_VIDEO_CODES = new Set(["TOO_LARGE", "PROBE_FAILED", "NO_VIDEO_TRACK"])

export const isRetryableJobCode = (code: string | null | undefined): boolean =>
    Boolean(code && RETRYABLE_JOB_CODES.has(code))

export function canRetryUpload(err: unknown, kind: QueueTaskKind): boolean {
    if (err instanceof UploadRefusal) return false
    // The bytes did not get there: offline, a dropped connection, an expired
    // URL, a locked phone — exactly what a retry is for.
    if (err instanceof UploadError) return true
    if (isMediaJobError(err)) return isRetryableJobCode(err.code)
    if (isVideoPrepareError(err)) return !FINAL_VIDEO_CODES.has(err.code)
    if (isImagePrepareError(err)) return false
    // The same encode loses the same sound; "without sound" is its own action.
    if (isVideoAudioLostError(err)) return false
    if (kind === "highlight" && isHighlightCapError(err)) return false

    if (isAxiosError(err)) {
        const status = err.response?.status
        // No answer at all: the network, not the request.
        if (status === undefined) return true
        if (status === 408 || status === 429) return true
        // A 4xx is the server's considered "no" — validation, the 10-clip cap,
        // "already used", "hasn't finished processing". Asking again is the same.
        return status >= 500
    }

    // Anything else (a probe that timed out, a signing hiccup) — let them try.
    return true
}
