"use client"

/**
 * useVideoPreviewFrame — a still of the clip a composer has just been given.
 *
 * iPhone Safari paints nothing for a paused `preload="metadata"` video on a
 * blob, so without this the preview is an empty box until it is played. The same
 * frame then goes to the upload queue, which would otherwise decode the file a
 * second time just to get a picture for the upload screen. That is why the Blob
 * is exposed as well as the URL: the composer revokes this hook's URL when it
 * closes, and the queue outlives it, so the queue gets a URL of its own.
 */

import { useEffect, useState } from "react"

import { frameToJpeg, grabVideoFrame } from "@/shared/services/videoFrame"

/** The same bound as captureVideoThumbnail, the other preview. */
const GRAB_TIMEOUT_MS = 6000
/** The preview is a small picture, and so is the upload screen's. */
const GRAB_MAX_SIDE = 1280

export type VideoPreviewFrame = {
    /** Still working on it. */
    grabbing: boolean
    /** The frame, for an <img>. Null while grabbing, and when none could be had. */
    url: string | null
    /** The same frame, for whoever needs a URL that outlives this component. */
    blob: Blob | null
}

type Grabbed = { file: File; url: string | null; blob: Blob | null }

export function useVideoPreviewFrame(file: File | null): VideoPreviewFrame {
    const [grabbed, setGrabbed] = useState<Grabbed | null>(null)

    useEffect(() => {
        if (!file) return

        const controller = new AbortController()
        let url: string | null = null

        void (async () => {
            const frame = await grabVideoFrame(file, {
                maxSide: GRAB_MAX_SIDE,
                timeoutMs: GRAB_TIMEOUT_MS,
                signal: controller.signal,
            })
            const blob = frame ? await frameToJpeg(frame.canvas) : null
            if (controller.signal.aborted) return
            url = blob ? URL.createObjectURL(blob) : null
            setGrabbed({ file, url, blob })
        })()

        return () => {
            controller.abort()
            if (url) URL.revokeObjectURL(url)
        }
    }, [file])

    // By file, not by effect timing: the moment a different clip is staged, what
    // was grabbed for the last one no longer describes anything.
    const current = grabbed?.file === file ? grabbed : null
    return {
        grabbing: Boolean(file) && !current,
        url: current?.url ?? null,
        blob: current?.blob ?? null,
    }
}
