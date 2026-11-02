/**
 * A queued highlight: today's encoded clip + poster when the phone can, the
 * original and a `{media_job_id}` create when the server converts it.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

import type { QueueRunContext } from "@/store/uploadQueue.store"

const prep = vi.hoisted(() => ({ prepareVideoForUpload: vi.fn() }))
const source = vi.hoisted(() => ({ uploadSource: vi.fn(), createMediaJob: vi.fn() }))
const api = vi.hoisted(() => ({ submitHighlightApi: vi.fn() }))
const media = vi.hoisted(() => ({ uploadSignedBatch: vi.fn(), putVideoFor: vi.fn(() => vi.fn()) }))
const encode = vi.hoisted(() => ({ capturePoster: vi.fn() }))

vi.mock("@/shared/services/videoPrep", () => prep)
vi.mock("@/shared/services/sourceUpload", () => source)
vi.mock("./highlights.api", () => api)
vi.mock("@/shared/services/mediaUpload", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/shared/services/mediaUpload")>()),
    ...media,
}))
vi.mock("@/shared/services/videoEncode", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/shared/services/videoEncode")>()),
    ...encode,
}))

import { runHighlightUpload, validateHighlightFile } from "./highlightUpload.service"

const clip = (name = "goal.mov", type = "video/quicktime") =>
    new File([new Uint8Array(4)], name, { type })

const ACTOR = { type: "user" as const }

const ctx = (): QueueRunContext => ({
    signal: new AbortController().signal,
    actor: ACTOR,
    allowSilentAudio: false,
    setStatus: vi.fn(),
    setProgress: vi.fn(),
})

beforeEach(() => {
    for (const group of [prep, source, api, media, encode]) {
        for (const mock of Object.values(group)) mock.mockReset()
    }
    media.putVideoFor.mockReturnValue(vi.fn())
})

describe("runHighlightUpload", () => {
    it("the server converts it: the original, a highlights job, a create naming it → 202", async () => {
        prep.prepareVideoForUpload.mockResolvedValue({ mode: "source" })
        source.uploadSource.mockResolvedValue({ key: "users/u1/posts/f/a.src.mkv", publicUrl: "u", contentType: "video/x-matroska" })
        source.createMediaJob.mockResolvedValue({ id: "job-h" })
        const publication = { id: "pub-h", status: "processing" }
        api.submitHighlightApi.mockResolvedValue({ kind: "pending", publication })

        const outcome = await runHighlightUpload(
            { file: clip("match.mkv", "video/x-matroska"), meta: null, title: "Free kick", visibility: "everyone" },
            ctx()
        )

        expect(prep.prepareVideoForUpload.mock.calls[0][1]).toMatchObject({
            purpose: "highlights",
            maxBytes: 40 * 1024 * 1024,
            flow: "highlight",
        })
        // Signed as posts, converted for highlights.
        expect(source.uploadSource.mock.calls[0][1]).toMatchObject({ uploadType: "posts", purpose: "highlights", actor: ACTOR })
        expect(source.createMediaJob.mock.calls[0][0]).toMatchObject({ purpose: "highlights", uploadType: "posts", actor: ACTOR })
        expect(api.submitHighlightApi).toHaveBeenCalledWith(
            {
                media_job_id: "job-h",
                title: "Free kick",
                visibility: "everyone",
            },
            ACTOR
        )
        expect(outcome).toEqual({ kind: "processing", publication })
    })

    it("the phone encodes it: clip + poster in one batch, created now", async () => {
        const blob = new Blob([new Uint8Array(100)], { type: "video/mp4" })
        prep.prepareVideoForUpload.mockResolvedValue({
            mode: "ready",
            encoded: { blob, duration: 24.6, width: 720, height: 1280 },
        })
        encode.capturePoster.mockResolvedValue(new File([new Uint8Array(10)], "p.jpg", { type: "image/jpeg" }))
        media.uploadSignedBatch.mockResolvedValue({
            entries: [
                { key: "users/u1/posts/f/a.mp4", public_url: "https://m/a.mp4" },
                { key: "users/u1/posts/f/a.jpg", public_url: "https://m/a.jpg" },
            ],
        })
        api.submitHighlightApi.mockResolvedValue({ kind: "created", highlightId: "h-1" })

        const outcome = await runHighlightUpload({ file: clip(), meta: null }, ctx())

        expect(api.submitHighlightApi).toHaveBeenCalledWith(
            {
                file_url: "https://m/a.mp4",
                public_id: "users/u1/posts/f/a.mp4",
                thumbnail_url: "https://m/a.jpg",
                duration: 25,
                width: 720,
                height: 1280,
            },
            ACTOR
        )
        expect(media.putVideoFor).toHaveBeenCalledWith("posts", undefined, ACTOR)
        expect(source.uploadSource).not.toHaveBeenCalled()
        expect(outcome).toEqual({ kind: "done", result: { highlightId: "h-1" } })
    })

    it("refuses an encoded clip over 90 s before uploading it", async () => {
        prep.prepareVideoForUpload.mockResolvedValue({
            mode: "ready",
            encoded: { blob: new Blob(["x"], { type: "video/mp4" }), duration: 120, width: 720, height: 1280 },
        })

        await expect(runHighlightUpload({ file: clip(), meta: null }, ctx())).rejects.toThrow(
            /at most 90 seconds/
        )
        expect(media.uploadSignedBatch).not.toHaveBeenCalled()
    })
})

describe("validateHighlightFile", () => {
    it("is MP4/MOV/WebM with the server off, wider with it on", () => {
        const mkv = clip("match.mkv", "video/x-matroska")
        expect(validateHighlightFile(mkv)).toBe("Videos must be MP4, MOV or WebM.")
        expect(validateHighlightFile(mkv, { serverProcessing: true })).toBeNull()
        expect(validateHighlightFile(clip("photo.jpg", "image/jpeg"))).toBe("That file isn't a video.")
    })
})

describe("the bar's retry state (F7)", () => {
    it("passes the PUT's retry meta through, like posts", async () => {
        prep.prepareVideoForUpload.mockResolvedValue({
            mode: "ready",
            encoded: { blob: new Blob(["x"], { type: "video/mp4" }), duration: 20, width: 720, height: 1280 },
        })
        encode.capturePoster.mockResolvedValue(new File(["p"], "p.jpg", { type: "image/jpeg" }))
        const meta = { attempt: 2, maxAttempts: 4 }
        media.uploadSignedBatch.mockImplementation(async (items: Array<{ onProgress?: (l: number, t: number, m?: unknown) => void }>) => {
            items[0].onProgress?.(50, 100, meta)
            return { entries: [{ key: "k", public_url: "u" }, { key: "t", public_url: "tu" }] }
        })
        api.submitHighlightApi.mockResolvedValue({ kind: "created", highlightId: "h-2" })
        const run = ctx()

        await runHighlightUpload({ file: clip(), meta: null }, run)

        expect(run.setProgress).toHaveBeenCalledWith(expect.any(Number), meta)
    })
})
