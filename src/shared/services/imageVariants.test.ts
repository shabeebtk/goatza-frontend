/**
 * `compressImage` and `ensureDecodableImage`: the HEIC fallback, the
 * server's cap on the compressed file, and the coded, reported failure —
 * against a mocked compressor, a mocked `heic2any`, and a `createImageBitmap`
 * that decodes whatever the test says this browser can.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const compressor = vi.hoisted(() => vi.fn())
vi.mock("browser-image-compression", () => ({ default: compressor }))

const heic2any = vi.hoisted(() => vi.fn())
vi.mock("heic2any", () => ({ default: heic2any }))

const sentry = vi.hoisted(() => ({
    captureException: vi.fn(),
    captureMessage: vi.fn(),
    addBreadcrumb: vi.fn(),
}))
vi.mock("@sentry/nextjs", () => sentry)

import {
    ImagePrepareError,
    compressImage,
    ensureDecodableImage,
    isHeicFile,
} from "@/shared/services/imageVariants"

/** A File claiming `bytes` without allocating them. */
const sized = (name: string, type: string, bytes = 1024) => {
    const file = new File(["x"], name, { type })
    Object.defineProperty(file, "size", { value: bytes })
    return file
}

const OPTIONS = { maxSizeMB: 2.5, maxWidthOrHeight: 2560, fileType: "image/webp" }

/** Which blobs this "browser" can decode. */
let decodes: (blob: Blob) => boolean

beforeEach(() => {
    compressor.mockReset()
    heic2any.mockReset()
    sentry.captureException.mockClear()
    decodes = (blob) => !/heic|heif/i.test(blob.type) && !(blob as File).name?.match(/\.hei[cf]$/i)
    vi.stubGlobal(
        "createImageBitmap",
        vi.fn(async (blob: Blob) => {
            if (!decodes(blob)) throw new DOMException("The source image could not be decoded.", "InvalidStateError")
            return { close: () => {} }
        })
    )
    // The compressor writes what it was asked for, small.
    compressor.mockImplementation(async (file: File, opts: { fileType?: string }) =>
        sized(file.name, opts.fileType ?? file.type, 900_000)
    )
    heic2any.mockImplementation(async () => new Blob(["jpeg"], { type: "image/jpeg" }))
})

afterEach(() => {
    vi.unstubAllGlobals()
})

