/**
 * useHighlightUpload — the whole direct-upload flow behind one hook:
 *
 *   pick → validate (mime/size/90s) → encode in-browser → capture the 9:16
 *   poster → sign → PUT both objects (progress, cancelable) → POST create →
 *   rail cache updated.
 *
 * Every failure ends in a sonner toast carrying the human message, with a Retry
 * action when retrying could actually help (a network/upload failure — not a
 * rejected file or a full rail).
 *
 * Nothing is left dangling: unmounting aborts the in-flight upload, and a
 * cancel is silent by design (the user asked for it, it isn't an error).
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import {
    getHighlightErrorMessage,
    isHighlightCapError,
} from "../services/highlights.api"
import {
    checkHighlightDuration,
    isUploadCancelled,
    uploadHighlightVideo,
    validateHighlightFile,
    type HighlightVideoMeta,
} from "../services/highlightUpload.service"
import type { Highlight, HighlightVisibility } from "../types"
import { useCreateHighlight } from "./useHighlights"

// ── State ─────────────────────────────────────────────────────

export type HighlightUploadStatus =
    | "idle"
    | "checking"    // reading metadata / validating
    | "uploading"   // encoding, then bytes in flight to storage
    | "saving"      // creating the highlight row
    | "failed"

export type HighlightUploadState = {
    status: HighlightUploadStatus
    /** 0–100 across the WHOLE operation: encode is 0→70, upload 70→100. */
    progress: number
    fileName: string | null
    error: string | null
    /** Whether re-running the same file could plausibly succeed. */
    retryable: boolean
    /**
     * True while the browser is re-encoding, before any bytes move. The encode
     * is the slower half on a phone, so the UI says so instead of showing a
     * stalled "uploading".
     */
    optimizing: boolean
}

const IDLE_STATE: HighlightUploadState = {
    status: "idle",
    progress: 0,
    fileName: null,
    error: null,
    retryable: false,
    optimizing: false,
}

export type StartHighlightUploadOptions = {
    title?: string
    visibility?: HighlightVisibility
    /**
     * Metadata the caller already read from the file (the add modal probes it
     * when staging the preview). Passing it skips a second probe, which on a
     * phone can stall for seconds before the first byte moves — the upload bar
     * should start filling immediately, not after a hidden re-check.
     */
    knownMeta?: HighlightVideoMeta | null
}

type Job = StartHighlightUploadOptions & {
    file: File
    /** Cached across retries so a re-run doesn't re-probe the file. */
    meta: HighlightVideoMeta | null
}

