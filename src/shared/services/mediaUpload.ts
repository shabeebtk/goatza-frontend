/**
 * Presigned direct uploads to Cloudflare R2.
 *
 * R2 decides nothing about where a file goes: the backend picks the object key,
 * signs a PUT bound to that exact key AND content type, and the browser streams
 * the raw bytes there. Two consequences run through every caller:
 *
 *   1. The response is empty. There is no JSON to parse and nothing to learn
 *      from the upload — `public_url` and `key` are known BEFORE the bytes move,
 *      handed to us in the config. Anything a provider used to report back
 *      (width, height, bytes, duration) is now the client's job to measure.
 *   2. The Content-Type header is signed in. Sending anything other than
 *      `entry.headers["Content-Type"]` fails the signature check, so the header
 *      and the blob must describe the same file.
 *
 * The config request declares every file up front, and the response's `uploads`
 * array comes back in the SAME ORDER — that positional pairing is the only link
 * between a blob and its presigned entry.
 *
 * WHY THE PUT IS NOT JUST ONE XHR ANY MORE. Every iPhone browser is WebKit, and
 * WebKit is hard on a long upload: iOS suspends the page — and kills the
 * request — the moment the screen locks or the user switches apps (instantly,
 * in a home-screen app); a Wi-Fi→cellular handoff drops the connection; an R2
 * error response or a refused CORS preflight arrives as a bare network error
 * with no status; and Safari's upload progress counts bytes handed to the OS,
 * not bytes acknowledged, which is how an upload "dies at 99%". A post is up to
 * 20 PUTs or one 80 MB video, and with no retry one hiccup anywhere used to
 * fail the whole post and throw away all the compression and encoding.
 *
 * So, in this file:
 *   - `putToR2` retries a failed PUT with backoff, tells a suspended page from
 *     a dead network, waits for the page to come back before retrying, and
 *     stops on inactivity rather than on a fixed timeout;
 *   - every final failure is an `UploadError` with a code, a per-attempt log
 *     and a hint, reported to Sentry from here (uploadTelemetry.ts);
 *   - `uploadSignedBatch` re-signs the rest of a batch, into the same folder,
 *     when its URLs expire or R2 answers 403;
 *   - `putVideoToR2` sends a large video in parts, so a lost connection costs
 *     one part and an app switch resumes instead of restarting.
 */

import api from "@/core/api/axios"
import {
    connectionType,
    isStandalone,
    reportUploadFailure,
    type UploadFlow,
    type UploadTelemetryKind,
} from "@/shared/services/uploadTelemetry"

// ── Types (mirror of the backend contract) ────────────────────

/**
 * Server-side upload types.
 *
 * "highlights" is absent because the backend has no such type: a highlight clip
 * is signed as "posts" and lands in the player's own user-scoped folder. See
 * highlightUpload.service.ts.
 */
export type MediaUploadType =
    | "profile"
    | "cover"
    | "posts"
    | "organization_logo"
    | "organization_cover"
    | "recruitments"
    | "chat"
    | "achievements"
    | "matches"
    /** Problem-report screenshots — up to 3 images, no video, no thumbs. */
    | "support"

/**
 * What a file IS, not what it contains: the server pairs a "video" with exactly
 * one "thumb" in the same request, and rejects a "thumb" with no parent.
 */
export type UploadKind = "image" | "video" | "thumb"

/** One entry in the config request's `files` array. */
export type UploadFileDescriptor = {
    content_type: string
    size_bytes: number
    kind: UploadKind
}

/** One presigned PUT. `public_url` is where the file will be readable. */
export type R2UploadEntry = {
    method: "PUT"
    upload_url: string
    key: string
    public_url: string
    headers: Record<string, string>
    expires_in: number
    /**
     * Unix seconds when `upload_url` stops working, on THIS device's clock —
     * `getUploadConfigApi` re-measures it from `expires_in` (see
     * {@link onLocalClock}).
     */
    expires_at: number
}

export type UploadConfigResponse = {
    provider: "r2"
    /** posts + recruitments only — the batch folder every file landed in. */
    temp_post_id?: string
    /** Same order as the request's `files`. */
    uploads: R2UploadEntry[]
}

// ── Content types ─────────────────────────────────────────────

/** What the server will sign. Anything else is rejected before upload. */
export const ALLOWED_IMAGE_CONTENT_TYPES = [
    "image/webp",
    "image/jpeg",
    "image/png",
] as const

/**
 * The content type to declare for a blob.
 *
 * Everything is compressed to WebP — or JPEG, on a browser that cannot write
 * WebP (see `preferredImageType` in imageVariants.ts) — before it gets here,
 * and the compressors report the type they REALLY wrote, so this is normally
 * just `blob.type`. Declaring the truth matters twice over: the PUT must send
 * back exactly the type that was signed, and the object key's extension is
 * derived from it. The fallback only covers a blob with no type at all.
 */
export function resolveContentType(blob: Blob): string {
    const type = blob.type as (typeof ALLOWED_IMAGE_CONTENT_TYPES)[number]
    return ALLOWED_IMAGE_CONTENT_TYPES.includes(type) ? type : "image/webp"
}

/** Descriptor for one blob, ready for the config request. */
export function describeBlob(
    blob: Blob,
    kind: UploadKind = "image"
): UploadFileDescriptor {
    return {
        content_type: resolveContentType(blob),
        size_bytes: blob.size,
        kind,
    }
}

// ── Step 1: ask the backend to sign the batch ─────────────────

