/**
 * Pick-time photo validation, on every surface that validates one: the 25 MB
 * raw ceiling (the server's 5 MB cap is on the COMPRESSED file), and a photo
 * recognised by its extension when the browser gives it no type — Windows
 * Chrome reports a `.heic` as "".
 */

import { describe, expect, it, vi } from "vitest"

// The validators' modules also upload; none of that runs here.
vi.mock("@/core/api/axios", () => ({
    default: { post: vi.fn() },
    withActor: (actor?: unknown) => (actor ? { actor } : {}),
}))
vi.mock("browser-image-compression", () => ({ default: vi.fn() }))

import {
    IMAGE_TOO_LARGE_MESSAGE,
    MAX_RAW_IMAGE_MB,
    checkRawImageSize,
    isImageFile,
} from "@/shared/constants/media"
import { validateMediaFiles } from "@/features/posts/services/postUpload.service"
import { validateChatImages } from "@/features/messages/services/chatUpload.service"
import { validateMatchPhoto } from "@/features/matchDiary/services/matchPhoto.service"
import { validateScreenshot } from "@/features/support/services/screenshotUpload"

const MB = 1024 * 1024

/** A File claiming `bytes` without allocating them. */
const sized = (name: string, type: string, bytes = 1024) => {
    const file = new File(["x"], name, { type })
    Object.defineProperty(file, "size", { value: bytes })
    return file
}

describe("photo helpers", () => {
    it("recognises a photo by type, or by extension when it has none", () => {
        expect(isImageFile(sized("a.jpg", "image/jpeg"))).toBe(true)
        expect(isImageFile(sized("IMG_1.HEIC", ""))).toBe(true)
        expect(isImageFile(sized("IMG_2.heif", "application/octet-stream"))).toBe(true)
        // A typed non-image is never let through on its name.
        expect(isImageFile(sized("a.jpg", "application/pdf"))).toBe(false)
        expect(isImageFile(sized("notes.pdf", ""))).toBe(false)
        expect(isImageFile(sized("noext", ""))).toBe(false)
    })

    it("holds the pick to 25 MB", () => {
        expect(MAX_RAW_IMAGE_MB).toBe(25)
        expect(checkRawImageSize(sized("a.jpg", "image/jpeg", 25 * MB))).toBeNull()
        expect(checkRawImageSize(sized("a.jpg", "image/jpeg", 25 * MB + 1))).toBe(IMAGE_TOO_LARGE_MESSAGE)
    })
})

describe("validateMediaFiles (posts)", () => {
    it("accepts an 8 MB phone photo — compression brings it to ~2.5 MB", () => {
        expect(validateMediaFiles([sized("IMG_0001.JPG", "image/jpeg", 8 * MB)])).toBeNull()
    })

    it("rejects a 30 MB photo with the shared message", () => {
        expect(validateMediaFiles([sized("huge.jpg", "image/jpeg", 30 * MB)])).toBe(IMAGE_TOO_LARGE_MESSAGE)
    })

    it("accepts a .heic with no type", () => {
        expect(validateMediaFiles([sized("IMG_0002.heic", "")])).toBeNull()
    })

    it("still refuses what is neither a photo nor a video", () => {
        expect(validateMediaFiles([sized("notes.pdf", "")])).toBe("Unsupported file type: notes.pdf")
    })

    it("still refuses a photo next to a video, typed or not", () => {
        expect(
            validateMediaFiles([sized("IMG_0002.heic", ""), sized("clip.mp4", "video/mp4")])
        ).toBe("Cannot mix images and videos in one post.")
    })
})

describe("the other photo surfaces", () => {
    it("chat accepts an untyped .heic and keeps its own 25 MB ceiling", () => {
        expect(validateChatImages([sized("IMG_3.heic", "", 8 * MB)])).toBeNull()
        expect(validateChatImages([sized("big.jpg", "image/jpeg", 30 * MB)])).toBe(
            "Each image must be under 25 MB."
        )
    })

    it("match photos take 25 MB and an untyped .heic", () => {
        expect(validateMatchPhoto(sized("IMG_4.jpg", "image/jpeg", 12 * MB))).toBeNull()
        expect(validateMatchPhoto(sized("IMG_5.heic", ""))).toBeNull()
        expect(validateMatchPhoto(sized("big.jpg", "image/jpeg", 30 * MB))).toMatch(/over 25 MB/)
    })

    it("support screenshots take 25 MB and an untyped .heic", () => {
        expect(validateScreenshot(sized("shot.png", "image/png", 12 * MB))).toBeNull()
        expect(validateScreenshot(sized("IMG_6.heic", ""))).toBeNull()
        expect(validateScreenshot(sized("big.png", "image/png", 30 * MB))).toMatch(/over 25 MB/)
    })
})
