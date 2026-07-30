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

/**
 * Renditions below this are never selected automatically. 360p and down look
 * genuinely bad on a modern phone, and sport footage at 180p is unwatchable.
 */
const MIN_AUTO_HEIGHT = 480

/**
 * hls.js assumes ~500kbps before it has measured anything, which lands the
 * first segment on the 180p rung. Feed videos then buffer only ~10s, which
 * yields too few bandwidth samples to climb back out before the user has
 * scrolled on — so it looked permanently stuck at 180p until a refresh.
 */
const ABR_START_ESTIMATE_BPS = 2_000_000

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

/**
 * Stop ABR from ever choosing a sub-480p rendition.
 *
 * Trade-off, and it is deliberate: on a genuinely slow connection the player
 * now rebuffers instead of dropping to a rendition that looks broken. We would
 * rather make someone wait than show them 180p football.
 *
 * Left completely alone when no rendition reaches 480p — a short or oddly
 * encoded upload must not end up with a floor that excludes its whole ladder.
 */
function applyQualityFloor(hls: import("hls.js").default): void {
    const levels = hls.levels ?? []
    if (levels.length < 2) return

    // Portrait clips are encoded taller than they are wide, so "480p" means the
    // SHORTER side — height alone would wrongly pass a 480x854 vertical clip's
    // smaller rungs.
    const shortSide = (level: { width?: number; height?: number }): number => {
        if (level.width && level.height) return Math.min(level.width, level.height)
        return level.height || level.width || 0
    }

    let floorBitrate = Infinity
    for (const level of levels) {
        if (shortSide(level) >= MIN_AUTO_HEIGHT && level.bitrate < floorBitrate) {
            floorBitrate = level.bitrate
        }
    }

    // Nothing qualifies, or nothing sits below it → no floor to apply.
    if (floorBitrate === Infinity) return
    if (!levels.some((level) => level.bitrate < floorBitrate)) return

    // minAutoBitrate is exclusive of the rungs below it; -1 keeps the 480p
    // level itself selectable.
    hls.config.minAutoBitrate = floorBitrate - 1
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

            hls = new Hls({
                abrEwmaDefaultEstimate: ABR_START_ESTIMATE_BPS,
                // Explicit: the rendition is never capped by the element's
                // pixel size. A feed tile is small but goes fullscreen from the
                // same element, and we would rather pay bytes than show a
                // blurry upscale.
                capLevelToPlayerSize: false,
                // Auto start level — the floor below does the constraining.
                startLevel: -1,
                ...(maxBufferLength === undefined
                    ? {}
                    : {
                          maxBufferLength,
                          // Without this the length cap is advisory: hls.js
                          // keeps buffering until the SIZE cap is hit too.
                          maxMaxBufferLength: maxBufferLength,
                      }),
            })

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

            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                if (hls) applyQualityFloor(hls)
                resume()
            })

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