describe("compressImage", () => {
    it("compresses a photo and hands back what the compressor wrote", async () => {
        const out = await compressImage(sized("IMG_1.jpg", "image/jpeg", 8 * 1024 * 1024), OPTIONS, { flow: "post" })

        expect(out.size).toBe(900_000)
        expect(compressor).toHaveBeenCalledTimes(1)
        expect(heic2any).not.toHaveBeenCalled()
        expect(sentry.captureException).not.toHaveBeenCalled()
    })

    it("converts a HEIC this browser cannot decode to JPEG first, at quality 0.92", async () => {
        await compressImage(sized("IMG_2.HEIC", "image/heic", 3_000_000), OPTIONS, { flow: "post" })

        expect(heic2any).toHaveBeenCalledWith(
            expect.objectContaining({ toType: "image/jpeg", quality: 0.92 })
        )
        // No doomed first attempt on the HEIC itself.
        expect(compressor).toHaveBeenCalledTimes(1)
        const [source] = compressor.mock.calls[0] as [File]
        expect(source.type).toBe("image/jpeg")
        expect(source.name).toBe("IMG_2.jpg")
    })

    it("recognises a .heic with no type at all — Windows Chrome", async () => {
        const untyped = sized("IMG_3.heic", "")
        expect(isHeicFile(untyped)).toBe(true)

        await compressImage(untyped, OPTIONS, { flow: "chat" })

        expect(heic2any).toHaveBeenCalledTimes(1)
    })

    it("leaves a HEIC alone where the browser decodes it (Safari never downloads heic2any)", async () => {
        decodes = () => true

        await compressImage(sized("IMG_4.heic", "image/heic"), OPTIONS, { flow: "post" })

        expect(heic2any).not.toHaveBeenCalled()
        expect((compressor.mock.calls[0] as [File])[0].type).toBe("image/heic")
    })

    it("converts and retries a HEIC that decoded but that the compressor refused", async () => {
        decodes = () => true
        compressor.mockRejectedValueOnce(new Event("error"))

        const out = await compressImage(sized("IMG_5.heif", "image/heif"), OPTIONS, { flow: "post" })

        expect(out.size).toBe(900_000)
        expect(heic2any).toHaveBeenCalledTimes(1)
        expect(compressor).toHaveBeenCalledTimes(2)
    })

    it("fails a photo it cannot decode with IMAGE_DECODE_FAILED, reported once", async () => {
        compressor.mockRejectedValue(new Event("error"))

        const err = await compressImage(sized("broken.png", "image/png", 2_000_000), OPTIONS, {
            flow: "single",
            surface: "profile",
        }).catch((e: unknown) => e)

        expect(err).toBeInstanceOf(ImagePrepareError)
        const failure = err as ImagePrepareError
        expect(failure.code).toBe("IMAGE_DECODE_FAILED")
        expect(failure.message).toMatch(/\(IMAGE_DECODE_FAILED\)$/)
        expect(failure.message).not.toContain("Couldn't prepare these photos")
        expect(failure.facts).toMatchObject({ fileType: "image/png", extension: "png", size: 2_000_000, heic: false })
        expect(failure.steps).toEqual([
            expect.objectContaining({ name: "compress", outcome: "failed", errorName: "Event", errorMessage: "error" }),
        ])

        expect(sentry.captureException).toHaveBeenCalledTimes(1)
        expect(sentry.captureException.mock.calls[0][1]).toMatchObject({
            tags: {
                "image.code": "IMAGE_DECODE_FAILED",
                "image.type": "image/png",
                "upload.flow": "single",
                "upload.surface": "profile",
            },
        })
        // Never the photo's name.
        expect(JSON.stringify(sentry.captureException.mock.calls[0][1])).not.toContain("broken.png")
    })

    it("fails a HEIC the converter cannot read with IMAGE_DECODE_FAILED", async () => {
        heic2any.mockRejectedValue(new Error("ERR_LIBHEIF format not supported"))

        const err = await compressImage(sized("IMG_6.heic", "image/heic"), OPTIONS, { flow: "post" }).catch(
            (e: unknown) => e
        )

        expect(err).toMatchObject({ code: "IMAGE_DECODE_FAILED" })
        expect((err as ImagePrepareError).steps[0]).toMatchObject({ name: "heic → jpeg", outcome: "failed" })
        expect(compressor).not.toHaveBeenCalled()
    })

    it("refuses output still over the server's 5 MB cap with IMAGE_TOO_LARGE_AFTER_COMPRESSION", async () => {
        compressor.mockResolvedValue(sized("big.webp", "image/webp", 6 * 1024 * 1024))

        const err = await compressImage(sized("big.jpg", "image/jpeg", 20 * 1024 * 1024), OPTIONS, {
            flow: "recruitment",
        }).catch((e: unknown) => e)

        expect(err).toMatchObject({
            code: "IMAGE_TOO_LARGE_AFTER_COMPRESSION",
            facts: { outputBytes: 6 * 1024 * 1024, maxBytes: 5 * 1024 * 1024 },
        })
        expect((err as Error).message).toMatch(/\(IMAGE_TOO_LARGE_AFTER_COMPRESSION\)$/)
        expect(sentry.captureException).toHaveBeenCalledTimes(1)
    })

    it("rejects a cancel exactly as the compressor does, and reports nothing", async () => {
        const controller = new AbortController()
        const reason = new Error("upload_cancelled")
        compressor.mockImplementation(async () => {
            controller.abort(reason)
            throw reason
        })

        await expect(
            compressImage(sized("a.jpg", "image/jpeg"), OPTIONS, { flow: "post", signal: controller.signal })
        ).rejects.toBe(reason)
        expect(sentry.captureException).not.toHaveBeenCalled()
    })
})

describe("ensureDecodableImage", () => {
    it("returns anything that is not HEIC untouched, without decoding it", async () => {
        const jpeg = sized("a.jpg", "image/jpeg")

        expect(await ensureDecodableImage(jpeg, { flow: "single", surface: "profile" })).toBe(jpeg)
        expect(createImageBitmap).not.toHaveBeenCalled()
    })

    it("converts a HEIC the browser cannot decode, so the cropper can show it", async () => {
        const out = await ensureDecodableImage(sized("me.heic", ""), { flow: "single", surface: "profile" })

        expect(out.type).toBe("image/jpeg")
        expect(out.name).toBe("me.jpg")
    })

    it("fails a HEIC it cannot convert with a reported IMAGE_DECODE_FAILED", async () => {
        heic2any.mockRejectedValue(new Error("nope"))

        await expect(
            ensureDecodableImage(sized("me.heic", "image/heic"), { flow: "single", surface: "cover" })
        ).rejects.toMatchObject({ code: "IMAGE_DECODE_FAILED" })
        expect(sentry.captureException).toHaveBeenCalledTimes(1)
    })
})
