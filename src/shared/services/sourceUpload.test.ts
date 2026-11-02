// @vitest-environment jsdom
/**
 * Sources and jobs: what an untyped original is signed as, and how a flow
 * that needs the converted files (chat, recruitments) waits for them — the
 * realtime bus is the speed-up, polling GET /media/jobs/<id> the guarantee.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock("@/core/api/axios", () => ({
    default: api,
    withActor: (actor?: unknown) => (actor ? { actor } : {}),
}))

import { realtimeBus } from "@/core/ws/realtimeBus"
import { UploadError } from "./mediaUpload"
import {
    MediaJobError,
    sourceContentType,
    waitForMediaJob,
    type MediaJob,
} from "./sourceUpload"

const untyped = (name: string, type = "") => new File([new Uint8Array(4)], name, { type })

describe("sourceContentType", () => {
    it("keeps a type the server knows", () => {
        expect(sourceContentType(untyped("clip.mp4", "video/mp4"))).toBe("video/mp4")
        expect(sourceContentType(untyped("photo.heic", "image/heic"))).toBe("image/heic")
    })

    it("goes by the extension when the browser gave no type (Windows .heic)", () => {
        expect(sourceContentType(untyped("IMG_0042.HEIC"))).toBe("image/heic")
        expect(sourceContentType(untyped("match.mkv"))).toBe("video/x-matroska")
        expect(sourceContentType(untyped("old.avi"))).toBe("video/x-msvideo")
        expect(sourceContentType(untyped("phone.3gp"))).toBe("video/3gpp")
        expect(sourceContentType(untyped("clip.m4v"))).toBe("video/x-m4v")
    })

    it("goes by the extension for octet-stream and non-standard types", () => {
        expect(sourceContentType(untyped("clip.mov", "application/octet-stream"))).toBe("video/quicktime")
        expect(sourceContentType(untyped("photo.jpg", "image/jpg"))).toBe("image/jpeg")
    })

    it("is null for anything the server would refuse", () => {
        expect(sourceContentType(untyped("notes.txt"))).toBeNull()
        expect(sourceContentType(untyped("notes.txt", "text/plain"))).toBeNull()
        expect(sourceContentType(untyped("noextension"))).toBeNull()
    })
})

// ── waitForMediaJob ───────────────────────────────────────────

const job = (over: Partial<MediaJob> = {}): MediaJob => ({
    id: "job-1",
    status: "processing",
    kind: "video",
    purpose: "chat",
    error_code: null,
    error_message: null,
    ...over,
})

const ready = job({
    status: "ready",
    file_url: "https://media.goatza.test/chat/x.mp4",
    public_id: "chat/x.mp4",
    thumbnail_url: "https://media.goatza.test/chat/x.jpg",
    duration: 12.5,
})

const answer = (value: MediaJob) => ({ data: { data: { job: value } } })

describe("waitForMediaJob", () => {
    beforeEach(() => {
        vi.useFakeTimers()
        api.get.mockReset()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it("resolves on the bus event, before any poll answers", async () => {
        // The first poll never comes back.
        api.get.mockReturnValue(new Promise(() => {}))

        const waiting = waitForMediaJob("job-1")
        realtimeBus.emit({ notification_type: "media_job_updated", job: ready })

        await expect(waiting).resolves.toEqual(ready)
        expect(api.get).toHaveBeenCalledTimes(1)
    })

    it("ignores another job's event", async () => {
        api.get.mockResolvedValueOnce(answer(job())).mockResolvedValue(answer(ready))

        const waiting = waitForMediaJob("job-1")
        realtimeBus.emit({
            notification_type: "media_job_updated",
            job: { ...ready, id: "job-2" },
        })
        await vi.advanceTimersByTimeAsync(3000)

        await expect(waiting).resolves.toEqual(ready)
    })

    it("resolves on the poll when no event comes", async () => {
        api.get.mockResolvedValueOnce(answer(job())).mockResolvedValueOnce(answer(ready))

        const waiting = waitForMediaJob("job-1")
        await vi.advanceTimersByTimeAsync(3000)

        await expect(waiting).resolves.toEqual(ready)
        expect(api.get).toHaveBeenCalledTimes(2)
        expect(api.get.mock.calls[0][0]).toBe("/media/jobs/job-1")
    })

    it("rejects with the server's code and sentence when the job failed", async () => {
        api.get.mockResolvedValue(
            answer(
                job({
                    status: "failed",
                    error_code: "VIDEO_TOO_LONG",
                    error_message: "Videos can be at most 1:30 long",
                })
            )
        )

        const waiting = waitForMediaJob("job-1")
        const failure = await waiting.catch((err: unknown) => err)

        expect(failure).toBeInstanceOf(MediaJobError)
        expect(failure).toMatchObject({
            code: "VIDEO_TOO_LONG",
            message: "Videos can be at most 1:30 long",
        })
    })

    it("rejects with a cancellation when the signal aborts", async () => {
        api.get.mockReturnValue(new Promise(() => {}))
        const controller = new AbortController()

        const waiting = waitForMediaJob("job-1", { signal: controller.signal })
        controller.abort()

        const failure = await waiting.catch((err: unknown) => err)
        expect(failure).toBeInstanceOf(UploadError)
        expect(failure).toMatchObject({ code: "CANCELLED" })
    })
})

describe("waitForMediaJob — refusals (F7)", () => {
    beforeEach(() => {
        vi.useFakeTimers()
        api.get.mockReset()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    const refusal = (status: number) =>
        Object.assign(new Error("Request failed"), {
            isAxiosError: true,
            response: { status, data: {} },
        })

    it("rejects on a 403 instead of polling for 45 minutes", async () => {
        api.get.mockRejectedValue(refusal(403))

        const failure = await waitForMediaJob("job-1").catch((err: unknown) => err)

        expect(failure).toMatchObject({ response: { status: 403 } })
        expect(api.get).toHaveBeenCalledTimes(1)
    })

    it("keeps polling through a 429 and a network blip", async () => {
        api.get
            .mockRejectedValueOnce(refusal(429))
            .mockRejectedValueOnce(new Error("Network Error"))
            .mockResolvedValue(answer(ready))

        const waiting = waitForMediaJob("job-1")
        await vi.advanceTimersByTimeAsync(3000)
        await vi.advanceTimersByTimeAsync(3000)

        await expect(waiting).resolves.toEqual(ready)
        expect(api.get).toHaveBeenCalledTimes(3)
    })

    it("asks as the job's owner", async () => {
        api.get.mockResolvedValue(answer(ready))
        const actor = { type: "organization" as const, id: "org-1" }

        await waitForMediaJob("job-1", { actor })

        expect(api.get.mock.calls[0][1]).toMatchObject({ actor })
    })
})