export function useHighlightUpload(options?: {
    onCreated?: (highlight: Highlight) => void
}) {
    const [state, setState] = useState<HighlightUploadState>(IDLE_STATE)

    const createHighlight = useCreateHighlight()

    const controllerRef = useRef<AbortController | null>(null)
    const jobRef = useRef<Job | null>(null)
    const mountedRef = useRef(true)
    /**
     * The pipeline, so the failure toast's Retry action can re-run it without
     * `run` having to reference itself (and without going stale).
     */
    const runRef = useRef<((job: Job) => Promise<void>) | null>(null)

    // `onCreated` through a ref: callers pass an inline arrow, and depending on
    // it directly would rebuild `start` on every render of theirs.
    const onCreated = options?.onCreated
    const onCreatedRef = useRef(onCreated)

    useEffect(() => {
        onCreatedRef.current = onCreated
    }, [onCreated])

    useEffect(
        () => () => {
            mountedRef.current = false
            // Navigating away mid-upload must not leave an XHR (or a toast for a
            // screen that no longer exists) behind.
            controllerRef.current?.abort()
            controllerRef.current = null
            jobRef.current = null
        },
        []
    )

    /** setState that a finished-but-unmounted flow can call safely. */
    const patch = useCallback((next: Partial<HighlightUploadState>) => {
        if (!mountedRef.current) return
        setState((prev) => ({ ...prev, ...next }))
    }, [])

    /** Re-run the last job (same file, same title/visibility). Stable. */
    const retry = useCallback(() => {
        const job = jobRef.current
        if (job) void runRef.current?.(job)
    }, [])

    const fail = useCallback(
        (message: string, retryable = false) => {
            patch({ status: "failed", error: message, progress: 0, retryable, optimizing: false })
            toast.error(
                message,
                retryable
                    ? { action: { label: "Retry", onClick: retry } }
                    : undefined
            )
        },
        [patch, retry]
    )

    // ── the pipeline for one job ───────────────────────────────
    const run = useCallback(
        async (job: Job) => {
            jobRef.current = job

            const controller = new AbortController()
            controllerRef.current = controller

            patch({
                status: "uploading",
                progress: 0,
                fileName: job.file.name,
                error: null,
                optimizing: true,
            })

            try {
                const uploaded = await uploadHighlightVideo(job.file, {
                    localMeta: job.meta,
                    signal: controller.signal,
                    onProgress: (loaded, total, phase) => {
                        // 5% steps — enough for a progress ring, few enough that
                        // a big file doesn't re-render the tile hundreds of times.
                        const pct = Math.min(
                            99,
                            Math.round((loaded / total) * 20) * 5
                        )
                        patch({
                            progress: pct,
                            optimizing: phase === "encoding",
                        })
                    },
                })

                if (controller.signal.aborted) return

                patch({ status: "saving", progress: 100, optimizing: false })

                const created = await createHighlight.mutateAsync({
                    file_url: uploaded.file_url,
                    public_id: uploaded.public_id,
                    thumbnail_url: uploaded.thumbnail_url,
                    duration: uploaded.duration,
                    width: uploaded.width,
                    height: uploaded.height,
                    ...(job.title ? { title: job.title } : {}),
                    ...(job.visibility ? { visibility: job.visibility } : {}),
                })

                controllerRef.current = null
                jobRef.current = null

                if (mountedRef.current) setState(IDLE_STATE)
                onCreatedRef.current?.(created)
                toast.success("Added to your highlights")
            } catch (err) {
                controllerRef.current = null

                // A cancel already reset the UI — never resurrect it as an error.
                if (isUploadCancelled(err)) return

                // The rail is full (or the clip was rejected server-side): the
                // same bytes will fail again, so no Retry action.
                if (isHighlightCapError(err)) {
                    jobRef.current = null
                    fail(
                        "You already have 10 highlights. Delete one to add another."
                    )
                    return
                }

                // NEVER surface a raw thrown message here: an AxiosError is an
                // Error whose `.message` is "Request failed with status code
                // 404", which tells a player nothing. getHighlightErrorMessage
                // prefers the server's own human message, keeps the friendly
                // strings the upload leg throws, and falls back to this line.
                const message = getHighlightErrorMessage(
                    err,
                    "Couldn't add your highlight. Please try again."
                )

                // `createHighlight` already toasted its own API error; only the
                // upload leg needs a toast (and a retry) from here.
                if (createHighlight.isError) {
                    patch({ status: "failed", error: message, progress: 0, optimizing: false })
                    return
                }

                fail(message, true)
            }
        },
        [createHighlight, fail, patch]
    )

    useEffect(() => {
        runRef.current = run
    }, [run])

    // ── public API ─────────────────────────────────────────────

    /** Validate the picked file, then upload and create. */
    const start = useCallback(
        async (file: File, opts?: StartHighlightUploadOptions) => {
            // A second pick while one is in flight replaces it, rather than
            // racing two uploads into the same rail.
            controllerRef.current?.abort()
            controllerRef.current = null

            const fileError = validateHighlightFile(file)
            if (fileError) {
                jobRef.current = null
                fail(fileError)
                return
            }

            patch({
                status: "checking",
                progress: 0,
                fileName: file.name,
                error: null,
            })

            let meta = opts?.knownMeta ?? null

            if (meta === null) {
                const checked = await checkHighlightDuration(file)
                if (checked.error) {
                    jobRef.current = null
                    fail(checked.error)
                    return
                }
                meta = checked.meta
            }

            await run({ file, meta, ...opts })
        },
        [fail, patch, run]
    )

    /** Abort an in-flight upload and forget it — silent, not a failure. */
    const cancel = useCallback(() => {
        controllerRef.current?.abort()
        controllerRef.current = null
        jobRef.current = null
        if (mountedRef.current) setState(IDLE_STATE)
    }, [])

    const reset = useCallback(() => {
        if (mountedRef.current) setState(IDLE_STATE)
    }, [])

    return {
        ...state,
        isBusy:
            state.status === "checking" ||
            state.status === "uploading" ||
            state.status === "saving",
        canRetry: state.status === "failed" && state.retryable,
        start,
        cancel,
        retry,
        reset,
    }
}
