/**
 * Shared display-box maths for chat media bubbles (photos + videos).
 *
 * The box is reserved from the message's intrinsic dimensions BEFORE the asset
 * loads, so a media tail never grows the list after the scroll controller has
 * anchored it. When the server didn't record dimensions we fall back to a 4:3
 * box and letterbox the asset inside it rather than cropping blindly.
 */

export const MAX_W = 260
export const MAX_H = 320

export interface MediaBox {
  /** Display width in px (capped by MAX_W/MAX_H). */
  w: number
  /** Display height in px — pair it with `aspectRatio`, not a fixed height. */
  h: number
  /** False when the message carried no intrinsic size (→ letterbox, don't crop). */
  known: boolean
}

export function displaySize(width?: number | null, height?: number | null): MediaBox {
  const known = Boolean(width && height)
  const ratio = known ? width! / height! : 4 / 3
  let w = MAX_W
  let h = MAX_W / ratio
  if (h > MAX_H) {
    h = MAX_H
    w = MAX_H * ratio
  }
  return { w: Math.round(w), h: Math.round(h), known }
}
