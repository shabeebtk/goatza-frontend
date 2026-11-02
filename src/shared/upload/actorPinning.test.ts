// @vitest-environment jsdom
/**
 * A queued upload is pinned to the account it was posted as.
 *
 * The composer closes at once, so the author can switch account while a post
 * is still signing, uploading in parts and being created. These run the REAL
 * queue, post / highlight pipelines, uploaders and axios interceptor against a
 * recording adapter and a fake XMLHttpRequest that answers every PUT, switch
 * account right after Post, and check EVERY request still went out as the
 * original actor — the 401 refresh-and-retry included.
 */

import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from "axios"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const MB = 1024 * 1024

const refresh = vi.hoisted(() => ({ getFreshAccessToken: vi.fn() }))
const prep = vi.hoisted(() => ({
    checkVideoDuration: vi.fn(),
    prepareVideoForUpload: vi.fn(),
    prepareImageForUpload: vi.fn(),
    readVideoDuration: vi.fn(),
}))

vi.mock("@/core/auth/refreshManager", () => ({
    getFreshAccessToken: refresh.getFreshAccessToken,
    SessionExpiredError: class SessionExpiredError extends Error {},
}))
vi.mock("@/shared/services/videoPrep", () => prep)
vi.mock("@/shared/services/videoEncode", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/shared/services/videoEncode")>()),
    capturePoster: vi.fn(async () => new File([new Uint8Array(64)], "poster.jpg", { type: "image/jpeg" })),
}))
vi.mock("@/shared/services/mediaCapabilities", () => ({
    ensureMediaCapabilities: vi.fn(async () => ({ server_processing: false })),
}))
vi.mock("@/core/react-query/QueryProvider", () => ({
    queryClient: { invalidateQueries: vi.fn() },
}))
vi.mock("@/shared/hooks/useScreenWakeLock", () => ({ holdScreenWakeLock: () => () => {} }))

import api from "@/core/api/axios"
import { runHighlightUpload } from "@/features/highlights/services/highlightUpload.service"
import { runPostUpload } from "@/features/posts/services/postUpload.service"
import { useAuthStore } from "@/store/auth.store"
import { useUploadQueueStore } from "@/store/uploadQueue.store"
import { enqueueUpload } from "./uploadQueue"

// ── The network ───────────────────────────────────────────────

type Sent = { method?: string; url?: string; headers: Record<string, unknown> }
let sent: Sent[] = []
/** A path to answer 401 once (then normally). */
let unauthorizedOnce: string | null = null

const entry = (key: string) => ({
    method: "PUT",
    upload_url: `https://r2.test/${key}`,
    key,
    public_url: `https://media.goatza.test/${key}`,
    headers: { "Content-Type": "video/mp4" },
    expires_in: 3600,
})

function answer(config: InternalAxiosRequestConfig): unknown {
    const url = config.url ?? ""
    const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data
    if (url === "/user/get/upload/signature") {
        const files = body.files as { kind: string }[]
        return {
            provider: "r2",
            temp_post_id: "folder-1",
            uploads: files.map((f, i) =>
                entry(`organizations/org-1/posts/folder-1/${i}.${f.kind === "source" ? "src.mp4" : "mp4"}`)
            ),
        }
    }
    if (url === "/user/upload/multipart/create") {
        const parts = Math.ceil(body.size_bytes / (8 * MB))
        return {
            upload_id: "up-1",
            key: body.key,
            public_url: `https://media.goatza.test/${body.key}`,
            part_size: 8 * MB,
            expires_in: 3600,
            parts: Array.from({ length: parts }, (_, i) => ({
                part_number: i + 1,
                upload_url: `https://r2.test/part/${i + 1}`,
            })),
        }
    }
    if (url === "/media/jobs") return { job: { id: "job-1", status: "queued" } }
    if (url === "/posts/create") return { post_id: "post-1" }
    if (url === "/highlights/create") return { id: "h-1" }
    return {}
}

class FakeXHR extends EventTarget {
    upload = new EventTarget()
    status = 0
    open() {}
    setRequestHeader() {}
    abort() {}
    getResponseHeader(name: string) {
        return name.toLowerCase() === "etag" ? '"etag"' : null
    }
    send() {
        setTimeout(() => {
            this.upload.dispatchEvent(new Event("load"))
            this.status = 200
            this.dispatchEvent(new Event("load"))
        }, 0)
    }
}

const originalAdapter = api.defaults.adapter

