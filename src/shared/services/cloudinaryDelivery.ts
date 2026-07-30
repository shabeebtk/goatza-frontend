/**
 * Cloudinary delivery URLs for video.
 *
 * Uploads store the RAW original: `file_url` / `media_url` can be a 4K HEVC clip
 * straight off an iPhone. Playing that original is what makes low-end devices
 * stutter, drain battery, or show nothing at all — so every `<video>` in the app
 * plays a derivative built by these helpers instead of the stored URL.
 *
 * Style follows `cloudinaryThumb()` in chatUpload.service.ts: pure string work,
 * never throws, and anything that doesn't look like a Cloudinary delivery URL is
 * handed back untouched. The `blob:` previews the create/edit modals feed their
 * players rely on exactly that — they must never be rewritten.
 */

// ── The canonical transform ───────────────────────────────────

/**
 * MUST stay byte-identical (including parameter order) with the backend eager
 * transformation in services/storage/cloudinary.py. Changing one without the
 * other silently re-introduces cold-start transcoding.
 *
 * Why these parameters:
 * - `c_limit,h_1280,w_1280` — caps the LONGEST side at 1280 and never upscales,
 *   so landscape lands at 1280×720 and portrait at 720×1280. One parameter set,
 *   a proper 720p equivalent for both orientations.
 * - `q_auto:good` — Cloudinary picks the bitrate; `good` is the tier that keeps
 *   sport footage (fast motion, grass texture) from turning to mush.
 * - `vc_h264` — universal hardware decode. This is the parameter that fixes
 *   HEVC/4K originals which low-end Android devices cannot decode at all.
 * - Fixed H.264/MP4 rather than `f_auto`: one deterministic output, so the
 *   backend's eager generation pre-builds exactly ONE derivative instead of a
 *   per-browser matrix of them.
 */
export const VIDEO_DELIVERY_TRANSFORM =
    "c_limit,h_1280,w_1280,q_auto:good,vc_h264"

/** Output container/extension that goes with {@link VIDEO_DELIVERY_TRANSFORM}. */
const VIDEO_DELIVERY_EXTENSION = "mp4"

/**
 * HLS adaptive streaming: one manifest pointing at a ladder of renditions, so
 * the player switches quality live instead of committing to one bitrate at the
 * first frame.
 *
 * Pairs with VIDEO_HLS_TRANSFORMATION / VIDEO_HLS_FORMAT in the backend
 * (services/storage/cloudinary.py). Adaptive streaming CANNOT be built on
 * request — Cloudinary only produces a manifest as an eager derivative — so a
 * clip whose backfill hasn't run yet returns 404 here. That is expected during
 * rollout and is exactly what the mp4 fallback in useAdaptiveVideo is for.
 */
export const VIDEO_HLS_TRANSFORM = "sp_hd"

/** Manifest extension that goes with {@link VIDEO_HLS_TRANSFORM}. */
const VIDEO_HLS_EXTENSION = "m3u8"

// ── URL plumbing ──────────────────────────────────────────────

const UPLOAD_MARKER = "/upload/"

/**
 * Cloudinary transformation keys we might realistically meet in a stored URL.
 * The point isn't completeness — it's telling a transformation component apart
 * from a version segment (`v1699999999`) or a plain folder name.
 */
const TRANSFORM_KEYS = new Set([
    "a", "ac", "af", "ar", "b", "bo", "br", "c", "co", "cs", "d", "dl", "dn",
    "dpr", "du", "e", "eo", "f", "fl", "fn", "g", "h", "ki", "l", "o", "p",
    "pg", "q", "r", "so", "sp", "t", "u", "vc", "vs", "w", "x", "y", "z",
])

/** Params that mean a poster URL is already sized/quality-tuned — leave it be. */
const SIZING_KEYS = new Set(["c", "w", "h", "q", "ar", "dpr"])

/**
 * True only for a Cloudinary delivery URL. `blob:`, `data:`, same-origin and
 * any other host fall through here and every helper returns them verbatim.
 */
function isCloudinaryUrl(url: string): boolean {
    return url.includes("cloudinary.com/") && url.includes(UPLOAD_MARKER)
}

