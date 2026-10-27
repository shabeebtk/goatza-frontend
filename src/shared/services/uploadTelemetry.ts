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
 */

import * as Sentry from "@sentry/nextjs"

import type { UploadError } from "@/shared/services/mediaUpload"

/** Which composer the upload belongs to. "single" covers every one-file flow. */
export type UploadFlow = "post" | "highlight" | "chat" | "recruitment" | "single"

/** What was being uploaded when it failed. "part" is one part of a multipart video. */
export type UploadTelemetryKind = "image" | "thumb" | "video" | "part"

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
