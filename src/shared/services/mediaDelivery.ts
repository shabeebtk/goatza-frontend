/**
 * Where to point an <img> or a <video>.
 *
 * This file replaces the old Cloudinary delivery layer, and is deliberately
 * almost empty. That is the point of the migration: the database now stores
 * FINAL, directly-playable URLs. `file_url` / `media_url` IS the object to
 * render, and `thumbnail_url` is a real second object sitting next to it — a
 * 640px WebP for images, a poster frame for videos.
 *
 * The old layer existed because Cloudinary stored the raw original: a 4K HEVC
 * clip straight off a phone, unplayable on half the devices in the app, so
 * every URL had to be rewritten into a `c_limit,q_auto,vc_h264` derivative
 * before it could be handed to a player. Nothing is stored raw any more —
 * images are compressed client-side before upload, videos will be encoded
 * client-side when they come back — so there is nothing left to rewrite. These
 * helpers pick a field. They do not transform, and they must not start to.
 *
 * They stay as named functions rather than being inlined at the call sites so
 * the fallback ORDER lives in one place: a chat message calls its poster
 * `media_thumbnail_url` and a post calls it `thumbnail_url`, and a component
 * should not have to know which shape it was handed.
 */

// ── The shape every media row happens to have ─────────────────

/**
 * Structural union of every media-carrying row in the app: `PostMedia`,
 * `Highlight`, chat `Message`, recruitment media. Each names its fields
 * slightly differently and none of them carry all four, so every field is
 * optional and the helpers below read them in a fixed priority order.
 */
export type MediaLike = {
    /** posts, highlights, recruitments. */
    file_url?: string | null
    /** chat messages. */
    media_url?: string | null
    /** posts, highlights, recruitments. */
    thumbnail_url?: string | null
    /** chat messages. */
    media_thumbnail_url?: string | null
}

/**
 * `blob:` and `data:` URLs pass through VERBATIM.
 *
 * This is a guarantee, not an accident, and it is load-bearing: the create and
 * edit modals hand their <video> and <img> a local object URL for the file the
 * user just picked, before anything has been uploaded. The old layer preserved
 * this by explicitly refusing to rewrite anything that did not look like a
 * Cloudinary URL. Here it holds because these helpers only ever READ a field
 * and hand back exactly what they found.
 *
 * If a transformation is ever reintroduced in this file, it MUST skip these two
 * schemes — see `isLocalPreview`.
 */
export function isLocalPreview(url: string): boolean {
    return url.startsWith("blob:") || url.startsWith("data:")
}

// ── Helpers ───────────────────────────────────────────────────

/**
 * The URL a <video> should play: the stored object itself.
 *
 * `file_url` first, `media_url` second — a row never has both, the two names
 * are just different vocabularies for the same column.
 */
export function videoSrc(m: MediaLike | null | undefined): string {
    if (!m) return ""
    return m.file_url ?? m.media_url ?? ""
}

/**
 * The poster frame for a <video>, or "" when there is none.
 *
 * Returning "" rather than undefined matches what the callers already do with
 * it: `poster={posterSrc(m) || undefined}` keeps an empty `poster` attribute
 * off the element, which is what stops the browser fetching the page itself as
 * an image.
 *
 * Video posters arrive in a later stage (they are uploaded by the client
 * alongside the clip), so this is legitimately empty for now on video rows.
 */
export function posterSrc(m: MediaLike | null | undefined): string {
    if (!m) return ""
    return m.thumbnail_url ?? m.media_thumbnail_url ?? ""
}

/**
 * The URL a list/grid <img> should load: the small copy when there is one.
 *
 * `fallbackToFull` (default true) covers every row created before thumbnails
 * existed — and chat messages sent before Stage 3, which have no thumbnail
 * object at all. Those load the full image exactly as they always did, so the
 * migration is invisible on old content.
 *
 * Pass `false` where a missing thumbnail should render nothing rather than pull
 * a full-size image into a small box.
 */
export function thumbSrc(
    m: MediaLike | null | undefined,
    fallbackToFull = true
): string {
    if (!m) return ""
    const thumb = m.thumbnail_url ?? m.media_thumbnail_url ?? ""
    if (thumb) return thumb
    return fallbackToFull ? videoSrc(m) : ""
}

/**
 * The adaptive-streaming manifest — always "".
 *
 * HLS is parked, not deleted. It was a Cloudinary streaming profile (`sp_hd`),
 * which has no R2 equivalent: adaptive streaming needs a rendition ladder built
 * by something, and nothing builds one now.
 *
 * `useAdaptiveVideo` already treats an empty `hlsSrc` as "mp4 only" and returns
 * BEFORE it even imports hls.js, so every caller keeps working unchanged and no
 * manifest is requested and no library downloaded. Callers still pass this
 * through rather than dropping the prop, so re-enabling adaptive delivery later
 * is a change to this one function.
 */
export function hlsSrc(): string {
    return ""
}
