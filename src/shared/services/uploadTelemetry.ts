/**
 * What Sentry hears about an upload that finally failed.
 *
 * "Network error while uploading" used to be the whole story, and on an
 * iPhone it is several different stories that WebKit reports identically: a
 * page iOS suspended when the screen locked, a Wi-Fi→cellular handoff that
 * dropped the connection, an R2 error response Safari would not let the page
 * read, a refused CORS preflight. Each attempt is recorded where it fails
 * (`AttemptRecord` in mediaUpload.ts) — visibility, bytes sent, whether this
 * is a home-screen app — and this sends the record, so the next report says
 * which story it was.
 *
 * Called from the ONE final-throw path in `putToR2` and in the multipart
 * uploader, and by `uploadSignedBatch` for the flows that can still recover
 * by re-signing. No call site anywhere else needs to know this exists.
 *
 * NO URL EVER LEAVES THROUGH HERE. A presigned URL carries its signature in
 * the query string — anyone holding it can write that object until it
 * expires — so the error carries the upload's ORIGIN only, and nothing below
 * adds a URL. (Sentry's own XHR breadcrumbs record full request URLs; those
 * are scrubbed in core/observability/redact.ts.)
 *
 * Without a DSN every Sentry call here is a no-op, which is the normal state
 * on localhost.
 *
 * PREPARING MEDIA FAILS TOO, before a byte is sent. A video that could not be
 * made playable, a poster that could not be drawn, a photo the browser could
 * not decode: each is a coded error (`VideoPrepareError` in videoEncode.ts,
 * `ImagePrepareError` in imageVariants.ts) carrying what was known about the
 * source and every step that was tried. The reporters below send those, once,
 * from the one place each pipeline finally gives up — and a warning whenever a
 * video only got through on a fallback, so the inputs that need one are known
 * rather than guessed at. Neither ever sees a URL: the facts are measured off
 * the file, and the file's name is not sent.
 */

import * as Sentry from "@sentry/nextjs"

import type { UploadError } from "@/shared/services/mediaUpload"
import type {
    SourceFacts,
    StepRecord,
    VideoPrepareError,
} from "@/shared/services/videoEncode"
import type { ImagePrepareError } from "@/shared/services/imageVariants"
import type { MediaJobError } from "@/shared/services/sourceUpload"

/** Which composer the upload belongs to. "single" covers every one-file flow. */
export type UploadFlow = "post" | "highlight" | "chat" | "recruitment" | "single"

/**
 * What was being uploaded when it failed. "part" is one part of a multipart
 * upload; "source" an original sent for the server to convert.
 */
export type UploadTelemetryKind = "image" | "thumb" | "video" | "part" | "source"

export type UploadTelemetryContext = {
    flow: UploadFlow
    kind: UploadTelemetryKind
    contentType: string
    size: number
}

/**
 * True in a home-screen web app. iOS suspends one the moment it leaves the
 * screen — no grace period at all — so it is the first thing worth knowing
 * about a failure.
 */
export function isStandalone(): boolean {
    if (typeof navigator === "undefined") return false
    if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return true
    try {
        return (
            typeof matchMedia === "function" &&
            matchMedia("(display-mode: standalone)").matches
        )
    } catch {
        return false
    }
}

/** "4g", "3g"… where the browser says (Chromium); undefined on Safari. */
export function connectionType(): string | undefined {
    if (typeof navigator === "undefined") return undefined
    return (navigator as Navigator & { connection?: { effectiveType?: string } })
        .connection?.effectiveType
}

export function reportUploadFailure(
    err: UploadError,
    ctx: UploadTelemetryContext
): void {
    // The author asked for it. Not a failure, and never an event.
    if (err.code === "CANCELLED") return

    const standalone = err.attempts.length
        ? err.attempts.some((a) => a.standalone)
        : isStandalone()

    try {
        for (const attempt of err.attempts) {
            Sentry.addBreadcrumb({
                category: "upload",
                level: "warning",
                message: `upload attempt ${attempt.attempt} failed: ${attempt.code}`,
                data: { host: err.host, ...attempt },
            })
        }

        Sentry.captureException(err, {
            tags: {
                "upload.flow": ctx.flow,
                "upload.kind": ctx.kind,
                "upload.code": err.code,
                "upload.status": String(err.status),
                "upload.attempts": String(err.attempts.length),
                "upload.standalone": String(standalone),
            },
            extra: {
                attempts: err.attempts,
                host: err.host,
                hint: err.hint,
                contentType: ctx.contentType,
                size: ctx.size,
                bytesSent: err.bytesSent,
                totalBytes: err.totalBytes,
                elapsedMs: err.elapsedMs,
            },
        })
    } catch {
        // Telemetry must never be the reason an upload path throws something
        // other than the upload's own error.
    }

    if (process.env.NODE_ENV === "development") {
        const rows = err.attempts.map(
            (a) =>
                `  #${a.attempt}${a.part ? ` part ${a.part}` : ""} ${a.code}` +
                ` status=${a.status} sent=${a.bytesSent}/${err.totalBytes}` +
                ` ${a.elapsedMs}ms ${a.online ? "online" : "OFFLINE"}` +
                ` ${a.effectiveType ?? "-"} ${a.visibilityState}` +
                `${a.hiddenDuringAttempt ? " (was hidden)" : ""}` +
                `${a.standalone ? " standalone" : ""}`
        )
        console.warn(
            [
                `[upload] ${ctx.flow}/${ctx.kind} failed: ${err.code} via ${err.host || "?"}`,
                `  hint: ${err.hint}`,
                ...rows,
            ].join("\n")
        )
    }
}

