"use client"

/**
 * Attach the best available source to an existing <video>: HLS adaptive
 * streaming where the browser can take it, the canonical mp4 everywhere else.
 *
 * HLS is the difference between committing to one bitrate at the first frame
 * and switching renditions live as the network changes — which is what makes
 * playback survive a phone walking off wifi mid-clip.
 *
 * The hook OWNS `video.src`. Do not also set a `src` attribute on the element:
 * hls.js attaches through MediaSource and a React-controlled `src` would fight
 * it on every render.
 *
 * SSR-safe: hls.js is only ever reached through a dynamic `import()` inside an
 * effect, so it never lands in the server bundle or the initial client chunk.
 */

import { useEffect, useRef, type RefObject } from "react"

export type AdaptiveVideoOptions = {
    /** HLS manifest (videoHlsUrl). Empty/omitted → mp4 only. */
    hlsSrc?: string
    /** The always-works fallback (videoDeliveryUrl). Required. */
    mp4Src: string
    /**
     * Gate for lazy surfaces. While false NOTHING is fetched beyond what the
     * element's own `preload` allows — the feed relies on this to keep
     * off-screen posts silent.
     */
    enabled?: boolean
    /**
     * Seconds of look-ahead hls.js may buffer. Feed videos want this small so a
     * post the user scrolls past doesn't download a minute of video first.
     */
    maxBufferLength?: number
}

export type AdaptiveVideoStatus = {
    /**
     * True while the element is playing a source the hook can still recover
     * from — i.e. an `error` event right now means "switch to mp4", not "this
     * clip is broken".
     *
     * Read this from your own `onError` handler before showing anything to the
     * user. It matters on iOS: native HLS surfaces a missing manifest as a real
     * element `error`, and during rollout that is simply a clip whose backfill
     * hasn't run yet.
     */
    canFallBackRef: RefObject<boolean>
}

/** hls.js only matters where MediaSource exists; everything else gets mp4. */
export function useAdaptiveVideo(
    videoRef: RefObject<HTMLVideoElement | null>,
    { hlsSrc, mp4Src, enabled = true, maxBufferLength }: AdaptiveVideoOptions
): AdaptiveVideoStatus {
    const canFallBackRef = useRef(false)

    useEffect(() => {
        const video = videoRef.current
        if (!video) return

        // Swapping a source pauses the element, so capture the intent BEFORE
        // touching it — afterwards there is no way to tell whether anyone
        // wanted this playing.
        const wantsPlayback =
            video.autoplay || (!video.paused && !video.ended)

        const resume = () => {
            if (!wantsPlayback) return
            video.play().catch(() => undefined)
        }

        // NOT named use* — the lint rule would read a `use` prefix as a React
        // Hook and reject every call site below.
        const fallBackToMp4 = () => {
            canFallBackRef.current = false
            if (video.src !== mp4Src) video.src = mp4Src
            resume()
        }

        // ── 1. Gated off, or no manifest to try → plain mp4 ──────
        if (!enabled || !hlsSrc) {
            fallBackToMp4()
            return
        }

        // ── 2. Native HLS (Safari / iOS) — no library involved ───
        // Cheaper and smoother than MSE on Apple hardware, so it wins even when
        // hls.js would also work.
        if (video.canPlayType("application/vnd.apple.mpegurl")) {
            canFallBackRef.current = true
            video.src = hlsSrc
            resume()

            // One shot: a missing manifest (not yet backfilled) or a broken
            // ladder drops to mp4 without the viewer noticing.
            const onNativeError = () => {
                if (!canFallBackRef.current) return
                fallBackToMp4()
            }
            video.addEventListener("error", onNativeError)

            return () => {
                video.removeEventListener("error", onNativeError)
                canFallBackRef.current = false
            }
        }

        // ── 3. hls.js over MediaSource (Chrome, Firefox, Edge) ───
        let hls: import("hls.js").default | null = null
        let cancelled = false

        void import("hls.js").then(({ default: Hls }) => {
            // The effect may have been torn down while the chunk was loading.
            if (cancelled) return

            // ── 4. No MSE at all → mp4 ──────────────────────────
            if (!Hls.isSupported()) {
                fallBackToMp4()
                return
            }

            canFallBackRef.current = true

            hls = new Hls(
                maxBufferLength === undefined
                    ? undefined
                    : {
                          maxBufferLength,
                          // Without this the length cap is advisory: hls.js
                          // keeps buffering until the SIZE cap is hit too.
                          maxMaxBufferLength: maxBufferLength,
                      }
            )

            hls.on(Hls.Events.ERROR, (_event, data) => {
                // Non-fatal errors are hls.js doing its job (a segment retried,
                // a rendition dropped) — leave it alone.
                if (!data.fatal) return
                // Fatal covers the rollout case we actually expect: a 404 on a
                // manifest for a clip the backfill hasn't reached. Silent and
                // immediate, no retry ladder — mp4 is right there.
                hls?.destroy()
                hls = null
                fallBackToMp4()
            })

            hls.on(Hls.Events.MANIFEST_PARSED, resume)

            hls.loadSource(hlsSrc)
            hls.attachMedia(video)
        })

        return () => {
            cancelled = true
            hls?.destroy()
            hls = null
            canFallBackRef.current = false
        }
    }, [videoRef, hlsSrc, mp4Src, enabled, maxBufferLength])

    return { canFallBackRef }
}
