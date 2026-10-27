// @vitest-environment jsdom

/**
 * The upload pipeline against a fake XMLHttpRequest, fake timers, and a page
 * whose visibility and connectivity the tests control — which is to say, an
 * iPhone on demand: screen locks, app switches, dead networks, expired URLs.
 *
 * Each test runs an hour after the previous one on the fake clock. The module
 * remembers when the page last came back on screen (an error within 2 s of
 * that is the suspension's, not the network's), and an hour apart no test can
 * inherit another's "just resumed".
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const sentry = vi.hoisted(() => ({
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
}))
vi.mock("@sentry/nextjs", () => sentry)

const api = vi.hoisted(() => ({ post: vi.fn() }))
vi.mock("@/core/api/axios", () => ({ default: api }))

// apiError.ts reads only this constant from the encoder; the real module
// would drag mediabunny into a test about XHRs.
vi.mock("@/shared/services/videoEncode", () => ({ ENCODE_CANCELLED: "upload_cancelled" }))

import { isUploadCancellation } from "@/shared/services/apiError"
import {
    MULTIPART_THRESHOLD_BYTES,
    UPLOAD_CANCELLED,
    UploadError,
    getUploadConfigApi,
    isUploadCancelled,
    putToR2,
    putVideoToR2,
    uploadSignedBatch,
    type R2UploadEntry,
    type SignedBatchItem,
    type UploadFileDescriptor,
} from "@/shared/services/mediaUpload"

// ── A fake XMLHttpRequest the tests drive by hand ─────────────

class FakeXHR extends EventTarget {
    static instances: FakeXHR[] = []

    upload = new EventTarget()
    method = ""
    url = ""
    headers: Record<string, string> = {}
    body: unknown = null
    status = 0
    aborted = false
    private responseHeaders: Record<string, string> = {}

    constructor() {
        super()
        FakeXHR.instances.push(this)
    }

    open(method: string, url: string) {
        this.method = method
        this.url = url
    }

    setRequestHeader(name: string, value: string) {
        this.headers[name] = value
    }

    send(body: unknown) {
        this.body = body
    }

    abort() {
        this.aborted = true
        this.dispatchEvent(new Event("abort"))
    }

    getResponseHeader(name: string) {
        return this.responseHeaders[name.toLowerCase()] ?? null
    }

    // ── drivers ──
    progress(loaded: number, total: number) {
        this.upload.dispatchEvent(
            new ProgressEvent("progress", { loaded, total, lengthComputable: true })
        )
    }

    respond(status: number, headers: Record<string, string> = {}) {
        this.upload.dispatchEvent(new Event("load"))
        this.status = status
        this.responseHeaders = Object.fromEntries(
            Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
        )
        this.dispatchEvent(new Event("load"))
    }

    fail() {
        this.dispatchEvent(new Event("error"))
    }
}

const xhrs = () => FakeXHR.instances
const lastXhr = () => FakeXHR.instances[FakeXHR.instances.length - 1]

// ── The page: visibility and connectivity on demand ───────────

let visibility: DocumentVisibilityState = "visible"
let online = true

function setVisibility(next: DocumentVisibilityState) {
    visibility = next
    document.dispatchEvent(new Event("visibilitychange"))
}

// ── Fixtures ──────────────────────────────────────────────────

const ORIGIN = "https://acct.r2.cloudflarestorage.com"
const SIGNED_QUERY =
    "X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=KEYID&X-Amz-Signature=deadbeef"
const TEMP = "0f6a1c9e-2b7d-4e35-9a11-bb22cc33dd44"
const MiB = 1024 * 1024

const nowS = () => Math.floor(Date.now() / 1000)

function entry(over: Partial<R2UploadEntry> = {}): R2UploadEntry {
    const key = over.key ?? "users/1/posts/t/a.webp"
    return {
        method: "PUT",
        upload_url: `${ORIGIN}/goatza-media/${key}?${SIGNED_QUERY}`,
        key,
        public_url: `https://media.goatza.test/${key}`,
        headers: { "Content-Type": "image/webp" },
        expires_in: 3600,
        expires_at: nowS() + 3600,
        ...over,
    }
}

const blob = (size = 1000, type = "image/webp") =>
    new Blob([new Uint8Array(size)], { type })

const descriptor = (kind: UploadFileDescriptor["kind"], size = 1000): UploadFileDescriptor => ({
    content_type: kind === "video" ? "video/mp4" : "image/webp",
    size_bytes: size,
    kind,
})

/** Never let a rejection go unhandled while timers are being advanced. */
const settle = (promise: Promise<unknown>) =>
    promise.then(
        () => null,
        (err: unknown) => err as UploadError
    )