beforeEach(() => {
    sent = []
    unauthorizedOnce = null
    vi.stubGlobal("XMLHttpRequest", FakeXHR)
    refresh.getFreshAccessToken.mockReset()
    for (const mock of Object.values(prep)) mock.mockReset()

    api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
        sent.push({
            method: config.method,
            url: config.url,
            headers: AxiosHeaders.from(config.headers).toJSON(),
        })
        if (unauthorizedOnce && config.url === unauthorizedOnce) {
            unauthorizedOnce = null
            const response = { data: {}, status: 401, statusText: "", headers: {}, config }
            throw new AxiosError("expired", "ERR_BAD_REQUEST", config, null, response)
        }
        return { data: { data: answer(config) }, status: 200, statusText: "", headers: {}, config }
    }

    // Posting as the club…
    useAuthStore.setState({
        user: { id: "user-1", username: "coach1" } as never,
        actorType: "organization",
        actorId: "org-1",
        accessToken: "token-1",
    } as never)
    useUploadQueueStore.setState({ tasks: [] })
})

afterEach(() => {
    api.defaults.adapter = originalAdapter
    vi.unstubAllGlobals()
})

/** …and, the moment Post is tapped, switching to the personal account. */
const switchToPerson = () =>
    useAuthStore.setState({ actorType: "user", actorId: null } as never)

const settled = () =>
    vi.waitFor(
        () => {
            const status = useUploadQueueStore.getState().tasks[0]?.status
            if (status !== "done" && status !== "failed") throw new Error(`still ${status}`)
        },
        { timeout: 10_000 }
    )

const everyRequestWasTheClub = () => {
    expect(sent.length).toBeGreaterThan(0)
    for (const request of sent) {
        expect(request.headers, request.url).toMatchObject({
            "X-Actor-Type": "organization",
            "X-Actor-Id": "org-1",
        })
    }
}

describe("a queued post", () => {
    it("signs, uploads in parts, hands to the worker and creates as the club", async () => {
        prep.checkVideoDuration.mockResolvedValue({ ok: true, seconds: 40 })
        prep.prepareVideoForUpload.mockResolvedValue({ mode: "source" })
        const clip = new File([new Uint8Array(17 * MB)], "match.mkv", { type: "video/x-matroska" })

        enqueueUpload({
            kind: "post",
            label: "Match day",
            preview: { mediaType: "none" },
            run: (ctx) =>
                runPostUpload(
                    { files: [clip], payload: { content: "Match day", post_type: "normal", visibility: "public" } },
                    ctx
                ),
        })
        switchToPerson()
        await settled()

        expect(useUploadQueueStore.getState().tasks[0]).toMatchObject({
            status: "done",
            actorKey: "org-1",
            actor: { type: "organization", id: "org-1" },
        })
        expect(sent.map((r) => r.url)).toEqual([
            "/user/get/upload/signature",
            "/user/upload/multipart/create",
            "/user/upload/multipart/complete",
            "/media/jobs",
            "/posts/create",
        ])
        everyRequestWasTheClub()
    })

    it("keeps the club through a 401 refresh-and-retry of the create", async () => {
        refresh.getFreshAccessToken.mockImplementation(async () => {
            useAuthStore.setState({ accessToken: "token-2" } as never)
            return "token-2"
        })
        unauthorizedOnce = "/posts/create"

        enqueueUpload({
            kind: "post",
            label: "Text only",
            preview: { mediaType: "none" },
            run: (ctx) =>
                runPostUpload(
                    { files: [], payload: { content: "Text only", post_type: "normal", visibility: "public" } },
                    ctx
                ),
        })
        switchToPerson()
        await settled()

        expect(sent.map((r) => r.url)).toEqual(["/posts/create", "/posts/create"])
        expect(sent[1].headers.Authorization).toBe("Bearer token-2")
        everyRequestWasTheClub()
    })
})

describe("a queued highlight", () => {
    it("signs, uploads and creates as the account it was added as", async () => {
        // Highlights are a player's: here the "club" stands in for whichever
        // actor was active — what matters is that it never changes.
        prep.prepareVideoForUpload.mockResolvedValue({
            mode: "ready",
            encoded: {
                blob: new Blob([new Uint8Array(1024)], { type: "video/mp4" }),
                duration: 20,
                width: 720,
                height: 1280,
            },
        })

        enqueueUpload({
            kind: "highlight",
            label: "",
            preview: { mediaType: "none" },
            run: (ctx) =>
                runHighlightUpload({ file: new File([new Uint8Array(4)], "goal.mp4", { type: "video/mp4" }), meta: null }, ctx),
        })
        switchToPerson()
        await settled()

        expect(useUploadQueueStore.getState().tasks[0]?.status).toBe("done")
        expect(sent.map((r) => r.url)).toEqual(["/user/get/upload/signature", "/highlights/create"])
        everyRequestWasTheClub()
    })
})
