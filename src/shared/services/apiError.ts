/**
 * Human-readable messages out of whatever an upload or save flow throws.
 *
 * Two kinds of error meet in a composer's `catch`: the backend's envelope
 * (`{ success:false, message, data:{ errors:{ field: msg } } }`, reached
 * through an AxiosError whose own `.message` is the useless "Request failed
 * with status code 400") and the upload helpers' plain `Error`s, whose
 * messages are written for the user already. This picks the right one, and
 * knows which throws are not errors at all — a cancel the user asked for.
 *
 * `core/api/getApiErrorMessage` does the envelope part for the query hooks;
 * this one sits next to the media helpers because it also has to recognise
 * their cancellation sentinels.
 */

import { isAxiosError, isCancel } from "axios"

import { UPLOAD_CANCELLED } from "@/shared/services/mediaUpload"
import { ENCODE_CANCELLED } from "@/shared/services/videoEncode"

type ApiErrorBody = {
    message?: unknown
    error?: unknown
    data?: { errors?: unknown }
}

/** Axios's own message for any non-2xx — never something to show a user. */
const AXIOS_STATUS_MESSAGE = /^request failed with status code \d+/i

const nonEmpty = (value: unknown): value is string =>
    typeof value === "string" && value.trim().length > 0

/**
 * True when `err` is the user cancelling, in any of the shapes the pipeline
 * produces: the shared `upload_cancelled` sentinel (`putToR2`, `encodeVideo`,
 * and an `AbortController.abort(new Error(UPLOAD_CANCELLED))`), axios's
 * `CanceledError`, or a bare `AbortError` (an `abort()` with no reason
 * reaching `browser-image-compression`, which rethrows `signal.reason`).
 */
export function isUploadCancellation(err: unknown): boolean {
    if (isCancel(err)) return true
    if (err instanceof Error) {
        if (err.message === UPLOAD_CANCELLED || err.message === ENCODE_CANCELLED)
            return true
        if (err.name === "AbortError") return true
    }
    return false
}

/**
 * The message to show for `err`, in priority:
 *
 *   response.data.message → first value of response.data.data.errors →
 *   response.data.error → (non-axios Error) its own message → `fallback`.
 *
 * Never returns axios's "Request failed with status code …". A cancellation
 * has no message — callers check {@link isUploadCancellation} first and stay
 * silent; if one gets here anyway it yields the fallback.
 */
export function getApiErrorMessage(err: unknown, fallback: string): string {
    if (isUploadCancellation(err)) return fallback

    if (isAxiosError(err)) {
        // Never reached the server — the status-code message would be wrong
        // as well as unhelpful.
        if (!err.response) return "Check your internet connection and try again."

        const body = (err.response.data ?? {}) as ApiErrorBody
        const { message, error, data } = body
        if (nonEmpty(message)) return message

        const errors = data?.errors
        if (errors && typeof errors === "object") {
            const first = Object.values(errors as Record<string, unknown>).find(nonEmpty)
            if (first) return first
        }

        if (nonEmpty(error)) return error
        return fallback
    }

    if (err instanceof Error && nonEmpty(err.message)) {
        return AXIOS_STATUS_MESSAGE.test(err.message) ? fallback : err.message
    }

    return fallback
}
