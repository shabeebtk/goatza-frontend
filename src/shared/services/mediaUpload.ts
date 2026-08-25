/**
 * Presigned direct uploads to Cloudflare R2.
 *
 * The shape of an upload changed with the provider. Cloudinary took a signed
 * multipart POST and decided the final path itself, then told us where it put
 * the file. R2 decides nothing: the backend picks the object key, signs a PUT
 * bound to that exact key AND content type, and the browser streams the raw
 * bytes there. Two consequences run through every caller:
 *
 *   1. The response is empty. There is no JSON to parse and nothing to learn
 *      from the upload — `public_url` and `key` are known BEFORE the bytes move,
 *      handed to us in the config. Anything Cloudinary used to report back
 *      (width, height, bytes, duration) is now the client's job to measure.
 *   2. The Content-Type header is signed in. Sending anything other than
 *      `entry.headers["Content-Type"]` fails the signature check, so the header
 *      and the blob must describe the same file.
 *
 * The config request declares every file up front, and the response's `uploads`
 * array comes back in the SAME ORDER — that positional pairing is the only link
 * between a blob and its presigned entry.
 */

import api from "@/core/api/axios"

// ── Types (mirror of the backend contract) ────────────────────

/**
 * Server-side upload types.
 *
 * "highlights" is absent because the backend has no such type: a highlight clip
 * is signed as "posts" and lands in the player's own user-scoped folder. See
 * highlightUpload.service.ts.
 */
export type MediaUploadType =
    | "profile"
    | "cover"
    | "posts"
    | "organization_logo"
    | "organization_cover"
    | "recruitments"
    | "chat"
    | "achievements"
    | "matches"

/**
 * What a file IS, not what it contains: the server pairs a "video" with exactly
 * one "thumb" in the same request, and rejects a "thumb" with no parent.
 */
export type UploadKind = "image" | "video" | "thumb"

/** One entry in the config request's `files` array. */
export type UploadFileDescriptor = {
    content_type: string
    size_bytes: number
    kind: UploadKind
}

/** One presigned PUT. `public_url` is where the file will be readable. */
export type R2UploadEntry = {
    method: "PUT"
    upload_url: string
    key: string
    public_url: string
    headers: Record<string, string>
    expires_in: number
}

export type UploadConfigResponse = {
    provider: "r2"
    /** posts + recruitments only — the batch folder every file landed in. */
    temp_post_id?: string
    /** Same order as the request's `files`. */
    uploads: R2UploadEntry[]
}

// ── Content types ─────────────────────────────────────────────

/** What the server will sign. Anything else is rejected before upload. */
export const ALLOWED_IMAGE_CONTENT_TYPES = [
    "image/webp",
    "image/jpeg",
    "image/png",
] as const

/**
 * The content type to declare for a blob.
 *
 * Everything is compressed to WebP before it gets here, so this is normally
 * just `blob.type`. The fallback covers a browser whose compressor quietly
 * handed back the original format — declaring the truth matters, because the
 * PUT must send back exactly the type that was signed.
 */
export function resolveContentType(blob: Blob): string {
    const type = blob.type as (typeof ALLOWED_IMAGE_CONTENT_TYPES)[number]
    return ALLOWED_IMAGE_CONTENT_TYPES.includes(type) ? type : "image/webp"
}

/** Descriptor for one blob, ready for the config request. */
export function describeBlob(
    blob: Blob,
    kind: UploadKind = "image"
): UploadFileDescriptor {
    return {
        content_type: resolveContentType(blob),
        size_bytes: blob.size,
        kind,
    }
}

// ── Step 1: ask the backend to sign the batch ─────────────────

/**
 * POST to the same endpoint the old `getUploadSignatureApi` used — the axios
 * instance attaches the JWT and the X-Actor-Type / X-Actor-Id headers exactly
 * as before, so acting as an org still scopes the keys to that org.
 *
 * `orgId` is only for org-scoped types; it mirrors the old `org_id` query
 * param and lets a user acting personally upload for an org they belong to.
 */
export const getUploadConfigApi = async (
    type: MediaUploadType,
    files: UploadFileDescriptor[],
    orgId?: string
): Promise<UploadConfigResponse> => {
    const res = await api.post("/user/get/upload/signature", {
        type,
        ...(orgId ? { org_id: orgId } : {}),
        files,
    })
    return res.data.data
}

// ── Step 2: PUT the bytes ─────────────────────────────────────

/** Thrown when the user cancels — callers use this to stay silent. */
export const UPLOAD_CANCELLED = "upload_cancelled"

export type UploadProgress = (loaded: number, total: number) => void

/**
 * Raw PUT of `blob` to `entry.upload_url`.
 *
 * NO FormData: the object stored in the bucket is byte-for-byte the request
 * body, so a multipart envelope would be stored AS the file. The body is the
 * blob itself and the only header is the signed Content-Type.
 *
 * Resolves with nothing — R2 returns an empty 200. Everything the caller needs
 * is already on `entry`.
 */
export function putToR2(
    blob: Blob,
    entry: R2UploadEntry,
    onProgress?: UploadProgress,
    signal?: AbortSignal
): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new Error(UPLOAD_CANCELLED))
            return
        }

        const xhr = new XMLHttpRequest()

        const onCancel = () => xhr.abort()
        signal?.addEventListener("abort", onCancel, { once: true })

        xhr.addEventListener("loadend", () =>
            signal?.removeEventListener("abort", onCancel)
        )

        xhr.upload.addEventListener("progress", (e) => {
            if (e.lengthComputable) onProgress?.(e.loaded, e.total)
        })

        xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve()
            else reject(new Error("Upload failed. Please try again."))
        })

        xhr.addEventListener("error", () =>
            reject(new Error("Network error while uploading."))
        )
        xhr.addEventListener("abort", () => reject(new Error(UPLOAD_CANCELLED)))
        xhr.addEventListener("timeout", () =>
            reject(new Error("Upload timed out. Please try again."))
        )

        xhr.open(entry.method, entry.upload_url)

        // Exactly what was signed, nothing more. An extra header here changes
        // the request the signature was computed over and R2 returns 403.
        for (const [name, value] of Object.entries(entry.headers)) {
            xhr.setRequestHeader(name, value)
        }

        // Generous for a large image on mobile data, but never unbounded — an
        // unbounded request can leave a UI uploading forever.
        xhr.timeout = 10 * 60 * 1000
        xhr.send(blob)
    })
}

export const isUploadCancelled = (err: unknown): boolean =>
    err instanceof Error && err.message === UPLOAD_CANCELLED

// ── Fixed-key media ───────────────────────────────────────────

/**
 * Stamp a fixed-key URL so a replacement is actually seen.
 *
 * profile / cover / logo / org-cover each live at ONE key per actor and are
 * overwritten in place, so the URL never changes and the browser keeps painting
 * the image it already cached. The server stores its own ?v= for exactly this
 * reason, but it does not return the stored URL, so an optimistic cache write
 * has to stamp its own — the two point at the same object either way, since
 * ?v= is stripped when the key is read back out.
 *
 * Send the BARE `public_url` in the attach payload; this is for display only.
 */
export function withCacheBust(url: string): string {
    if (!url) return url
    return `${url.split("?v=")[0]}?v=${Date.now()}`
}

/** True when a URL already carries a server-issued cache-buster. */
export function hasCacheBust(url: string): boolean {
    return Boolean(url) && url.includes("?v=")
}
