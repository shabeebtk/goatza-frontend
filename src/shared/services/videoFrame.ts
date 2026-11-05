/**
 * One frame out of a video, and not a black one.
 *
 * Everything that wants a still of a clip comes through here: the composer's
 * preview, the upload screen and chat bubbles (captureVideoThumbnail) and the
 * poster uploaded with the post (capturePoster), which becomes its thumbnail in
 * the feed.
 *
 * Two things make the obvious "seek to 0.1 s, draw on `seeked`" come out black:
 *
 *   - 0.1 s is often really black on a phone recording: the exposure ramp, or a
 *     fade in. So several moments are tried, and each frame is looked at.
 *   - iOS can fire `seeked` before the frame is decoded, and drawImage then gets
 *     black. So a frame is drawn only once it has really been presented.
 *
 * A clip that is dark from start to finish still gets a poster: the brightest
 * frame seen.
 */

export type GrabbedFrame = {
    canvas: HTMLCanvasElement
    width: number
    height: number
    /** Where in the clip it came from, in seconds. */
    time: number
}

export type GrabVideoFrameOptions = {
    /** The longest side of the result. Never scales up. Default: the video's own. */
    maxSide?: number
    /** Past this it settles with the best frame so far, or null with none. */
    timeoutMs: number
    /** Aborting settles it with null at once. */
    signal?: AbortSignal
}

const MAX_CANDIDATES = 4
const CANDIDATE_SECONDS = [0.1, 0.5, 1]
const CANDIDATE_FRACTIONS = [0.1, 0.25]
/** Two candidates this close are the same frame, near enough. */
const SAME_MOMENT_SECONDS = 0.05

/** requestVideoFrameCallback does not fire for a detached element everywhere. */
const FRAME_CALLBACK_FALLBACK_MS = 300

const SAMPLE_SIZE = 32
const BLACK_AVERAGE_LUMA = 16
const BLACK_MAX_LUMA = 40

/**
 * The moments worth looking at, ascending and inside the clip. With no usable
 * duration (a phone can report NaN or Infinity for a blob) only the absolute
 * ones can be asked for; a clip too short for any of them gets its middle.
 */
export function frameCandidateTimes(duration: number): number[] {
    if (!Number.isFinite(duration) || duration <= 0) return CANDIDATE_SECONDS.slice(0, MAX_CANDIDATES)

    const ascending = [...CANDIDATE_SECONDS, ...CANDIDATE_FRACTIONS.map((fraction) => duration * fraction)]
        .filter((time) => time < duration)
        .sort((a, b) => a - b)

    const times: number[] = []
    for (const time of ascending) {
        const previous = times[times.length - 1]
        if (previous === undefined || time - previous >= SAME_MOMENT_SECONDS) times.push(time)
    }
    if (times.length === 0) return [duration / 2]

    // One too many: 10% goes rather than 25%. It is the one that adds least, and
    // on a short clip sits right beside 0.5 s, while 25% is the furthest reach
    // past a long dark opening.
    return times.length > MAX_CANDIDATES ? times.filter((time) => time !== duration * 0.1) : times
}

export type FrameLuma = { average: number; max: number }

/**
 * How bright a frame is, from a 32×32 copy of it. Null when it cannot be read,
 * which says nothing about the frame: the caller takes it as it is.
 */
export function measureFrameLuma(source: CanvasImageSource): FrameLuma | null {
    try {
        const sample = document.createElement("canvas")
        sample.width = SAMPLE_SIZE
        sample.height = SAMPLE_SIZE
        const ctx = sample.getContext("2d", { willReadFrequently: true })
        if (!ctx) return null

        ctx.drawImage(source, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
        const { data } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE)

        let total = 0
        let max = 0
        for (let i = 0; i < data.length; i += 4) {
            const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
            total += luma
            if (luma > max) max = luma
        }
        return { average: total / (SAMPLE_SIZE * SAMPLE_SIZE), max }
    } catch {
        return null
    }
}

export const isBlackLuma = ({ average, max }: FrameLuma): boolean =>
    average < BLACK_AVERAGE_LUMA && max < BLACK_MAX_LUMA

/** A frame as a JPEG, for a preview. Null when the canvas refuses. */
export function frameToJpeg(canvas: HTMLCanvasElement, quality = 0.8): Promise<Blob | null> {
    return new Promise((resolve) => {
        try {
            canvas.toBlob(resolve, "image/jpeg", quality)
        } catch {
            resolve(null)
        }
    })
}

/** iOS holds a canvas's memory until its size is zero. */
function releaseCanvas(canvas: HTMLCanvasElement) {
    canvas.width = 0
    canvas.height = 0
}