/**
 * Re-express an expiry on THIS device's clock.
 *
 * The server's `expires_at` is on the server's clock, and a phone's can be
 * minutes off it — far enough to refuse every fresh URL as expired, or to
 * trust a dead one. `expires_in` is a duration, so it is re-anchored to the
 * moment the request was SENT: the server signed after that, so the local
 * deadline can only be early, never late. The server's value stands only when
 * there is no `expires_in` to go on.
 */
function onLocalClock<T extends { expires_in?: number; expires_at?: number }>(
    value: T,
    sentAt: number
): T {
    if (typeof value?.expires_in !== "number" || !(value.expires_in > 0)) return value
    return { ...value, expires_at: Math.floor(sentAt / 1000) + value.expires_in }
}

/**
 * The axios instance attaches the JWT and the X-Actor-Type / X-Actor-Id
 * headers, so acting as an org scopes the keys to that org.
 *
 * `orgId` is only for org-scoped types; it mirrors the old `org_id` query
 * param and lets a user acting personally upload for an org they belong to.
 *
 * `signal` cancels the request itself; axios then rejects with a
 * `CanceledError` (`axios.isCancel`), which callers treat as silent alongside
 * {@link UPLOAD_CANCELLED}.
 *
 * `tempPostId` re-signs into an in-flight batch's folder (posts/recruitments
 * only — the server ignores it for every other type). It is how
 * {@link uploadSignedBatch} keeps a re-signed thumb in its image's folder.
 */
export const getUploadConfigApi = async (
    type: MediaUploadType,
    files: UploadFileDescriptor[],
    orgId?: string,
    signal?: AbortSignal,
    tempPostId?: string
): Promise<UploadConfigResponse> => {
    const sentAt = Date.now()
    const res = await api.post(
        "/user/get/upload/signature",
        {
            type,
            ...(orgId ? { org_id: orgId } : {}),
            ...(tempPostId ? { temp_post_id: tempPostId } : {}),
            files,
        },
        signal ? { signal } : undefined
    )
    const config = res.data.data as UploadConfigResponse
    return {
        ...config,
        uploads: (config.uploads ?? []).map((entry) => onLocalClock(entry, sentAt)),
    }
}

// ── Step 2: PUT the bytes ─────────────────────────────────────

/** Thrown when the user cancels — callers use this to stay silent. */
export const UPLOAD_CANCELLED = "upload_cancelled"

/** What a composer says when Post is pressed with no connection at all. */
export const OFFLINE_MESSAGE = "You're offline. Check your connection and try again."

/**
 * Sent with every progress call, so a composer can say what is happening when
 * the bar goes back: `attempt` counts tries against the `maxAttempts` budget
 * (1 = the first), and `resuming` marks a retry after the page was hidden,
 * which costs nothing from that budget.
 */
export type UploadProgressMeta = {
    attempt: number
    maxAttempts: number
    resuming?: boolean
}

export type UploadProgress = (
    loaded: number,
    total: number,
    meta?: UploadProgressMeta
) => void

export type UploadErrorCode =
    /** navigator.onLine was false — nothing was attempted, or retrying stopped. */
    | "OFFLINE"
    /** No HTTP status, page visible throughout: the connection failed. */
    | "NETWORK"
    /** No HTTP status, and the page was hidden: iOS suspended the request. */
    | "BACKGROUNDED"
    /** No progress for too long, or the hard cap — a stalled connection. */
    | "TIMEOUT"
    /** 403, or a URL already (nearly) expired: the caller must re-sign. */
    | "SIGNATURE_REJECTED"
    /** 408 / 425 / 429 / 5xx — worth retrying. */
    | "SERVER"
    /** Any other 4xx — retrying the same request cannot help. */
    | "CLIENT"
    /** The author cancelled. Message is always {@link UPLOAD_CANCELLED}. */
    | "CANCELLED"
    /** A part uploaded but its ETag was unreadable: the bucket's CORS is wrong. */
    | "CONFIG_MISMATCH"

/** One failed attempt, as kept on the error and sent to Sentry. */
export type AttemptRecord = {
    /** 1-based, counting every attempt — resumes included. */
    attempt: number
    code: UploadErrorCode
    /** HTTP status; 0 when there was none. */
    status: number
    bytesSent: number
    elapsedMs: number
    online: boolean
    effectiveType?: string
    /** At the moment it failed. */
    visibilityState: DocumentVisibilityState
    /** Hidden at any point while this attempt was in flight. */
    hiddenDuringAttempt: boolean
    standalone: boolean
    /** Multipart only: which part. */
    part?: number
}

/** The human half of each message; the code suffix is added below. */
const UPLOAD_MESSAGES: Record<Exclude<UploadErrorCode, "CANCELLED">, string> = {
    OFFLINE: "You're offline. Check your connection and try again",
    NETWORK: "Network error while uploading",
    BACKGROUNDED:
        "The upload stopped when Goatza left the screen. Keep Goatza open until it finishes",
    TIMEOUT: "The upload stalled. Check your connection and try again",
    SIGNATURE_REJECTED: "The upload link expired. Please try again",
    SERVER: "Storage is having trouble right now. Please try again",
    CLIENT: "The upload was refused. Please try again",
    CONFIG_MISMATCH:
        "Large video uploads aren't set up on the server. Admin: run python manage.py r2_setup --apply",
}

/**
 * Why it really failed, from the attempt log — what the browser would not say.
 * For Sentry and the console, not the author.
 */