const flush = () => vi.advanceTimersByTimeAsync(0)

let clockBase = Date.UTC(2026, 9, 28, 0, 0, 0)

beforeEach(() => {
    vi.useFakeTimers({
        toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
    })
    clockBase += 60 * 60 * 1000
    vi.setSystemTime(clockBase)
    vi.spyOn(Math, "random").mockReturnValue(0.5) // jitter = 250 ms

    FakeXHR.instances = []
    vi.stubGlobal("XMLHttpRequest", FakeXHR)

    visibility = "visible"
    online = true
    Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => visibility,
    })
    Object.defineProperty(navigator, "onLine", {
        configurable: true,
        get: () => online,
    })

    sentry.captureException.mockClear()
    sentry.addBreadcrumb.mockClear()
    api.post.mockReset()
})

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

// ── putToR2 ───────────────────────────────────────────────────

describe("putToR2", () => {
    it("sends the raw blob with only the signed header, and resolves on 2xx", async () => {
        const progress = vi.fn()
        const body = blob()
        const done = settle(putToR2(body, entry(), progress))

        const xhr = lastXhr()
        expect(xhr.method).toBe("PUT")
        expect(xhr.headers).toEqual({ "Content-Type": "image/webp" })
        expect(xhr.body).toBe(body)

        xhr.progress(400, 1000)
        expect(progress).toHaveBeenLastCalledWith(400, 1000, { attempt: 1, maxAttempts: 4 })

        xhr.respond(200)
        expect(await done).toBeNull()
        expect(xhrs()).toHaveLength(1)
        expect(sentry.captureException).not.toHaveBeenCalled()
    })

    it("retries a network error after a backoff, and says it is retrying", async () => {
        const progress = vi.fn()
        const done = settle(putToR2(blob(), entry(), progress))

        xhrs()[0].fail()
        await vi.advanceTimersByTimeAsync(1000)
        expect(xhrs()).toHaveLength(1) // still backing off (1 s + 250 ms jitter)

        await vi.advanceTimersByTimeAsync(300)
        expect(xhrs()).toHaveLength(2)
        expect(progress).toHaveBeenLastCalledWith(0, 1000, { attempt: 2, maxAttempts: 4 })

        xhrs()[1].respond(200)
        expect(await done).toBeNull()
        expect(sentry.captureException).not.toHaveBeenCalled()
    })

    it("a cancel during the backoff is a CANCELLED at once, silent everywhere", async () => {
        const controller = new AbortController()
        const done = settle(putToR2(blob(), entry(), undefined, controller.signal))

        xhrs()[0].fail()
        await vi.advanceTimersByTimeAsync(300)
        controller.abort()

        const err = await done
        expect(err).toBeInstanceOf(UploadError)
        expect(err?.code).toBe("CANCELLED")
        expect(err?.message).toBe(UPLOAD_CANCELLED)
        expect(isUploadCancellation(err)).toBe(true)
        expect(isUploadCancelled(err)).toBe(true)
        expect(xhrs()).toHaveLength(1)
        expect(sentry.captureException).not.toHaveBeenCalled()
    })

    it("an error while hidden is BACKGROUNDED: it waits for the page, then resumes for free", async () => {
        const progress = vi.fn()
        // A budget of ONE: a network error would be final. A suspension is not.
        const done = settle(putToR2(blob(), entry(), progress, undefined, { maxAttempts: 1 }))

        setVisibility("hidden")
        xhrs()[0].fail()

        // Relaunched while still hidden, it would die the same way — so no.
        await vi.advanceTimersByTimeAsync(30_000)
        expect(xhrs()).toHaveLength(1)

        setVisibility("visible")
        await vi.advanceTimersByTimeAsync(400)
        expect(xhrs()).toHaveLength(1) // letting the network come back first

        await vi.advanceTimersByTimeAsync(200)
        expect(xhrs()).toHaveLength(2)
        expect(progress).toHaveBeenLastCalledWith(0, 1000, {
            attempt: 1,
            maxAttempts: 1,
            resuming: true,
        })

        xhrs()[1].respond(200)
        expect(await done).toBeNull()
    })

    it("an error right after the page comes back is the suspension's, not the network's", async () => {
        // Install the resume tracker with one finished upload.
        const warmup = settle(putToR2(blob(), entry()))
        lastXhr().respond(200)
        await warmup

        setVisibility("hidden")
        setVisibility("visible")

        // A request on a pooled connection iOS killed while frozen: it fails
        // at once, on a page that was never hidden during THIS attempt.
        const done = settle(putToR2(blob(), entry(), undefined, undefined, { maxAttempts: 1 }))
        lastXhr().fail()
        await vi.advanceTimersByTimeAsync(600)

        expect(xhrs()).toHaveLength(3) // retried, with no budget left to spend
        lastXhr().respond(200)
        expect(await done).toBeNull()
    })

    it("a page that keeps being hidden gets three free resumes, then the error is final", async () => {
        const done = settle(putToR2(blob(), entry()))

        for (let i = 0; i < 4; i++) {
            setVisibility("hidden")
            lastXhr().fail()
            setVisibility("visible")
            await vi.advanceTimersByTimeAsync(600)
        }

        const err = await done
        expect(err?.code).toBe("BACKGROUNDED")
        expect(err?.attempts).toHaveLength(4)
        expect(err?.attempts.every((a) => a.hiddenDuringAttempt)).toBe(true)
        expect(err?.hint).toContain("the page was hidden")
        expect(err?.message).toContain("(UPLOAD_BACKGROUNDED)")
    })

    it("a cancel while waiting for the page to come back is a CANCELLED", async () => {
        const controller = new AbortController()
        const done = settle(putToR2(blob(), entry(), undefined, controller.signal))

        setVisibility("hidden")
        xhrs()[0].fail()
        await vi.advanceTimersByTimeAsync(5000)
        controller.abort()

        const err = await done
        expect(err?.code).toBe("CANCELLED")
        expect(isUploadCancellation(err)).toBe(true)
        expect(xhrs()).toHaveLength(1)
        expect(sentry.captureException).not.toHaveBeenCalled()
    })

    it("403 is SIGNATURE_REJECTED and is never retried here", async () => {
        const done = settle(putToR2(blob(), entry()))

        xhrs()[0].respond(403)
        const err = await done

        expect(err?.code).toBe("SIGNATURE_REJECTED")
        expect(err?.status).toBe(403)
        await vi.advanceTimersByTimeAsync(10_000)
        expect(xhrs()).toHaveLength(1)
    })

    it("an expired URL is SIGNATURE_REJECTED without a single attempt", async () => {
        // 10 s left is inside the 30 s margin: three re-uploads of an 80 MB
        // file into a 403 the browser cannot even read are not attempted.
        const err = await settle(putToR2(blob(), entry({ expires_at: nowS() + 10 })))

        expect(err?.code).toBe("SIGNATURE_REJECTED")
        expect(err?.attempts).toHaveLength(0)
        expect(xhrs()).toHaveLength(0)
    })

    it("500 four times is SERVER after four attempts, reported once", async () => {
        const done = settle(putToR2(blob(), entry()))

        for (let i = 0; i < 4; i++) {
            expect(xhrs()).toHaveLength(i + 1)
            lastXhr().respond(500)
            await vi.advanceTimersByTimeAsync(5000)
        }

        const err = await done
        expect(err?.code).toBe("SERVER")
        expect(err?.status).toBe(500)
        expect(err?.attempts).toHaveLength(4)
        expect(err?.attempts.map((a) => a.status)).toEqual([500, 500, 500, 500])
        expect(xhrs()).toHaveLength(4)

        expect(sentry.captureException).toHaveBeenCalledTimes(1)
        const [reported, context] = sentry.captureException.mock.calls[0]
        expect(reported).toBe(err)
        expect(context.tags).toMatchObject({
            "upload.flow": "single",
            "upload.kind": "image",
            "upload.code": "SERVER",
            "upload.status": "500",
            "upload.attempts": "4",
        })
        expect(sentry.addBreadcrumb).toHaveBeenCalledTimes(4)
    })

    it("another 4xx is CLIENT and is not retried", async () => {
        const done = settle(putToR2(blob(), entry()))

        xhrs()[0].respond(400)
        const err = await done

        expect(err?.code).toBe("CLIENT")
        await vi.advanceTimersByTimeAsync(10_000)
        expect(xhrs()).toHaveLength(1)
    })

    it("no progress for 60 s is a TIMEOUT and is retried; slow but moving is never killed", async () => {
        const done = settle(putToR2(blob(2000), entry()))
        const first = xhrs()[0]

        first.progress(500, 2000)
        await vi.advanceTimersByTimeAsync(30_000)
        first.progress(800, 2000) // slow, but moving
        await vi.advanceTimersByTimeAsync(59_000)
        expect(first.aborted).toBe(false)

        await vi.advanceTimersByTimeAsync(2000) // 61 s since the last byte
        expect(first.aborted).toBe(true)

        await vi.advanceTimersByTimeAsync(2000) // the backoff
        expect(xhrs()).toHaveLength(2)

        xhrs()[1].respond(200)
        expect(await done).toBeNull()
    })

    it("the inactivity watchdog does not run while the page is hidden", async () => {
        const done = settle(putToR2(blob(), entry()))

        setVisibility("hidden")
        await vi.advanceTimersByTimeAsync(5 * 60_000)
        expect(xhrs()[0].aborted).toBe(false)

        setVisibility("visible")
        xhrs()[0].respond(200)
        expect(await done).toBeNull()
    })

    it("offline before starting is OFFLINE with zero attempts", async () => {
        online = false

        const err = await settle(putToR2(blob(), entry()))

        expect(err?.code).toBe("OFFLINE")
        expect(err?.attempts).toHaveLength(0)
        expect(err?.message).toContain("(UPLOAD_OFFLINE)")
        expect(xhrs()).toHaveLength(0)
    })

    it("going offline after a failure stops the retries", async () => {
        const done = settle(putToR2(blob(), entry()))

        online = false
        xhrs()[0].fail()
        const err = await done

        expect(err?.code).toBe("OFFLINE")
        expect(err?.attempts).toHaveLength(1)
        expect(err?.attempts[0].online).toBe(false)
        expect(xhrs()).toHaveLength(1)
    })

    it("tells the three status-less failures apart in the hint", async () => {
        const run = async (sent: number) => {
            const done = settle(putToR2(blob(1000), entry(), undefined, undefined, { maxAttempts: 1 }))
            if (sent) lastXhr().progress(sent, 1000)
            lastXhr().fail()
            return done
        }

        expect((await run(1000))?.hint).toContain("all bytes were sent")
        expect((await run(0))?.hint).toContain("no bytes were sent")
        expect((await run(400))?.hint).toContain("connection dropped mid-transfer")
    })

    it("never hands Sentry a URL's query string — origin only", async () => {
        const done = settle(putToR2(blob(), entry(), undefined, undefined, { maxAttempts: 2 }))

        lastXhr().fail()
        await vi.advanceTimersByTimeAsync(2000)
        lastXhr().fail()
        const err = await done

        expect(err?.host).toBe(ORIGIN)
        const sent = JSON.stringify([
            sentry.captureException.mock.calls,
            sentry.addBreadcrumb.mock.calls,
            err?.message,
            err?.hint,
        ])
        expect(sent).toContain(ORIGIN)
        expect(sent).not.toContain("X-Amz")
        expect(sent).not.toContain("deadbeef")
        expect(sent).not.toContain("goatza-media/")
    })
})

