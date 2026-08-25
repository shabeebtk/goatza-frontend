"use client"

/**
 * The match photo, staged while the player keeps typing.
 *
 * The rule this hook exists to hold: THE UPLOAD MUST NEVER BLOCK THE FORM, AND
 * MUST NEVER COST THE PLAYER THEIR STATS.
 *
 *   - Picking a file starts the upload immediately and shows a local preview,
 *     so the player carries on filling in the match while it runs.
 *   - `settle()` is what submit calls. If the upload is still going it waits
 *     for it (the sheet says so, inline); if it failed it resolves to null and
 *     the match saves without the photo.
 *
 * A photo is the least important thing on this form. Everything here is about
 * making sure it cannot take anything more important down with it.
 */

import { useCallback, useEffect, useRef, useState } from "react"

import {
    uploadMatchPhoto,
    validateMatchPhoto,
    type UploadedMatchPhoto,
} from "../../services/matchPhoto.service"

export type MatchPhotoStatus = "empty" | "uploading" | "ready" | "failed"

export type SettledMatchPhoto = {
    /** The pair to send, or null when there is nothing new to send. */
    photo: UploadedMatchPhoto | null
    /** True only when a photo was staged AND did not make it. */
    failed: boolean
}

export type MatchPhotoUpload = {
    status: MatchPhotoStatus
    /** Object URL while uploading, the hosted URL once it lands. */
    previewUrl: string | null
    error: string | null
    /**
     * True once the player has picked a photo IN THIS SESSION — as opposed to
     * the one an edited entry already had.
     *
     * The form cannot answer this on its own: a picked photo does not touch any
     * form value until submit, so `isDirty` stays false for somebody whose only
     * change was adding a photo, and the discard guard would let them close
     * over it without asking.
     */
    staged: boolean
    pick: (file: File) => void
    retry: () => void
    clear: () => void
    /**
     * Resolve the upload so submit can proceed: waits for one still running,
     * and reports a failure rather than leaving the caller to read `status`.
     *
     * Reading `status` after an `await` would be reading the value captured
     * when the submit handler was created, which is exactly the render before
     * the upload finished — so the answer comes from refs, which are current.
     */
    settle: () => Promise<SettledMatchPhoto>
}

/**
 * @param existingUrl The photo the entry already has, when editing. Shown as
 *   the preview, and never re-sent: the server never returns a public_id, and
 *   `toCreateMatchPayload` only includes the photo keys when both are set.
 */
export const useMatchPhotoUpload = (existingUrl = ""): MatchPhotoUpload => {
    const [status, setStatus] = useState<MatchPhotoStatus>(
        existingUrl ? "ready" : "empty"
    )
    const [previewUrl, setPreviewUrl] = useState<string | null>(
        existingUrl || null
    )
    const [error, setError] = useState<string | null>(null)
    const [staged, setStaged] = useState(false)

    /** The in-flight upload, so `settle()` can await the one already running. */
    const pendingRef = useRef<Promise<UploadedMatchPhoto | null> | null>(null)
    /** What `settle()` returns once the upload has landed. */
    const uploadedRef = useRef<UploadedMatchPhoto | null>(null)
    /** Kept for retry — the compressed copy is thrown away with the attempt. */
    const fileRef = useRef<File | null>(null)
    const objectUrlRef = useRef<string | null>(null)
    /**
     * Picking a second photo while the first is still uploading has to make the
     * first one's result irrelevant, whichever order they finish in. Every
     * attempt carries the counter it started with and drops its own result if
     * the counter has since moved.
     */
    const attemptRef = useRef(0)

    const releasePreview = useCallback(() => {
        if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current)
            objectUrlRef.current = null
        }
    }, [])

    useEffect(() => releasePreview, [releasePreview])

    const start = useCallback(
        (file: File) => {
            const attempt = ++attemptRef.current

            uploadedRef.current = null
            setStatus("uploading")
            setError(null)

            const run = uploadMatchPhoto(file)
                .then((result) => {
                    if (attemptRef.current !== attempt) return null

                    uploadedRef.current = result
                    setStatus("ready")
                    // Swap the local blob for the hosted file — same image, but
                    // the blob URL dies with the tab and this one does not.
                    releasePreview()
                    setPreviewUrl(result.photo_url)
                    return result
                })
                .catch((err: unknown) => {
                    if (attemptRef.current !== attempt) return null

                    setStatus("failed")
                    setError(
                        err instanceof Error
                            ? err.message
                            : "That photo didn't upload."
                    )
                    return null
                })

            pendingRef.current = run
        },
        [releasePreview]
    )

    const pick = useCallback(
        (file: File) => {
            const problem = validateMatchPhoto(file)
            if (problem) {
                // A rejected pick leaves whatever was already staged alone —
                // choosing a file the app cannot use should not throw away one
                // it could.
                setError(problem)
                return
            }

            releasePreview()
            const url = URL.createObjectURL(file)
            objectUrlRef.current = url
            fileRef.current = file

            setPreviewUrl(url)
            setStaged(true)
            start(file)
        },
        [releasePreview, start]
    )

    const retry = useCallback(() => {
        if (fileRef.current) start(fileRef.current)
    }, [start])

    const clear = useCallback(() => {
        // Bumping the counter orphans any upload still running, so it cannot
        // come back and re-attach itself to a photo the player has removed.
        attemptRef.current += 1
        pendingRef.current = null
        uploadedRef.current = null
        fileRef.current = null

        releasePreview()
        setPreviewUrl(null)
        setStatus("empty")
        setError(null)
        setStaged(false)
    }, [releasePreview])

    const settle = useCallback(async (): Promise<SettledMatchPhoto> => {
        if (uploadedRef.current) {
            return { photo: uploadedRef.current, failed: false }
        }

        // Nothing was ever staged — an edit whose photo is the one the entry
        // already had, or a match with no photo at all.
        if (!pendingRef.current) return { photo: null, failed: false }

        const result = await pendingRef.current

        // A staged upload that resolved to nothing is one that failed: `clear`
        // drops the promise outright, so a replaced attempt never lands here.
        return { photo: result, failed: result === null }
    }, [])

    return { status, previewUrl, error, staged, pick, retry, clear, settle }
}
