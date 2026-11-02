/**
 * Chat uploads: what the picker stages, and the server-conversion path.
 *
 * A chat message cannot be held server-side like a post, so when the phone
 * hands a file to the server the upload WAITS for the job and then returns the
 * same result the browser's own pipeline does — built from the job's outputs.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

const prep = vi.hoisted(() => ({
    prepareVideoForUpload: vi.fn(),
    prepareImageForUpload: vi.fn(),
}))
const source = vi.hoisted(() => ({
    uploadSource: vi.fn(),
    createMediaJob: vi.fn(),
    waitForMediaJob: vi.fn(),
}))

vi.mock("@/shared/services/videoPrep", () => prep)
vi.mock("@/shared/services/sourceUpload", () => source)
vi.mock("@/shared/services/imageVariants", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/shared/services/imageVariants")>()),
    preferredImageType: vi.fn(async () => "image/webp"),
}))

import {
    partitionChatMedia,
    uploadChatImage,
    uploadChatVideo,
    validateChatVideoFile,
} from "./chatUpload.service"

const pick = (name: string, type: string) => new File([new Uint8Array(4)], name, { type })

const readyJob = {
    id: "job-1",
    status: "ready",
    kind: "video",
    purpose: "chat",
    error_code: null,
    error_message: null,
    file_url: "https://media.goatza.test/chat/users/u1/a.mp4",
    public_id: "chat/users/u1/a.mp4",
    thumbnail_url: "https://media.goatza.test/chat/users/u1/a.jpg",
    width: 1280,
    height: 720,
    duration: 12.345,
    size_bytes: 4_000_000,
}

beforeEach(() => {
    for (const mock of [...Object.values(prep), ...Object.values(source)]) mock.mockReset()
    source.uploadSource.mockResolvedValue({
        key: "chat/users/u1/a.src.mkv",
        publicUrl: "https://media.goatza.test/chat/users/u1/a.src.mkv",
        contentType: "video/x-matroska",
    })
    source.createMediaJob.mockResolvedValue({ ...readyJob, status: "queued" })
    source.waitForMediaJob.mockResolvedValue(readyJob)
})

describe("partitionChatMedia", () => {
    it("stages an untyped .heic as a photo (Windows Chrome gives it no type)", () => {
        const heic = pick("IMG_0042.HEIC", "")
        const { images, videos } = partitionChatMedia([heic])

        expect(images).toEqual([heic])
        expect(videos).toEqual([])
    })

    it("splits photos from videos and leaves anything else out", () => {
        const photo = pick("a.jpg", "image/jpeg")
        const clip = pick("b.mp4", "video/mp4")
        const pdf = pick("c.pdf", "application/pdf")

        expect(partitionChatMedia([photo, clip, pdf])).toEqual({ images: [photo], videos: [clip] })
    })
})

describe("validateChatVideoFile", () => {
    it("is MP4/MOV/WebM with the server off, as always", () => {
        expect(validateChatVideoFile(pick("a.mkv", "video/x-matroska"))).toBe(
            "Videos must be MP4, MOV or WebM."
        )
        expect(validateChatVideoFile(pick("a.mov", "video/quicktime"))).toBeNull()
    })

    it("takes what the server can convert when it is on", () => {
        expect(
            validateChatVideoFile(pick("a.mkv", "video/x-matroska"), { serverProcessing: true })
        ).toBeNull()
    })
})

describe("uploadChatVideo — the server converts it", () => {
    it("uploads the original, says it is processing, then returns the job's files", async () => {
        prep.prepareVideoForUpload.mockResolvedValue({ mode: "source" })
        const order: string[] = []
        const onProcessing = vi.fn(() => order.push("processing"))
        source.waitForMediaJob.mockImplementation(async () => {
            order.push("waiting")
            return readyJob
        })
        const clip = pick("match.mkv", "video/x-matroska")

        const result = await uploadChatVideo(clip, undefined, 0, undefined, { onProcessing })

        expect(source.uploadSource.mock.calls[0][0]).toBe(clip)
        expect(source.uploadSource.mock.calls[0][1]).toMatchObject({
            uploadType: "chat",
            purpose: "chat",
            flow: "chat",
        })
        expect(source.createMediaJob.mock.calls[0][0]).toMatchObject({
            key: "chat/users/u1/a.src.mkv",
            purpose: "chat",
            uploadType: "chat",
        })
        expect(order).toEqual(["processing", "waiting"])
        expect(result).toEqual({
            media_url: readyJob.file_url,
            media_public_id: readyJob.public_id,
            thumbnail_url: readyJob.thumbnail_url,
            width: 1280,
            height: 720,
            size_bytes: 4_000_000,
            // Seconds from the job, milliseconds for the message.
            duration_ms: 12345,
        })
    })

    it("lets the job's failure through for the bubble to show", async () => {
        prep.prepareVideoForUpload.mockResolvedValue({ mode: "source" })
        const failure = new Error("Videos can be at most 1:30 long")
        source.waitForMediaJob.mockRejectedValue(failure)

        await expect(uploadChatVideo(pick("a.mkv", "video/x-matroska"))).rejects.toBe(failure)
    })
})

describe("uploadChatImage — the server converts it", () => {
    it("returns the converted photo, with no duration", async () => {
        prep.prepareImageForUpload.mockResolvedValue({ mode: "source" })
        source.waitForMediaJob.mockResolvedValue({ ...readyJob, kind: "image", duration: null })

        const result = await uploadChatImage(pick("IMG_1.HEIC", ""))

        expect(source.uploadSource.mock.calls[0][1]).toMatchObject({ uploadType: "chat", purpose: "chat" })
        expect(result).toMatchObject({
            media_url: readyJob.file_url,
            media_public_id: readyJob.public_id,
            thumbnail_url: readyJob.thumbnail_url,
        })
        expect(result).not.toHaveProperty("duration_ms", expect.any(Number))
    })
})