function deriveHint(
    code: UploadErrorCode,
    attempts: AttemptRecord[],
    totalBytes: number
): string {
    const last = attempts[attempts.length - 1]

    switch (code) {
        case "CANCELLED":
            return "cancelled by the user"
        case "OFFLINE":
            return "navigator.onLine was false — the device reported no network"
        case "CONFIG_MISMATCH":
            return (
                "a part uploaded but its ETag header was unreadable — the bucket's " +
                "CORS policy does not expose ETag; run `python manage.py r2_setup --apply`"
            )
        case "SIGNATURE_REJECTED":
            return last?.status === 403
                ? "R2 answered 403 — the presigned URL expired or its signature did not match"
                : "the presigned URL had expired (or was about to) before the attempt"
        case "SERVER":
        case "CLIENT":
            return `R2 answered ${last?.status ?? 0}`
        case "TIMEOUT":
            return "no upload progress for too long while visible, or no response — a stalled connection"
    }

    // NETWORK / BACKGROUNDED: a status-less error, which WebKit gives for all
    // of these alike.
    if (!last) return "no attempt was made"
    if (code === "BACKGROUNDED" || last.hiddenDuringAttempt || last.visibilityState === "hidden") {
        return "the page was hidden (screen lock / app switch) during the attempt; iOS suspends in-flight uploads"
    }
    if (totalBytes > 0 && last.bytesSent >= totalBytes) {
        return (
            "all bytes were sent and the response was unreadable → an R2 error " +
            "response, or a CORS header missing for this origin; run `python manage.py r2_setup`"
        )
    }
    if (last.bytesSent === 0) return "no bytes were sent → preflight/DNS/connection failure"
    return "connection dropped mid-transfer (network change?)"
}

/** The origin of a URL and nothing else — a presigned query is a credential. */
function originOf(url?: string): string {
    if (!url) return ""
    try {
        return new URL(url).origin
    } catch {
        return ""
    }
}

/**
 * Every way an upload ends badly, with what is known about why.
 *
 * The message is written for the author and ends in a short code they can
 * quote ("Network error while uploading (UPLOAD_NETWORK)"); `hint` is the
 * diagnosis, for Sentry. A cancel keeps the old contract — its message is
 * exactly {@link UPLOAD_CANCELLED} — so every composer's silent-cancel check
 * keeps working without knowing this class exists.
 */
export class UploadError extends Error {
    readonly code: UploadErrorCode
    /** HTTP status of the last attempt; 0 when there was none. */
    readonly status: number
    /** How many attempts were made. */
    readonly attempt: number
    readonly bytesSent: number
    readonly totalBytes: number
    readonly elapsedMs: number
    /** Origin of the upload URL only. */
    readonly host: string
    readonly attempts: AttemptRecord[]
    readonly hint: string
    /** Multipart: the part that failed. */
    readonly part?: number

    constructor(
        code: UploadErrorCode,
        details: {
            url?: string
            totalBytes?: number
            attempts?: AttemptRecord[]
            startedAt?: number
            part?: number
        } = {}
    ) {
        super(
            code === "CANCELLED"
                ? UPLOAD_CANCELLED
                : `${UPLOAD_MESSAGES[code]} (UPLOAD_${code})`
        )
        // Keeps `instanceof` honest if a build ever downlevels classes.
        Object.setPrototypeOf(this, new.target.prototype)
        this.name = "UploadError"

        const attempts = details.attempts ?? []
        const last = attempts[attempts.length - 1]

        this.code = code
        this.status = last?.status ?? 0
        this.attempt = attempts.length
        this.bytesSent = last?.bytesSent ?? 0
        this.totalBytes = details.totalBytes ?? 0
        this.elapsedMs = details.startedAt ? Date.now() - details.startedAt : 0
        this.host = originOf(details.url)
        this.attempts = attempts
        this.part = details.part ?? last?.part
        this.hint = deriveHint(code, attempts, this.totalBytes)
    }
}

export const isUploadCancelled = (err: unknown): boolean =>
    (err instanceof UploadError && err.code === "CANCELLED") ||
    (err instanceof Error && err.message === UPLOAD_CANCELLED)

// ── The retry policy ──────────────────────────────────────────

/** 1 try + 3 retries. */
const DEFAULT_MAX_ATTEMPTS = 4

/** Backoff before retry n: 1 s, 2 s, 4 s…, plus jitter. */
const BACKOFF_BASE_MS = 1000
const BACKOFF_MAX_MS = 16_000
const BACKOFF_JITTER_MS = 500

/**
 * Retries after the page was hidden cost nothing from the attempt budget — a
 * locked screen is not the network's fault — but they are capped, so a page
 * that keeps being hidden cannot retry forever.
 */
const MAX_BACKGROUNDED_RETRIES = 3

/** Once visible again, let the network come back before the retry starts. */
const RESUME_SETTLE_MS = 500

/**
 * Waking from a lock, iOS takes a moment to rejoin Wi-Fi, and `onLine` reads
 * false meanwhile. A resumed upload waits this long for it before giving up.
 */
const ONLINE_GRACE_MS = 5000

/**
 * A status-less error this soon after the page came back is the suspension's
 * doing — typically a request sent on a pooled connection iOS killed while
 * the page was frozen — not the network's.
 */
const RESUME_GRACE_MS = 2000

/**
 * The INACTIVITY watchdog, replacing a fixed timeout that killed slow uploads
 * that were still moving: no upload progress for 60 s while the page is
 * visible ends the attempt as TIMEOUT, which is retried.
 */
const INACTIVITY_TIMEOUT_MS = 60_000

