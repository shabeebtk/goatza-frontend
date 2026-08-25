/**
 * Upload one achievement's proof/showcase image.
 *
 * Same three-step flow as usePhotoUpload — compress → signed config from the
 * backend → straight to storage — with two deliberate differences:
 *
 *   1. It does NOT persist anything. A profile photo has its own endpoint and
 *      is saved the moment it uploads; an achievement image is one field of a
 *      form that hasn't been submitted yet, so this hands the URL + public_id
 *      back and AchievementModal writes them into the form. Uploading and then
 *      cancelling the modal leaves an orphan in storage — the same trade
 *      CreatePostModal already makes, and the alternative (holding the blob
 *      until submit) means the owner can't see what they picked.
 *   2. Lighter compression than a profile photo. This renders at thumbnail size
 *      on the card and full-width at most in a lightbox — 2000px at quality 0.9
 *      would be several hundred KB for something that is usually a phone snap
 *      of a certificate.
 */

import { useMutation } from "@tanstack/react-query"
import imageCompression from "browser-image-compression"

import {
    describeBlob,
    getUploadConfigApi,
    putToR2,
} from "@/shared/services/mediaUpload"

// ── Types ────────────────────────────────────────────────────

export type AchievementImageInput = {
    /** Cropped blob produced by getCroppedBlob(). */
    croppedBlob: Blob
    /** Original filename, for the extension. */
    originalName: string
}

export type AchievementImageResult = {
    secure_url: string
    public_id: string
}

// ── Limits ───────────────────────────────────────────────────

/** Hard gate before compression, matching usePhotoUpload. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

const COMPRESSION_OPTIONS = {
    maxSizeMB: 1,
    maxWidthOrHeight: 1600,
    initialQuality: 0.85,
    useWebWorker: true,
    fileType: "image/webp",
}

// ── Hook ─────────────────────────────────────────────────────

export const useAchievementImageUpload = () =>
    useMutation<AchievementImageResult, Error, AchievementImageInput>({
        mutationFn: async ({ croppedBlob, originalName }) => {
            const ext = originalName.split(".").pop() ?? "jpg"
            const file = new File([croppedBlob], `achievement.${ext}`, {
                type: croppedBlob.type || "image/jpeg",
            })

            if (file.size > MAX_IMAGE_BYTES) {
                throw new Error("File must be under 5 MB")
            }

            const compressed = await imageCompression(file, COMPRESSION_OPTIONS)

            // `achievements` is user-actor only and scoped server-side to
            // users/<id>/achievements with a fresh public_id per upload, so
            // replacing one award's image never touches another's.
            const res = await getUploadConfigApi("achievements", [
                describeBlob(compressed),
            ])
            const entry = res.uploads[0]
            if (!entry) throw new Error("Couldn't start the upload. Try again.")

            await putToR2(compressed, entry)

            // A fresh key per upload (no fixed slot), so no cache-buster is
            // needed — the URL is new every time.
            return { secure_url: entry.public_url, public_id: entry.key }
        },
    })
