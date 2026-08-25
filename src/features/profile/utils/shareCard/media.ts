/**
 * The two images on the card: the avatar and the cover.
 *
 * These used to build pre-sized provider derivatives, because every image on a
 * Satori render is a network round trip INSIDE the render and a 4MB phone photo
 * would dominate the response time of an endpoint that has to answer a crawler
 * in a couple of seconds.
 *
 * There is no resize service any more — media is served byte-for-byte from the
 * media domain — so these are passthrough. Two things make that acceptable:
 *
 *   - profile and cover photos are compressed IN THE BROWSER before upload
 *     (WebP, ≤2MB, ≤2000px on the longest side — see `usePhotoUpload`), so the
 *     "4MB phone photo" case cannot reach storage in the first place;
 *   - they are single fixed-slot objects with no separate thumbnail to prefer.
 *
 * If card render time ever becomes a problem, the fix is to upload a
 * card-sized derivative alongside the photo at upload time, the way posts and
 * chat already ship a 640px thumb — not to reintroduce a transform layer.
 */

import type { CardFormat } from "./types"

/**
 * Absolute URLs only.
 *
 * Satori fetches these mid-render, and a relative path is not something it can
 * resolve — a card is better off falling back to its branded pattern than
 * embedding a URL the render will fail on.
 */
function renderable(url: string | null | undefined): string | null {
    if (!url) return null
    return url.startsWith("https://") || url.startsWith("http://") ? url : null
}

export function avatarDerivative(url: string | null | undefined): string | null {
    return renderable(url)
}

export function coverDerivative(
    url: string | null | undefined,
    // Kept in the signature: both call sites pass it, and a format-specific
    // source is exactly what a future upload-time derivative would key on.
    _format: CardFormat
): string | null {
    return renderable(url)
}