/**
 * Once every byte has been handed to the OS there are no more progress events
 * to watch, but on a slow uplink the OS can still be draining its buffer — a
 * couple of MB at a few hundred kbps is over a minute. So the wait for R2's
 * answer gets longer than the inactivity window.
 */
const RESPONSE_TIMEOUT_MS = 180_000

/** No attempt runs longer than this, moving or not. */
const ATTEMPT_HARD_CAP_MS = 30 * 60_000

const WATCHDOG_TICK_MS = 1000

/**
 * A watchdog tick this much later than scheduled means the page was frozen.
 * iOS does not always announce a screen lock with a visibilitychange first.
 */
const FROZEN_GAP_MS = 10_000

/** A URL with less than this left is treated as expired before an attempt. */
const EXPIRY_MARGIN_S = 30

/**
 * Batch flows re-sign earlier than {@link EXPIRY_MARGIN_S}, so the URL they
 * start a PUT with still has room for the PUT to finish.
 */
const RESIGN_MARGIN_S = 60

const isHidden = () =>
    typeof document !== "undefined" && document.visibilityState === "hidden"

const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false

const visibilityState = (): DocumentVisibilityState =>
    typeof document !== "undefined" ? document.visibilityState : "visible"

/** When the page last came back on screen, for {@link RESUME_GRACE_MS}. */
let lastResumedAt = Number.NEGATIVE_INFINITY
let resumeTrackerInstalled = false

/** Installed once, on the first upload; nothing to track before that. */
function trackResumes() {
    if (resumeTrackerInstalled || typeof document === "undefined") return
    resumeTrackerInstalled = true
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") lastResumedAt = Date.now()
    })
}

/**
 * Resolves true when `arm`'s `done` fires, false when `signal` aborts first —
 * never rejects, so every wait reads `if (!(await …)) cancel`. `arm` returns
 * its own cleanup.
 */
function until(
    arm: (done: () => void) => () => void,
    signal?: AbortSignal
): Promise<boolean> {
    return new Promise((resolve) => {
        if (signal?.aborted) {
            resolve(false)
            return
        }
        let settled = false
        // A holder, not a `const`: `done` can fire synchronously inside `arm`,
        // before there is a cleanup to call.
        const cleanup: { disarm?: () => void } = {}
        const finish = (ok: boolean) => {
            if (settled) return
            settled = true
            cleanup.disarm?.()
            signal?.removeEventListener("abort", onAbort)
            resolve(ok)
        }
        const onAbort = () => finish(false)
        signal?.addEventListener("abort", onAbort, { once: true })
        cleanup.disarm = arm(() => finish(true))
        // `done` fired synchronously, before there was a cleanup to run.
        if (settled) cleanup.disarm()
    })
}

const noop = () => {}

const sleep = (ms: number, signal?: AbortSignal) =>
    until((done) => {
        const timer = setTimeout(done, ms)
        return () => clearTimeout(timer)
    }, signal)

const waitUntilVisible = (signal?: AbortSignal) =>
    until((done) => {
        if (!isHidden()) {
            done()
            return noop
        }
        const onChange = () => {
            if (!isHidden()) done()
        }
        document.addEventListener("visibilitychange", onChange)
        return () => document.removeEventListener("visibilitychange", onChange)
    }, signal)

const waitForOnline = (ms: number, signal?: AbortSignal) =>
    until((done) => {
        if (!isOffline()) {
            done()
            return noop
        }
        const timer = setTimeout(done, ms)
        window.addEventListener("online", done)
        return () => {
            clearTimeout(timer)
            window.removeEventListener("online", done)
        }
    }, signal)

const backoffMs = (retry: number) =>
    Math.min(BACKOFF_BASE_MS * 2 ** (retry - 1), BACKOFF_MAX_MS) +
    Math.random() * BACKOFF_JITTER_MS

const classifyStatus = (status: number): UploadErrorCode => {
    if (status === 403) return "SIGNATURE_REJECTED"
    if (status === 408 || status === 425 || status === 429 || status >= 500) return "SERVER"
    return "CLIENT"
}

/** One request to R2 — a whole object, or one part of one. */
type PutRequest = {
    method: string
    url: string
    /** Exactly what was signed — nothing more, nothing less. */
    headers: Record<string, string>
    body: Blob
    /** Unix seconds on this device's clock. */
    expiresAt?: number
    /** Multipart: hand back the part's ETag. */
    readEtag?: boolean
    /** Multipart: which part, for the attempt log. */
    part?: number
}

type AttemptResult =
    | { ok: true; etag: string | null }
    | { ok: false; record: AttemptRecord }

/**
 * ONE attempt: one XHR, exactly as the bytes have always gone up — the raw
 * blob as the body, only the signed headers. The primitive both a whole-object
 * PUT and a multipart part are built on.
 *
 * NO FormData: the object stored in the bucket is byte-for-byte the request
 * body, so a multipart/form-data envelope would be stored AS the file.
 *
 * Never rejects; resolves with the attempt's record when it fails, so the
 * caller decides what a failure means.
 */
