/**
 * A queued post's media: ready photos in ONE batch, originals the server
 * converts into that batch's folder, everything in the author's order — and
 * the create's 200 / 202 turned into the queue's done / processing.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

import type { QueueRunContext } from "@/store/uploadQueue.store"

const prep = vi.hoisted(() => ({
    checkVideoDuration: vi.fn(),
    prepareImageForUpload: vi.fn(),
    prepareVideoForUpload: vi.fn(),
    readVideoDuration: vi.fn(),
}))
const source = vi.hoisted(() => ({ uploadSource: vi.fn(), createMediaJob: vi.fn() }))
const batch = vi.hoisted(() => ({ uploadSignedBatch: vi.fn() }))
const api = vi.hoisted(() => ({ submitPostApi: vi.fn() }))

vi.mock("@/shared/services/videoPrep", () => prep)
vi.mock("@/shared/services/sourceUpload", () => source)
vi.mock("@/shared/services/mediaUpload", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/shared/services/mediaUpload")>()),
    uploadSignedBatch: batch.uploadSignedBatch,
}))
vi.mock("@/shared/services/imageVariants", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/shared/services/imageVariants")>()),
    preferredImageType: vi.fn(async () => "image/webp"),
}))
vi.mock("./posts.api", () => api)

import {
    VIDEO_TOO_LONG_MESSAGE,
    runPostUpload,
    uploadPostMedia,
    validateMediaFiles,
} from "./postUpload.service"

const pick = (name: string, type: string) => new File([new Uint8Array(4)], name, { type })

const ready = (name: string) => ({
    mode: "ready" as const,
    full: new File([new Uint8Array(100)], `${name}.webp`, { type: "image/webp" }),
    thumb: new File([new Uint8Array(10)], `${name}-thumb.webp`, { type: "image/webp" }),
    width: 2560,
    height: 1920,
})

const ACTOR = { type: "organization" as const, id: "org-1" }

const ctx = (): QueueRunContext => ({
    signal: new AbortController().signal,
    actor: ACTOR,
    allowSilentAudio: false,
    setStatus: vi.fn(),
    setProgress: vi.fn(),
})

const entry = (name: string) => ({
    key: `users/u1/posts/folder-1/${name}`,
    public_url: `https://media.goatza.test/users/u1/posts/folder-1/${name}`,
})

beforeEach(() => {
    for (const group of [prep, source, batch, api]) {
        for (const mock of Object.values(group)) mock.mockReset()
    }
})

describe("a mixed carousel", () => {
    it("keeps the author's order: ready photos batched, the HEIC by its job, one folder", async () => {
        prep.prepareImageForUpload
            .mockResolvedValueOnce(ready("a"))
            .mockResolvedValueOnce({ mode: "source" })
            .mockResolvedValueOnce(ready("c"))
        batch.uploadSignedBatch.mockResolvedValue({
            entries: [entry("a.webp"), entry("a-t.webp"), entry("c.webp"), entry("c-t.webp")],
            tempPostId: "folder-1",
        })
        source.uploadSource.mockResolvedValue({
            key: "users/u1/posts/folder-1/b.src.heic",
            publicUrl: "https://media.goatza.test/users/u1/posts/folder-1/b.src.heic",
            contentType: "image/heic",
            tempPostId: "folder-1",
        })
        source.createMediaJob.mockResolvedValue({ id: "job-b", status: "queued" })

        const run = ctx()
        const media = await uploadPostMedia(
            [pick("a.jpg", "image/jpeg"), pick("IMG_2.HEIC", ""), pick("c.png", "image/png")],
            run
        )

        // The ready two, as one batch: image, thumb, image, thumb.
        const items = batch.uploadSignedBatch.mock.calls[0][0] as Array<{ descriptor: { kind: string } }>
        expect(items.map((i) => i.descriptor.kind)).toEqual(["image", "thumb", "image", "thumb"])

        // The original, into the batch's folder, as a posts source.
        expect(source.uploadSource.mock.calls[0][1]).toMatchObject({
            uploadType: "posts",
            purpose: "posts",
            tempPostId: "folder-1",
            actor: ACTOR,
        })
        expect(source.createMediaJob.mock.calls[0][0]).toMatchObject({
            key: "users/u1/posts/folder-1/b.src.heic",
            purpose: "posts",
            uploadType: "posts",
            actor: ACTOR,
        })

        expect(media).toEqual([
            expect.objectContaining({ public_id: entry("a.webp").key, thumbnail_url: entry("a-t.webp").public_url, order: 0 }),
            { media_job_id: "job-b", order: 1 },
            expect.objectContaining({ public_id: entry("c.webp").key, thumbnail_url: entry("c-t.webp").public_url, order: 2 }),
        ])
        expect(run.setStatus).toHaveBeenCalledWith("uploading")
    })

    it("with no ready photo, the first original names the folder for the rest", async () => {
        prep.prepareImageForUpload.mockResolvedValue({ mode: "source" })
        source.uploadSource
            .mockResolvedValueOnce({ key: "k1", publicUrl: "u1", contentType: "image/heic", tempPostId: "folder-9" })
            .mockResolvedValueOnce({ key: "k2", publicUrl: "u2", contentType: "image/heic", tempPostId: "folder-9" })
        source.createMediaJob
            .mockResolvedValueOnce({ id: "job-1" })
            .mockResolvedValueOnce({ id: "job-2" })

        const media = await uploadPostMedia([pick("1.heic", ""), pick("2.heic", "")], ctx())

        expect(batch.uploadSignedBatch).not.toHaveBeenCalled()
        expect(source.uploadSource.mock.calls[0][1].tempPostId).toBeUndefined()
        expect(source.uploadSource.mock.calls[1][1].tempPostId).toBe("folder-9")
        expect(media).toEqual([
            { media_job_id: "job-1", order: 0 },
            { media_job_id: "job-2", order: 1 },
        ])
    })
})

describe("a video", () => {
    it("is refused before any work when it is over 5 minutes", async () => {
        prep.checkVideoDuration.mockResolvedValue({ ok: false, reason: "too_long", seconds: 400 })

        await expect(uploadPostMedia([pick("long.mp4", "video/mp4")], ctx())).rejects.toThrow(
            VIDEO_TOO_LONG_MESSAGE
        )
        expect(prep.prepareVideoForUpload).not.toHaveBeenCalled()
    })

    it("goes up as the original when the phone hands it to the server", async () => {
        prep.checkVideoDuration.mockResolvedValue({ ok: true, seconds: null })
        prep.prepareVideoForUpload.mockResolvedValue({ mode: "source" })
        source.uploadSource.mockResolvedValue({ key: "k.src.mkv", publicUrl: "u", contentType: "video/x-matroska" })
        source.createMediaJob.mockResolvedValue({ id: "job-v" })

        const media = await uploadPostMedia([pick("match.mkv", "video/x-matroska")], ctx())

        expect(prep.prepareVideoForUpload.mock.calls[0][1]).toMatchObject({ purpose: "posts", flow: "post" })
        expect(batch.uploadSignedBatch).not.toHaveBeenCalled()
        expect(media).toEqual([{ media_job_id: "job-v", order: 0 }])
    })
})

describe("runPostUpload", () => {
    const draft = {
        files: [],
        payload: { content: "Match day", post_type: "normal" as const, visibility: "public" as const },
    }

    it("200 → done with the post id", async () => {
        api.submitPostApi.mockResolvedValue({ kind: "created", postId: "post-1" })

        const run = ctx()
        await expect(runPostUpload(draft, run)).resolves.toEqual({
            kind: "done",
            result: { postId: "post-1" },
        })
        expect(run.setStatus).toHaveBeenCalledWith("publishing")
        // A text post sends no media key at all, as before.
        expect(api.submitPostApi.mock.calls[0][0]).not.toHaveProperty("media")
        // …and is created as the account it was written as.
        expect(api.submitPostApi.mock.calls[0][1]).toEqual(ACTOR)
    })

    it("202 → processing, the server's publication handed to the queue", async () => {
        const publication = { id: "pub-1", status: "processing" }
        api.submitPostApi.mockResolvedValue({ kind: "pending", publication })

        await expect(runPostUpload(draft, ctx())).resolves.toEqual({
            kind: "processing",
            publication,
        })
    })
})

describe("validateMediaFiles", () => {
    it("refuses an .mkv with the server off, takes it with the server on", () => {
        const mkv = [pick("match.mkv", "video/x-matroska")]
        expect(validateMediaFiles(mkv)).toBe("Videos must be MP4, MOV or WebM.")
        expect(validateMediaFiles(mkv, { serverProcessing: true })).toBeNull()
    })
})