// ── getUploadConfigApi ────────────────────────────────────────

describe("getUploadConfigApi", () => {
    it("sends temp_post_id and re-measures each expiry on this device's clock", async () => {
        // The server's clock is irrelevant: expires_in is anchored to when the
        // request was sent here, so a phone hours off still gets an hour.
        api.post.mockResolvedValue({
            data: {
                data: {
                    provider: "r2",
                    temp_post_id: TEMP,
                    uploads: [{ ...entry(), expires_in: 3600, expires_at: 1 }],
                },
            },
        })

        const config = await getUploadConfigApi("posts", [descriptor("image")], undefined, undefined, TEMP)

        expect(api.post).toHaveBeenCalledWith(
            "/user/get/upload/signature",
            { type: "posts", temp_post_id: TEMP, files: [descriptor("image")] },
            undefined
        )
        expect(config.uploads[0].expires_at).toBe(nowS() + 3600)
    })
})

// ── uploadSignedBatch ─────────────────────────────────────────

describe("uploadSignedBatch", () => {
    const pair = (): SignedBatchItem[] => [
        { blob: blob(), descriptor: descriptor("image") },
        { blob: blob(100), descriptor: descriptor("thumb", 100) },
    ]

    it("re-signs an expiring entry once, into the same folder, and returns what was really used", async () => {
        const items = pair()
        const sign = vi
            .fn()
            .mockResolvedValueOnce({
                provider: "r2",
                temp_post_id: TEMP,
                uploads: [
                    entry({ key: `users/1/posts/${TEMP}/img.webp` }),
                    // The thumb's URL has 20 s left — inside the 60 s re-sign margin.
                    entry({ key: `users/1/posts/${TEMP}/thumb.webp`, expires_at: nowS() + 20 }),
                ],
            })
            .mockResolvedValueOnce({
                provider: "r2",
                temp_post_id: TEMP,
                uploads: [
                    entry({ key: `users/1/posts/${TEMP}/anchor.webp` }),
                    entry({ key: `users/1/posts/${TEMP}/thumb-2.webp` }),
                ],
            })

        const done = uploadSignedBatch(items, { sign, flow: "post" })
        await flush()
        lastXhr().respond(200) // the image, on its original URL
        await flush()

        // One more request, naming the same batch. The image is declared
        // again in front of its thumb — a thumb alone is refused — but its
        // new URL is never used.
        expect(sign).toHaveBeenCalledTimes(2)
        expect(sign).toHaveBeenNthCalledWith(2, [items[0].descriptor, items[1].descriptor], TEMP)
        expect(xhrs()).toHaveLength(2)
        expect(lastXhr().url).toContain("thumb-2.webp")

        lastXhr().respond(200)
        const { entries, tempPostId } = await done

        expect(tempPostId).toBe(TEMP)
        expect(entries.map((e) => e.key)).toEqual([
            `users/1/posts/${TEMP}/img.webp`,
            `users/1/posts/${TEMP}/thumb-2.webp`,
        ])
    })

    it("a 403 re-signs and retries the same file; a second 403 on it is final", async () => {
        const sign = vi
            .fn()
            .mockResolvedValueOnce({ provider: "r2", uploads: [entry({ key: "chat/users/1/a.webp" }), entry({ key: "chat/users/1/b.webp" })] })
            .mockResolvedValueOnce({ provider: "r2", uploads: [entry({ key: "chat/users/1/c.webp" }), entry({ key: "chat/users/1/d.webp" })] })

        const done = settle(uploadSignedBatch(pair(), { sign, flow: "chat" }))
        await flush()
        lastXhr().respond(403)
        await flush()

        // No batch folder for chat: no temp id to pass.
        expect(sign).toHaveBeenNthCalledWith(2, [descriptor("image"), descriptor("thumb", 100)], undefined)
        expect(lastXhr().url).toContain("chat/users/1/c.webp")

        lastXhr().respond(403)
        const err = await done

        expect(err?.code).toBe("SIGNATURE_REJECTED")
        expect(sign).toHaveBeenCalledTimes(2)
        expect(xhrs()).toHaveLength(2)
        // Reported once, by the batch — the PUTs deferred to it.
        expect(sentry.captureException).toHaveBeenCalledTimes(1)
        expect(sentry.captureException.mock.calls[0][1].tags["upload.flow"]).toBe("chat")
    })

    it("a cancel during the config request comes out as the shared sentinel", async () => {
        const controller = new AbortController()
        const sign = vi.fn(() => {
            controller.abort()
            return Promise.reject(new Error("canceled"))
        })

        const err = await settle(uploadSignedBatch(pair(), { sign, signal: controller.signal, flow: "post" }))

        expect(err?.message).toBe(UPLOAD_CANCELLED)
        expect(isUploadCancellation(err)).toBe(true)
    })
})