function sendOnce(
    req: PutRequest,
    attempt: number,
    onBytes: (loaded: number) => void,
    signal?: AbortSignal
): Promise<AttemptResult> {
    return new Promise((resolve) => {
        const startedAt = Date.now()
        const xhr = new XMLHttpRequest()

        let bytesSent = 0
        let hiddenDuringAttempt = isHidden()
        let uploadDone = false
        let stoppedBy: "cancel" | "watchdog" | null = null
        let lastActivityAt = startedAt
        let lastTickAt = startedAt
        let settled = false
        // A holder: an attempt cancelled before it starts settles before the
        // watchdog exists.
        const watchdog: { timer?: ReturnType<typeof setInterval> } = {}

        const onVisibility = () => {
            if (isHidden()) hiddenDuringAttempt = true
            // Back on screen: the inactivity window starts over from now.
            else lastActivityAt = Date.now()
        }

        const onCancel = () => {
            stoppedBy = "cancel"
            xhr.abort()
        }

        const settle = (result: AttemptResult) => {
            if (settled) return
            settled = true
            if (watchdog.timer !== undefined) clearInterval(watchdog.timer)
            document.removeEventListener("visibilitychange", onVisibility)
            signal?.removeEventListener("abort", onCancel)
            resolve(result)
        }

        const fail = (code: UploadErrorCode, status = 0) =>
            settle({
                ok: false,
                record: {
                    attempt,
                    code,
                    status,
                    bytesSent,
                    elapsedMs: Date.now() - startedAt,
                    online: !isOffline(),
                    effectiveType: connectionType(),
                    visibilityState: visibilityState(),
                    hiddenDuringAttempt,
                    standalone: isStandalone(),
                    ...(req.part !== undefined ? { part: req.part } : {}),
                },
            })

        // A failure with no HTTP status. WebKit raises the same event for a
        // dead socket, a refused preflight, an unreadable error response and a
        // suspended page, so the page's own history decides which it was.
        const failWithoutStatus = () => {
            const suspended =
                isHidden() ||
                hiddenDuringAttempt ||
                Date.now() - lastResumedAt <= RESUME_GRACE_MS
            fail(suspended ? "BACKGROUNDED" : "NETWORK")
        }

        if (signal?.aborted) {
            fail("CANCELLED")
            return
        }

        xhr.upload.addEventListener("progress", (e) => {
            lastActivityAt = Date.now()
            if (!e.lengthComputable) return
            bytesSent = e.loaded
            onBytes(e.loaded)
        })

        xhr.upload.addEventListener("load", () => {
            uploadDone = true
            lastActivityAt = Date.now()
        })

        xhr.addEventListener("load", () => {
            const status = xhr.status
            if (status >= 200 && status < 300) {
                settle({ ok: true, etag: req.readEtag ? xhr.getResponseHeader("ETag") : null })
                return
            }
            fail(classifyStatus(status), status)
        })

        xhr.addEventListener("error", failWithoutStatus)
        xhr.addEventListener("timeout", () => fail("TIMEOUT"))
        xhr.addEventListener("abort", () => {
            if (stoppedBy === "cancel") fail("CANCELLED")
            else if (stoppedBy === "watchdog") fail("TIMEOUT")
            // Neither the author nor the watchdog stopped it: the browser did,
            // which tells the same story as an error.
            else failWithoutStatus()
        })

        signal?.addEventListener("abort", onCancel, { once: true })
        document.addEventListener("visibilitychange", onVisibility)

        watchdog.timer = setInterval(() => {
            const now = Date.now()
            if (now - lastTickAt > FROZEN_GAP_MS) {
                hiddenDuringAttempt = true
                lastActivityAt = now
            }
            lastTickAt = now

            // Paused while hidden: a hidden page's timers and progress events
            // are not to be trusted on iOS, and a desktop background tab is
            // left to finish in peace.
            if (isHidden()) {
                lastActivityAt = now
                return
            }

            const limit = uploadDone ? RESPONSE_TIMEOUT_MS : INACTIVITY_TIMEOUT_MS
            if (now - lastActivityAt > limit || now - startedAt > ATTEMPT_HARD_CAP_MS) {
                stoppedBy = "watchdog"
                xhr.abort()
            }
        }, WATCHDOG_TICK_MS)

        xhr.open(req.method, req.url)

        // Exactly what was signed, nothing more. An extra header changes the
        // request the signature was computed over and R2 returns 403. (A part
        // is signed for `host` alone, so it sends none.)
        for (const [name, value] of Object.entries(req.headers)) {
            xhr.setRequestHeader(name, value)
        }

        xhr.send(req.body)
    })
}

/**
 * Attempts until one succeeds or the policy says stop, and throws the
 * {@link UploadError} that explains the stop. Resolves with the ETag when
 * `req.readEtag` asked for it.
 *
 *   - offline → OFFLINE, before the first attempt or instead of a retry
 *   - an expired (or nearly expired) URL → SIGNATURE_REJECTED, unattempted:
 *     R2 can answer an expired URL with a 403 that has no CORS headers, which
 *     the browser reports as a plain error — and that would be three useless
 *     re-uploads of an 80 MB file
 *   - NETWORK / TIMEOUT / SERVER → retried with backoff, `maxAttempts` in all
 *   - BACKGROUNDED → retried for free (up to 3), once the page is visible
 *     again: relaunched while still hidden, it dies the same way. A FIRST
 *     attempt never waits — a desktop background tab uploads fine
 *   - SIGNATURE_REJECTED / CLIENT / CANCELLED → never retried here
 */