function drawFrame(video: HTMLVideoElement, maxSide: number | undefined): HTMLCanvasElement | null {
    const { videoWidth, videoHeight } = video
    if (!videoWidth || !videoHeight) return null

    const longest = Math.max(videoWidth, videoHeight)
    const scale = maxSide && longest > maxSide ? maxSide / longest : 1

    const canvas = document.createElement("canvas")
    canvas.width = Math.round(videoWidth * scale)
    canvas.height = Math.round(videoHeight * scale)
    const ctx = canvas.getContext("2d")
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas
}

/**
 * `seeked` is not "the frame is there", which is the black frame on iOS. On a
 * paused element a frame presented just before this asked leaves nothing to wait
 * for, which is one more reason for the fallback.
 */
function framePresented(video: HTMLVideoElement): Promise<void> {
    return new Promise((resolve) => {
        if (typeof video.requestVideoFrameCallback !== "function") {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
            return
        }
        const timer = setTimeout(() => {
            video.cancelVideoFrameCallback?.(callbackId)
            resolve()
        }, FRAME_CALLBACK_FALLBACK_MS)
        const callbackId = video.requestVideoFrameCallback(() => {
            clearTimeout(timer)
            resolve()
        })
    })
}

async function seekAndPresent(video: HTMLVideoElement, time: number): Promise<void> {
    await new Promise<void>((resolve) => {
        video.onseeked = () => {
            video.onseeked = null
            resolve()
        }
        video.currentTime = time
    })
    await framePresented(video)
}

/**
 * The first frame worth showing, or the brightest of a dark clip. Null only when
 * the video cannot be read at all, in time. It always settles, and it always
 * lets go of the element and the object URL.
 */
export function grabVideoFrame(
    source: Blob,
    { maxSide, timeoutMs, signal }: GrabVideoFrameOptions
): Promise<GrabbedFrame | null> {
    return new Promise((resolve) => {
        if (signal?.aborted) {
            resolve(null)
            return
        }

        const url = URL.createObjectURL(source)
        const video = document.createElement("video")
        // `auto`, not `metadata`: this needs a decoded frame, and with `metadata`
        // a phone may never get as far as `loadeddata`.
        video.preload = "auto"
        video.muted = true
        video.playsInline = true

        let settled = false
        let best: (GrabbedFrame & { luma: number }) | null = null

        const finish = (result: GrabbedFrame | null) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            signal?.removeEventListener("abort", onAbort)
            if (best && best.canvas !== result?.canvas) releaseCanvas(best.canvas)

            video.onloadeddata = null
            video.onseeked = null
            video.onerror = null
            URL.revokeObjectURL(url)
            video.removeAttribute("src")
            // Drops the buffered data now rather than whenever it is collected.
            video.load()

            resolve(result)
        }
        const finishWithBest = () => {
            const frame = best
            if (!frame) {
                finish(null)
                return
            }
            finish({ canvas: frame.canvas, width: frame.width, height: frame.height, time: frame.time })
        }
        function onAbort() {
            finish(null)
        }

        /** True when this frame is the one: it is not black, or cannot be read. */
        const consider = (time: number): boolean => {
            const canvas = drawFrame(video, maxSide)
            if (!canvas) return false

            const luma = measureFrameLuma(canvas)
            if (!luma || !isBlackLuma(luma)) {
                finish({ canvas, width: canvas.width, height: canvas.height, time })
                return true
            }
            if (!best || luma.average > best.luma) {
                if (best) releaseCanvas(best.canvas)
                best = { canvas, width: canvas.width, height: canvas.height, time, luma: luma.average }
            } else {
                releaseCanvas(canvas)
            }
            return false
        }

        const run = async () => {
            const duration = video.duration
            const known = Number.isFinite(duration) && duration > 0
            // With no duration to go by, a seek may never answer. What is already
            // decoded goes first, so that costs nothing.
            if (!known && consider(video.currentTime || 0)) return

            for (const time of frameCandidateTimes(duration)) {
                await seekAndPresent(video, time)
                if (settled) return
                if (consider(time)) return
            }
            finishWithBest()
        }

        // A seek that throws (mobile Safari can refuse one on a blob): whatever is
        // decoded right now is still better than no frame.
        const lastResort = () => {
            if (settled) return
            try {
                if (consider(video.currentTime || 0)) return
            } catch {
                /* the best so far, or nothing */
            }
            finishWithBest()
        }

        // The bound that makes "always settles" true: a blob-sourced <video> on
        // mobile Safari can sit in limbo with no event at all.
        const timer = setTimeout(finishWithBest, timeoutMs)
        signal?.addEventListener("abort", onAbort)

        video.onerror = finishWithBest
        video.onloadeddata = () => {
            video.onloadeddata = null
            run().catch(lastResort)
        }

        video.src = url
        video.load()
    })
}
