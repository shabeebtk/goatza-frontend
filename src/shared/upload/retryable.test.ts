/**
 * canRetryUpload: Retry is offered only when the same attempt could go
 * differently — never for a file that is refused the same way every time.
 */

import { AxiosError } from "axios"
import { describe, expect, it } from "vitest"

import { ImagePrepareError } from "@/shared/services/imageVariants"
import { UploadError } from "@/shared/services/mediaUpload"
import { MediaJobError } from "@/shared/services/sourceUpload"
import { VideoAudioLostError, VideoPrepareError, type SourceFacts } from "@/shared/services/videoEncode"
import { UploadRefusal, canRetryUpload } from "./retryable"

const http = (status?: number, message = "") =>
    new AxiosError(
        "failed",
        status ? "ERR_BAD_REQUEST" : "ERR_NETWORK",
        undefined,
        null,
        status
            ? { status, statusText: "", headers: {}, config: { headers: {} } as never, data: { message } }
            : undefined
    )

const facts = { fileType: "video/mp4", size: 1 } as SourceFacts

describe("canRetryUpload", () => {
    it.each([
        ["an upload that died", new UploadError("NETWORK")],
        ["no answer at all", http()],
        ["a 5xx", http(502)],
        ["a timeout", http(408)],
        ["a rate limit", http(429)],
        ["a worker that timed out", new MediaJobError("PROCESSING_TIMEOUT", "Too slow")],
        ["a worker that broke", new MediaJobError("INTERNAL", "Oops")],
        ["a conversion this device could retry", new VideoPrepareError("CONVERSION_FAILED", { facts, steps: [] })],
    ])("retries %s", (_, err) => {
        expect(canRetryUpload(err, "post")).toBe(true)
    })

    it.each([
        ["a validation 400", http(400, "Invalid media at index 0")],
        ["a source attached as a file", http(400, "This file hasn't finished processing.")],
        ["a job already used", http(400, "This upload is already used.")],
        ["a clip too long for the server", new MediaJobError("VIDEO_TOO_LONG", "Too long")],
        ["an unreadable original", new MediaJobError("SOURCE_UNREADABLE", "Unreadable")],
        ["a file with no video", new MediaJobError("VIDEO_NO_VIDEO_TRACK", "No video")],
        ["a video too large on this device", new VideoPrepareError("TOO_LARGE", { facts, steps: [] })],
        ["a file that is not media", new VideoPrepareError("PROBE_FAILED", { facts, steps: [] })],
        ["no video track", new VideoPrepareError("NO_VIDEO_TRACK", { facts, steps: [] })],
        ["a photo this browser cannot open", new ImagePrepareError("IMAGE_DECODE_FAILED", { facts: {} as never, steps: [] })],
        ["a lost sound (that is \"without sound\")", new VideoAudioLostError()],
        ["the pipeline's own refusal", new UploadRefusal("Video must be under 5 minutes")],
    ])("does not retry %s", (_, err) => {
        expect(canRetryUpload(err, "post")).toBe(false)
    })

    it("does not retry a full highlight rail", () => {
        const full = http(400, "You already have 10 highlights. Delete one to add another.")
        expect(canRetryUpload(full, "highlight")).toBe(false)
    })
})