async function sendWithRetries(
    req: PutRequest,
    {
        maxAttempts,
        signal,
        onProgress,
    }: {
        maxAttempts: number
        signal?: AbortSignal
        onProgress?: (loaded: number, meta: UploadProgressMeta) => void
    }
): Promise<string | null> {
    const startedAt = Date.now()
    const attempts: AttemptRecord[] = []
    const stop = (code: UploadErrorCode) =>
        new UploadError(code, {
            url: req.url,
            totalBytes: req.body.size,
            attempts,
            startedAt,
            part: req.part,
        })

    let budgetUsed = 0
    let resumes = 0
    let resuming = false

    for (let n = 1; ; n++) {
        if (signal?.aborted) throw stop("CANCELLED")
        if (isOffline()) throw stop("OFFLINE")
        if (req.expiresAt !== undefined && Date.now() / 1000 > req.expiresAt - EXPIRY_MARGIN_S) {
            throw stop("SIGNATURE_REJECTED")
        }

        const meta: UploadProgressMeta = {
            attempt: budgetUsed + 1,
            maxAttempts,
            ...(resuming ? { resuming: true } : {}),
        }
        // A retry starts from nothing — say so, rather than a silent jump.
        if (n > 1) onProgress?.(0, meta)

        const result = await sendOnce(req, n, (loaded) => onProgress?.(loaded, meta), signal)
        if (result.ok) return result.etag

        attempts.push(result.record)
        const { code } = result.record

        if (code === "CANCELLED") throw stop(code)

        if (code === "BACKGROUNDED") {
            if (resumes >= MAX_BACKGROUNDED_RETRIES) throw stop(code)
            resumes++
            if (!(await waitUntilVisible(signal))) throw stop("CANCELLED")
            if (!(await sleep(RESUME_SETTLE_MS, signal))) throw stop("CANCELLED")
            if (isOffline() && !(await waitForOnline(ONLINE_GRACE_MS, signal))) {
                throw stop("CANCELLED")
            }
            resuming = true
            continue
        }

        budgetUsed++
        const retryable = code === "NETWORK" || code === "TIMEOUT" || code === "SERVER"
        if (!retryable || budgetUsed >= maxAttempts) throw stop(code)
        if (isOffline()) throw stop("OFFLINE")
        if (!(await sleep(backoffMs(budgetUsed), signal))) throw stop("CANCELLED")
        resuming = false
    }
}

/** How a single PUT behaves, and what Sentry is told when it finally fails. */
export type PutOptions = {
    /** Total tries, retries included. Default 4 (1 try + 3 retries). */
    maxAttempts?: number
    /** Overrides for the failure report; "single" and the blob's kind otherwise. */
    telemetry?: { flow?: UploadFlow; kind?: UploadTelemetryKind }
    /**
     * False when the caller reports the failure itself — {@link uploadSignedBatch}
     * does, because it may still recover by re-signing.
     */
    reportFailure?: boolean
}

/**
 * Raw PUT of `blob` to `entry.upload_url`, retried and watched as described
 * on {@link sendWithRetries}.
 *
 * NO FormData: the object stored in the bucket is byte-for-byte the request
 * body, so a multipart envelope would be stored AS the file. The body is the
 * blob itself and the only header is the signed Content-Type.
 *
 * Resolves with nothing — R2 returns an empty 200. Everything the caller needs
 * is already on `entry`. Rejects with an {@link UploadError}.
 */
export async function putToR2(
    blob: Blob,
    entry: R2UploadEntry,
    onProgress?: UploadProgress,
    signal?: AbortSignal,
    options: PutOptions = {}
): Promise<void> {
    trackResumes()

    try {
        await sendWithRetries(
            {
                method: entry.method,
                url: entry.upload_url,
                headers: entry.headers,
                body: blob,
                expiresAt: entry.expires_at,
            },
            {
                maxAttempts: Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS),
                signal,
                onProgress: onProgress && ((loaded, meta) => onProgress(loaded, blob.size, meta)),
            }
        )
    } catch (err) {
        // The ONE place a single PUT's final failure is reported, which is
        // how every flow that calls this is covered without knowing it.
        if (options.reportFailure !== false && err instanceof UploadError) {
            const contentType = entry.headers["Content-Type"] ?? blob.type
            reportUploadFailure(err, {
                flow: options.telemetry?.flow ?? "single",
                kind:
                    options.telemetry?.kind ??
                    (contentType.startsWith("video/") ? "video" : "image"),
                contentType,
                size: blob.size,
            })
        }
        throw err
    }
}

/**
 * Runs a request on behalf of an upload. An aborted axios request rejects
 * with a `CanceledError`, but every caller listens for the shared sentinel,
 * so a cancel comes out as one.
 */
async function requestOrCancel<T>(run: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) throw new UploadError("CANCELLED")
    try {
        return await run()
    } catch (err) {
        if (signal?.aborted) throw new UploadError("CANCELLED")
        throw err
    }
}

// ── Batches: re-sign what is left ─────────────────────────────

/** One file of a batch, in config-request order. */
export type SignedBatchItem = {
    blob: Blob
    descriptor: UploadFileDescriptor
    /** This item's own bytes. */
    onProgress?: UploadProgress
    /** Fired once this item's object is fully uploaded. */
    onUploaded?: (entry: R2UploadEntry) => void
    /**
     * How to upload it — {@link putToR2} when omitted. A batch's video passes
     * {@link putVideoFor}, which goes multipart above the threshold.
     */
    put?: (
        blob: Blob,
        entry: R2UploadEntry,
        onProgress: UploadProgress | undefined,
        signal: AbortSignal | undefined,
        options: PutOptions
    ) => Promise<void>
}

/**
 * The flow's config request. `tempPostId` is set when re-signing a
 * posts/recruitments batch; pass it straight to {@link getUploadConfigApi}.
 */
export type SignBatch = (
    files: UploadFileDescriptor[],
    tempPostId?: string
) => Promise<UploadConfigResponse>

const expiresWithin = (entry: R2UploadEntry, seconds: number) =>
    typeof entry.expires_at === "number" && Date.now() / 1000 > entry.expires_at - seconds

