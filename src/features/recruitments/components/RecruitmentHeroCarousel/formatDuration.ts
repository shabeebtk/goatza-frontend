/**
 * `m:ss` from the model's whole seconds (`RecruitmentMedia.duration`).
 *
 * Its own module rather than a local helper because the stage and the thumb
 * strip both render the chip, and a duration that reads "2:05" on the slide and
 * "2:5" on the thumb below it is exactly the drift a second copy produces.
 *
 * Null/absent duration → null, never "0:00": the field is nullable and an
 * unknown length must render as no chip at all, not as a zero-length video.
 */
export function formatDuration(seconds: number | null | undefined): string | null {
    if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null
    const whole = Math.floor(seconds)
    const m = Math.floor(whole / 60)
    const s = whole % 60
    return `${m}:${s.toString().padStart(2, "0")}`
}