/** Is `segment` a transformation component rather than a version or folder? */
function isTransformComponent(segment: string): boolean {
    // A dot means we're looking at a filename, never a transformation.
    if (!segment || segment.includes(".")) return false
    return segment.split(",").every((part) => {
        const sep = part.indexOf("_")
        return sep > 0 && TRANSFORM_KEYS.has(part.slice(0, sep))
    })
}

type SplitUrl = {
    /** Everything up to and including `/upload/`. */
    head: string
    /** First path segment after `/upload/`: a transformation, or `v123…`. */
    first: string
    /** Everything after `first` (no leading slash). May be empty. */
    rest: string
    /** `?…` / `#…` tail, preserved verbatim. */
    suffix: string
}

/**
 * Break a delivery URL at `/upload/`. Returns null when there is no such marker.
 * Query/hash are split off first: `.../clip.mov?_a=xyz` must not end up with the
 * extension rewritten after the query string.
 */
function splitDeliveryUrl(url: string): SplitUrl | null {
    const at = url.indexOf(UPLOAD_MARKER)
    if (at === -1) return null

    const head = url.slice(0, at + UPLOAD_MARKER.length)
    let path = url.slice(at + UPLOAD_MARKER.length)

    const cut = path.search(/[?#]/)
    const suffix = cut === -1 ? "" : path.slice(cut)
    if (cut !== -1) path = path.slice(0, cut)

    const slash = path.indexOf("/")
    return slash === -1
        ? { head, first: path, rest: "", suffix }
        : {
              head,
              first: path.slice(0, slash),
              rest: path.slice(slash + 1),
              suffix,
          }
}

/**
 * Replace the final extension of the LAST path segment. A folder with a dot in
 * its name survives, and a public_id with no extension simply gains one.
 */
function forceExtension(path: string, extension: string): string {
    const slash = path.lastIndexOf("/")
    const dir = slash === -1 ? "" : path.slice(0, slash + 1)
    const file = slash === -1 ? path : path.slice(slash + 1)
    const dot = file.lastIndexOf(".")
    const stem = dot === -1 ? file : file.slice(0, dot)
    return `${dir}${stem}.${extension}`
}

// ── Public helpers ────────────────────────────────────────────

/**
 * The URL every `<video>` should play: the stored original re-delivered through
 * {@link VIDEO_DELIVERY_TRANSFORM} as H.264/MP4.
 *
 * Changing the extension is not cosmetic — it is how Cloudinary picks the output
 * format, and it must match the eager format the backend pre-generates.
 *
 * @example Raw .mov original → capped H.264 mp4
 * videoDeliveryUrl("https://res.cloudinary.com/goatza/video/upload/v1712/posts/u1/clip.mov")
 * // "https://res.cloudinary.com/goatza/video/upload/c_limit,h_1280,w_1280,q_auto:good,vc_h264/v1712/posts/u1/clip.mp4"
 *
 * @example Already transformed → unchanged (never stack transformations)
 * videoDeliveryUrl("https://res.cloudinary.com/goatza/video/upload/c_limit,h_1280,w_1280,q_auto:good,vc_h264/v1712/clip.mp4")
 * // unchanged
 *
 * @example Some other prior transform → unchanged, we don't second-guess it
 * videoDeliveryUrl("https://res.cloudinary.com/goatza/video/upload/q_auto,f_auto/v1712/clip.mp4")
 * // unchanged
 *
 * @example Non-Cloudinary (local pre-upload preview) → unchanged
 * videoDeliveryUrl("blob:https://goatza.app/6f0c-…")   // unchanged
 * videoDeliveryUrl("")                                  // ""
 */
export function videoDeliveryUrl(url: string): string {
    return applyVideoTransform(
        url,
        VIDEO_DELIVERY_TRANSFORM,
        VIDEO_DELIVERY_EXTENSION
    )
}

/**
 * The adaptive-streaming manifest for a stored video: same guards and
 * idempotence as {@link videoDeliveryUrl}, but `sp_hd` + `.m3u8`.
 *
 * Feed it the RAW stored URL, not the output of `videoDeliveryUrl` — a URL that
 * already carries a transformation is returned untouched, so chaining the two
 * would silently hand back the mp4.
 *
 * @example Raw .mov original → HLS manifest
 * videoHlsUrl("https://res.cloudinary.com/goatza/video/upload/v1712/posts/u1/clip.mov")
 * // "https://res.cloudinary.com/goatza/video/upload/sp_hd/v1712/posts/u1/clip.m3u8"
 *
 * @example Already a manifest → unchanged
 * videoHlsUrl("https://res.cloudinary.com/goatza/video/upload/sp_hd/v1712/clip.m3u8")
 * // unchanged
 *
 * @example Non-Cloudinary / local preview → unchanged
 * videoHlsUrl("blob:https://goatza.app/6f0c-…")   // unchanged
 * videoHlsUrl("")                                  // ""
 */
export function videoHlsUrl(url: string): string {
    return applyVideoTransform(url, VIDEO_HLS_TRANSFORM, VIDEO_HLS_EXTENSION)
}

/**
 * Shared body of the two delivery helpers: insert `transform` right after
 * `/upload/` and force `extension` on the filename, or hand the URL back
 * untouched when it isn't ours to rewrite.
 */
function applyVideoTransform(
    url: string,
    transform: string,
    extension: string
): string {
    if (!url || !isCloudinaryUrl(url)) return url

    const parts = splitDeliveryUrl(url)
    if (!parts) return url

    // Idempotent: ours already applied, or somebody else's transformation sits
    // right after /upload/ — either way, adding another component would stack.
    if (url.includes(transform)) return url
    if (isTransformComponent(parts.first)) return url

    const path = parts.rest ? `${parts.first}/${parts.rest}` : parts.first
    return (
        parts.head +
        transform +
        "/" +
        forceExtension(path, extension) +
        parts.suffix
    )
}

/**
 * Size down a Cloudinary video poster frame. Post and chat posters are built as
 * a bare `so_0` still, which delivers at the ORIGINAL resolution — a 4K JPEG
 * behind a 400px-wide feed card.
 *
 * Only bare poster components are touched. Anything already carrying sizing or
 * quality params (the highlight rail's `so_0,f_jpg,q_auto,c_fill,w_360,h_640`
 * tiles) is left exactly as it is: re-writing those would trade a small
 * derivative for a bigger one.
 *
 * @example Bare post/chat poster → sized + quality-tuned
 * videoPosterUrl("https://res.cloudinary.com/goatza/video/upload/so_0/posts/u1/clip.jpg")
 * // "https://res.cloudinary.com/goatza/video/upload/so_0,c_limit,w_1080,q_auto/posts/u1/clip.jpg"
 *
 * @example Highlight rail tile (already sized) → unchanged
 * videoPosterUrl("https://res.cloudinary.com/goatza/video/upload/so_0,f_jpg,q_auto,c_fill,w_360,h_640/h/clip.jpg")
 * // unchanged
 *
 * @example Idempotent — running it twice changes nothing
 * videoPosterUrl(videoPosterUrl(bare)) === videoPosterUrl(bare)
 *
 * @example Not a poster URL (no transformation component) → unchanged
 * videoPosterUrl("https://res.cloudinary.com/goatza/image/upload/v1712/posts/u1/photo.jpg")
 * // unchanged
 */
export function videoPosterUrl(url: string, width = 1080): string {
    if (!url || !isCloudinaryUrl(url)) return url

    const parts = splitDeliveryUrl(url)
    if (!parts || !parts.rest) return url
    if (!isTransformComponent(parts.first)) return url

    const params = parts.first.split(",")

    // No still-offset param ⇒ not a poster URL; not ours to rewrite.
    const offset = params.find((p) => p.startsWith("so_"))
    if (!offset) return url

    // Already sized/quality-tuned ⇒ leave it alone (also what makes this
    // idempotent: our own output carries c_/w_/q_).
    const sized = params.some((p) => {
        const sep = p.indexOf("_")
        return sep > 0 && SIZING_KEYS.has(p.slice(0, sep))
    })
    if (sized) return url

    return `${parts.head}${offset},c_limit,w_${width},q_auto/${parts.rest}${parts.suffix}`
}