/**
 * ONE config request for the batch, then every item uploaded in order — and
 * when a URL is about to expire, or R2 answers 403, ONE more config request
 * for whatever is left, after which it carries on where it stopped.
 *
 * The re-sign passes the batch's `temp_post_id` (posts/recruitments; chat
 * and the other types already have one folder per actor), so the new keys
 * land in the SAME folder and the server's same-folder thumbnail rule holds
 * for a pair split across the two requests.
 *
 * A re-sign must still satisfy the server's pairing rules, which refuse a
 * thumb with no parent in the same request. When what is left starts with a
 * thumb, its parent — already uploaded — is declared again in front of it as
 * an anchor. The URL signed for it is never used: nothing is re-uploaded, and
 * the anchor only makes the request one the server will sign.
 *
 * At most one re-sign per file; a second SIGNATURE_REJECTED on the same file
 * is final. Returns the entries ACTUALLY uploaded to, in item order — results
 * must be built from these, never from the first config response.
 *
 * Final failures are reported to Sentry here, not by the PUT, because this is
 * the layer that knows whether it was final.
 */
export async function uploadSignedBatch(
    items: SignedBatchItem[],
    { sign, signal, flow }: { sign: SignBatch; signal?: AbortSignal; flow: UploadFlow }
): Promise<{ entries: R2UploadEntry[]; tempPostId?: string }> {
    const descriptors = items.map((item) => item.descriptor)

    const config = await requestOrCancel(() => sign(descriptors), signal)
    if (config.uploads?.length !== items.length) throw new Error("Upload config mismatch")

    const tempPostId = config.temp_post_id
    const entries = [...config.uploads]
    const resigned = new Set<number>()

    const resign = async (from: number) => {
        const anchor = from > 0 && items[from].descriptor.kind === "thumb" ? from - 1 : from
        const fresh = await requestOrCancel(
            () => sign(descriptors.slice(anchor), tempPostId),
            signal
        )
        if (fresh.uploads?.length !== items.length - anchor) {
            throw new Error("Upload config mismatch")
        }
        for (let i = from; i < items.length; i++) {
            entries[i] = fresh.uploads[i - anchor]
            resigned.add(i)
        }
    }

    for (let i = 0; i < items.length; i++) {
        const item = items[i]
        const put = item.put ?? putToR2
        const options: PutOptions = {
            telemetry: { flow, kind: item.descriptor.kind },
            reportFailure: false,
        }

        try {
            if (signal?.aborted) throw new UploadError("CANCELLED")

            if (!resigned.has(i) && expiresWithin(entries[i], RESIGN_MARGIN_S)) {
                await resign(i)
            }

            try {
                await put(item.blob, entries[i], item.onProgress, signal, options)
            } catch (err) {
                const recoverable =
                    err instanceof UploadError &&
                    err.code === "SIGNATURE_REJECTED" &&
                    !resigned.has(i)
                if (!recoverable) throw err
                await resign(i)
                await put(item.blob, entries[i], item.onProgress, signal, options)
            }
        } catch (err) {
            if (err instanceof UploadError) {
                reportUploadFailure(err, {
                    flow,
                    kind: err.part !== undefined ? "part" : item.descriptor.kind,
                    contentType: item.descriptor.content_type,
                    size: item.blob.size,
                })
            }
            throw err
        }

        item.onUploaded?.(entries[i])
    }

    return { entries, tempPostId }
}

// ── Large videos: multipart ───────────────────────────────────

/**
 * Above this a video goes up in parts. Below it a single PUT is one or two
 * minutes even on a poor uplink, and the retry policy already covers it.
 */
export const MULTIPART_THRESHOLD_BYTES = 16 * 1024 * 1024

const MULTIPART_CREATE_URL = "/user/upload/multipart/create"
const MULTIPART_COMPLETE_URL = "/user/upload/multipart/complete"
const MULTIPART_ABORT_URL = "/user/upload/multipart/abort"

type MultipartSession = {
    upload_id: string
    key: string
    public_url: string
    /** EXACTLY the slice size: R2 needs every part but the last to match it. */
    part_size: number
    expires_in?: number
    expires_at?: number
    parts: { part_number: number; upload_url: string }[]
}

function checkedSession(session: MultipartSession, total: number): MultipartSession {
    const count = session?.part_size > 0 ? Math.ceil(total / session.part_size) : 0
    const numbered = session?.parts?.every((part, i) => part.part_number === i + 1)
    if (!count || session.parts?.length !== count || !numbered) {
        throw new Error("Upload config mismatch")
    }
    return session
}

export type PutVideoOptions = PutOptions & {
    /** The type the video's entry was signed as. */
    type: MediaUploadType
    orgId?: string
    onProgress?: UploadProgress
    signal?: AbortSignal
}

/**
 * Upload an encoded video to its batch entry: one PUT up to
 * {@link MULTIPART_THRESHOLD_BYTES}, parts above it.
 *
 * The multipart upload REUSES `entry.key` — the key the signature endpoint
 * issued for this batch — so the video lands in its poster's folder and the
 * server's same-folder rule holds exactly as for a single PUT. `public_url`
 * and `key` on the entry stay the video's.
 */