// ── putVideoToR2 (multipart) ──────────────────────────────────

describe("putVideoToR2", () => {
    const SIZE = 2 * 8 * MiB + MiB // three parts: 8 + 8 + 1
    const KEY = `users/1/posts/${TEMP}/video.mp4`
    const CREATE = "/user/upload/multipart/create"
    const COMPLETE = "/user/upload/multipart/complete"
    const ABORT = "/user/upload/multipart/abort"

    /** A video too big to allocate for a test: a size and slices of it. */
    function bigVideo(size = SIZE): Blob {
        return {
            size,
            type: "video/mp4",
            slice: (start = 0, end = size) => ({ size: end - start, type: "", start, end }),
        } as unknown as Blob
    }

    const videoEntry = () =>
        entry({ key: KEY, headers: { "Content-Type": "video/mp4" } })

    beforeEach(() => {
        api.post.mockImplementation(async (url: string, body: Record<string, unknown>) => {
            if (url === CREATE) {
                const uploadId = (body.upload_id as string | undefined) ?? "up-1"
                return {
                    data: {
                        data: {
                            upload_id: uploadId,
                            key: body.key,
                            public_url: `https://media.goatza.test/${body.key}`,
                            part_size: 8 * MiB,
                            expires_in: 3600,
                            expires_at: nowS() + 3600,
                            parts: [1, 2, 3].map((n) => ({
                                part_number: n,
                                upload_url: `${ORIGIN}/goatza-media/${body.key}?partNumber=${n}&uploadId=${uploadId}&${SIGNED_QUERY}`,
                            })),
                        },
                    },
                }
            }
            if (url === COMPLETE) return { data: { data: { key: body.key } } }
            if (url === ABORT) return { data: { data: {} } }
            throw new Error(`unexpected ${url}`)
        })
    })

    const calls = (url: string) => api.post.mock.calls.filter(([u]) => u === url)

    it("at or below the threshold it is one PUT, with no multipart calls", async () => {
        const done = settle(
            putVideoToR2(blob(1000, "video/mp4"), videoEntry(), { type: "posts" })
        )

        expect(lastXhr().headers).toEqual({ "Content-Type": "video/mp4" })
        lastXhr().respond(200)
        expect(await done).toBeNull()
        expect(api.post).not.toHaveBeenCalled()
        expect(MULTIPART_THRESHOLD_BYTES).toBe(16 * MiB)
    })

    it("three parts in order, one retried; completes with the ETags ascending", async () => {
        const progress = vi.fn()
        const done = settle(putVideoToR2(bigVideo(), videoEntry(), { type: "posts", onProgress: progress }))
        await flush()

        expect(calls(CREATE)[0][1]).toEqual({
            type: "posts",
            key: KEY,
            content_type: "video/mp4",
            size_bytes: SIZE,
        })

        // Part 1: no headers at all — a part is signed for `host` alone.
        expect(lastXhr().url).toContain("partNumber=1")
        expect(lastXhr().headers).toEqual({})
        expect(lastXhr().body).toMatchObject({ start: 0, end: 8 * MiB })
        lastXhr().respond(200, { ETag: '"e1"' })
        await flush()

        // Part 2 fails once, then goes again — from part 2, not from zero.
        lastXhr().fail()
        await vi.advanceTimersByTimeAsync(2000)
        expect(lastXhr().url).toContain("partNumber=2")
        expect(progress).toHaveBeenCalledWith(8 * MiB, SIZE, { attempt: 2, maxAttempts: 4 })
        lastXhr().respond(200, { ETag: '"e2"' })
        await flush()

        expect(lastXhr().body).toMatchObject({ start: 16 * MiB, end: SIZE })
        lastXhr().respond(200, { ETag: '"e3"' })

        expect(await done).toBeNull()
        expect(calls(COMPLETE)[0][1]).toEqual({
            key: KEY,
            upload_id: "up-1",
            parts: [
                { part_number: 1, etag: '"e1"' },
                { part_number: 2, etag: '"e2"' },
                { part_number: 3, etag: '"e3"' },
            ],
        })
        expect(calls(ABORT)).toHaveLength(0)
    })

    it("a part that died while hidden resumes from that part once the app is back", async () => {
        const progress = vi.fn()
        const done = settle(putVideoToR2(bigVideo(), videoEntry(), { type: "posts", onProgress: progress }))
        await flush()

        lastXhr().respond(200, { ETag: '"e1"' })
        await flush()

        setVisibility("hidden")
        lastXhr().fail()
        await vi.advanceTimersByTimeAsync(60_000)
        expect(xhrs()).toHaveLength(2) // waiting for the page

        setVisibility("visible")
        await vi.advanceTimersByTimeAsync(600)
        expect(xhrs()).toHaveLength(3)
        expect(lastXhr().url).toContain("partNumber=2")
        expect(progress).toHaveBeenCalledWith(8 * MiB, SIZE, {
            attempt: 1,
            maxAttempts: 4,
            resuming: true,
        })

        lastXhr().respond(200, { ETag: '"e2"' })
        await flush()
        lastXhr().respond(200, { ETag: '"e3"' })

        expect(await done).toBeNull()
        expect(calls(CREATE)).toHaveLength(1) // resumed, never restarted
        expect((calls(COMPLETE)[0][1] as { parts: unknown[] }).parts).toHaveLength(3)
    })

    it("a part answered 403 gets fresh URLs for the SAME upload and carries on from that part", async () => {
        const done = settle(putVideoToR2(bigVideo(), videoEntry(), { type: "posts" }))
        await flush()

        lastXhr().respond(200, { ETag: '"e1"' })
        await flush()
        lastXhr().respond(403)
        await flush()

        expect(calls(CREATE)).toHaveLength(2)
        expect(calls(CREATE)[1][1]).toMatchObject({ key: KEY, upload_id: "up-1" })
        expect(lastXhr().url).toContain("partNumber=2")

        lastXhr().respond(200, { ETag: '"e2"' })
        await flush()
        lastXhr().respond(200, { ETag: '"e3"' })

        expect(await done).toBeNull()
        expect(calls(COMPLETE)[0][1]).toMatchObject({
            upload_id: "up-1",
            parts: [
                { part_number: 1, etag: '"e1"' },
                { part_number: 2, etag: '"e2"' },
                { part_number: 3, etag: '"e3"' },
            ],
        })
    })

    it("an unreadable ETag is CONFIG_MISMATCH, aborts the upload, and says to run r2_setup", async () => {
        const done = settle(putVideoToR2(bigVideo(), videoEntry(), { type: "posts" }))
        await flush()

        lastXhr().respond(200) // no ETag exposed by the bucket's CORS policy
        const err = await done

        expect(err?.code).toBe("CONFIG_MISMATCH")
        expect(err?.message).toContain("r2_setup --apply")
        expect(err?.part).toBe(1)
        expect(calls(ABORT)[0][1]).toEqual({ key: KEY, upload_id: "up-1" })
        expect(calls(COMPLETE)).toHaveLength(0)
        expect(sentry.captureException).toHaveBeenCalledTimes(1)
        expect(sentry.captureException.mock.calls[0][1].tags["upload.kind"]).toBe("part")
    })

    it("a cancel aborts the multipart upload and stays silent", async () => {
        const controller = new AbortController()
        const done = settle(
            putVideoToR2(bigVideo(), videoEntry(), { type: "posts", signal: controller.signal })
        )
        await flush()

        lastXhr().progress(1000, 8 * MiB)
        controller.abort()
        const err = await done

        expect(err?.code).toBe("CANCELLED")
        expect(isUploadCancellation(err)).toBe(true)
        expect(calls(ABORT)[0][1]).toEqual({ key: KEY, upload_id: "up-1" })
        expect(sentry.captureException).not.toHaveBeenCalled()
    })

    it("hands Sentry neither a part URL's query nor its upload id", async () => {
        const done = settle(putVideoToR2(bigVideo(), videoEntry(), { type: "posts", maxAttempts: 1 }))
        await flush()

        lastXhr().respond(500)
        const err = await done

        expect(err?.code).toBe("SERVER")
        const sent = JSON.stringify([
            sentry.captureException.mock.calls,
            sentry.addBreadcrumb.mock.calls,
        ])
        expect(sent).not.toContain("X-Amz")
        expect(sent).not.toContain("uploadId")
        expect(sent).toContain(ORIGIN)
    })
})