// ── Preparing media ───────────────────────────────────────────

/** The steps that actually ran, in order — a Sentry tag, so it is searchable. */
const pathTried = (steps: StepRecord[]): string =>
    steps
        .filter((s) => s.outcome !== "skipped")
        .map((s) => s.name)
        .join(" > ") || "none"

function logSteps(heading: string, steps: StepRecord[]) {
    if (process.env.NODE_ENV !== "development") return
    console.warn(heading)
    console.table(steps)
}

/**
 * A video that could not be made uploadable by any step. Called once, from
 * the place `encodeVideo` (or `capturePoster`) finally throws, so posts,
 * highlights and chat are all covered without knowing this exists. A cancel
 * or an audio-lost decision never reaches here — neither is a failure.
 */
export function reportVideoPrepareFailure(
    err: VideoPrepareError,
    ctx: { flow: UploadFlow }
): void {
    try {
        Sentry.captureException(err, {
            tags: {
                "video.code": err.code,
                "video.codec": err.facts.videoCodec ?? "unknown",
                "video.container": err.facts.container ?? "unknown",
                "video.path_tried": pathTried(err.steps),
                "upload.flow": ctx.flow,
                "upload.standalone": String(isStandalone()),
            },
            extra: { facts: err.facts, steps: err.steps },
        })
    } catch {
        // Telemetry never replaces the error the author needs to see.
    }

    logSteps(`[videoEncode] ${ctx.flow} failed: VIDEO_${err.code}`, err.steps)
}

/**
 * A video that DID get through, but only on a fallback (anything but the fast
 * path or the normal encode) — or a poster that had to be a placeholder. Not
 * an error: a warning, so which real-world files need which fallback is a
 * query rather than a guess. `path` is the step name, or a fixed label
 * ("hevc_last_resort", "poster_placeholder") for the ones worth alerting on.
 */
export function reportVideoFallbackUsed(
    path: string,
    facts: SourceFacts,
    flow: UploadFlow,
    steps: StepRecord[] = []
): void {
    try {
        Sentry.captureMessage(`video prepared via fallback: ${path}`, {
            level: "warning",
            tags: {
                "video.path": path,
                "video.codec": facts.videoCodec ?? "unknown",
                "video.container": facts.container ?? "unknown",
                "upload.flow": flow,
                "upload.standalone": String(isStandalone()),
            },
            extra: { facts, steps },
        })
    } catch {
        // As above.
    }

    if (steps.length) logSteps(`[videoEncode] ${flow} used a fallback: ${path}`, steps)
}

/**
 * A photo that could not be decoded, or was still over the server's cap after
 * compressing. `surface` narrows a "single" flow down to the screen it came
 * from (profile, cover, match, …).
 */
export function reportImagePrepareFailure(
    err: ImagePrepareError,
    ctx: { flow: UploadFlow; surface?: string }
): void {
    try {
        Sentry.captureException(err, {
            tags: {
                "image.code": err.code,
                "image.type": err.facts.fileType || "none",
                "image.extension": err.facts.extension || "none",
                "upload.flow": ctx.flow,
                ...(ctx.surface ? { "upload.surface": ctx.surface } : {}),
                "upload.standalone": String(isStandalone()),
            },
            extra: { facts: err.facts, steps: err.steps },
        })
    } catch {
        // As above.
    }

    logSteps(`[image] ${ctx.surface ?? ctx.flow} failed: ${err.code}`, err.steps)
}

// ── Server-side conversion ────────────────────────────────────

/**
 * A source original the media worker could not convert, or refused to take
 * (VIDEO_TOO_LONG, SOURCE_UNREADABLE, PROCESSING_TIMEOUT…). Tagged with the
 * server's code; the job id and key are not sent — nothing here needs them,
 * and a key is half of a URL.
 */
export function reportMediaJobFailure(
    err: MediaJobError,
    ctx: { flow: UploadFlow }
): void {
    try {
        Sentry.captureException(err, {
            level: "warning",
            tags: {
                "media.code": err.code,
                "upload.flow": ctx.flow,
                "upload.standalone": String(isStandalone()),
            },
        })
    } catch {
        // As above.
    }

    if (process.env.NODE_ENV === "development") {
        console.warn(`[media] ${ctx.flow} job failed: ${err.code} — ${err.message}`)
    }
}