export async function putVideoToR2(
    blob: Blob,
    entry: R2UploadEntry,
    options: PutVideoOptions
): Promise<void> {
    const { onProgress, signal, ...putOptions } = options
    if (blob.size <= MULTIPART_THRESHOLD_BYTES) {
        return putToR2(blob, entry, onProgress, signal, putOptions)
    }

    trackResumes()

    try {
        await putMultipart(blob, entry, options)
    } catch (err) {
        if (options.reportFailure !== false && err instanceof UploadError) {
            reportUploadFailure(err, {
                flow: options.telemetry?.flow ?? "single",
                kind: err.part !== undefined ? "part" : "video",
                contentType: entry.headers["Content-Type"] ?? blob.type,
                size: blob.size,
            })
        }
        throw err
    }
}

/**
 * {@link putVideoToR2} as a batch item's `put`, for a video signed as `type`.
 */
export function putVideoFor(type: MediaUploadType, orgId?: string): SignedBatchItem["put"] {
    return (blob, entry, onProgress, signal, options) =>
        putVideoToR2(blob, entry, { ...options, type, orgId, onProgress, signal })
}

/**
 * Parts go up ONE AT A TIME — the gain here is retryability, not speed — each
 * through the same attempt loop as a whole PUT (backoff, inactivity, expiry,
 * BACKGROUNDED). A part killed because the phone locked is retried once the
 * app is visible again, so the video RESUMES at that part.
 *
 * A part answered 403 (or past its expiry) gets fresh URLs for the SAME
 * upload, once, and the loop carries on from that part; the parts already
 * sent still count. Completion sends every part's ETag. A final failure or a
 * cancel aborts the upload — best-effort, never in place of the real error.
 */
async function putMultipart(
    blob: Blob,
    entry: R2UploadEntry,
    { type, orgId, onProgress, signal, maxAttempts }: PutVideoOptions
): Promise<void> {
    const total = blob.size
    const owner = orgId ? { org_id: orgId } : {}
    const budget = Math.max(1, maxAttempts ?? DEFAULT_MAX_ATTEMPTS)
    const config = signal ? { signal } : undefined

    if (signal?.aborted) throw new UploadError("CANCELLED")
    if (isOffline()) {
        throw new UploadError("OFFLINE", { url: entry.upload_url, totalBytes: total })
    }

    const create = async (uploadId?: string): Promise<MultipartSession> => {
        const sentAt = Date.now()
        const res = await requestOrCancel(
            () =>
                api.post(
                    MULTIPART_CREATE_URL,
                    {
                        type,
                        ...owner,
                        key: entry.key,
                        content_type: entry.headers["Content-Type"] ?? "video/mp4",
                        size_bytes: total,
                        ...(uploadId ? { upload_id: uploadId } : {}),
                    },
                    config
                ),
            signal
        )
        return checkedSession(onLocalClock(res.data.data as MultipartSession, sentAt), total)
    }

    let session = await create()

    try {
        const etags: string[] = []
        let resigned = false

        for (let index = 0; index < session.parts.length; ) {
            const start = index * session.part_size
            const end = Math.min(start + session.part_size, total)
            const url = session.parts[index].upload_url

            try {
                const etag = await sendWithRetries(
                    {
                        method: "PUT",
                        url,
                        // Signed for `host` alone: no header may be added.
                        headers: {},
                        // Typeless on purpose — a slice has type "", so the
                        // browser adds no Content-Type of its own.
                        body: blob.slice(start, end),
                        expiresAt: session.expires_at,
                        readEtag: true,
                        part: index + 1,
                    },
                    {
                        maxAttempts: budget,
                        signal,
                        // One bar for the whole video; a retried part drops
                        // back to where that part began, not to zero.
                        onProgress:
                            onProgress &&
                            ((loaded, meta) => onProgress(start + loaded, total, meta)),
                    }
                )

                // R2 always sends an ETag. Unreadable means the bucket's CORS
                // policy does not expose it — and nothing can complete.
                if (!etag) {
                    throw new UploadError("CONFIG_MISMATCH", {
                        url,
                        totalBytes: end - start,
                        part: index + 1,
                    })
                }

                etags[index] = etag
                index++
            } catch (err) {
                if (err instanceof UploadError && err.code === "SIGNATURE_REJECTED" && !resigned) {
                    resigned = true
                    session = await create(session.upload_id)
                    continue
                }
                throw err
            }
        }

        await requestOrCancel(
            () =>
                api.post(
                    MULTIPART_COMPLETE_URL,
                    {
                        ...owner,
                        key: session.key,
                        upload_id: session.upload_id,
                        parts: etags.map((etag, i) => ({ part_number: i + 1, etag })),
                    },
                    config
                ),
            signal
        )
    } catch (err) {
        // Fire and forget: the caller needs the real error now, and the
        // bucket's abort rule clears anything this misses within days.
        void api
            .post(MULTIPART_ABORT_URL, {
                ...owner,
                key: session.key,
                upload_id: session.upload_id,
            })
            .catch(() => {})
        throw err
    }
}

// ── Fixed-key media ───────────────────────────────────────────

/**
 * Stamp a fixed-key URL so a replacement is actually seen.
 *
 * profile / cover / logo / org-cover each live at ONE key per actor and are
 * overwritten in place, so the URL never changes and the browser keeps painting
 * the image it already cached. The server stores its own ?v= for exactly this
 * reason, but it does not return the stored URL, so an optimistic cache write
 * has to stamp its own — the two point at the same object either way, since
 * ?v= is stripped when the key is read back out.
 *
 * Send the BARE `public_url` in the attach payload; this is for display only.
 */
export function withCacheBust(url: string): string {
    if (!url) return url
    return `${url.split("?v=")[0]}?v=${Date.now()}`
}

/** True when a URL already carries a server-issued cache-buster. */
export function hasCacheBust(url: string): boolean {
    return Boolean(url) && url.includes("?v=")
}
