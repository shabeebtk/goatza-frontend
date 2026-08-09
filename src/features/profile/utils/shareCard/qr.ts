/**
 * The card's QR code, as one SVG path.
 *
 * Deliberately NOT the library's PNG or data-URL output. Satori renders inline
 * SVG natively, so a path is drawn at whatever size the layout asks for and
 * stays crisp — a rasterised QR would be resampled by the card's own scale and
 * a data URL is a base64 blob measured in kilobytes sitting inside the render.
 * A path also costs zero network fetches, which matters here: every image on a
 * Satori render is a round trip INSIDE the render (see media.ts).
 *
 * One path rather than one rect per module for the same reason the branded
 * pattern is two polygons: a 33×33 symbol is several hundred dark modules, and
 * several hundred sibling nodes is layout work Satori does not need to do to
 * draw a shape that never reflows.
 *
 * Pure, and pointedly so — no DOM, no React, no fetching. The route builds the
 * URL, this turns a string into geometry, and `ProfileCard` draws it.
 */

import QRCode from "qrcode"

export interface QrShape {
  /** SVG path data in module units — pair it with `viewBox="0 0 size size"`. */
  d: string
  /** Modules per side, i.e. the symbol's own coordinate space. */
  size: number
}

/**
 * Error correction level M: ~15% recoverable.
 *
 * L would give a smaller symbol, but the card is printed to a phone screen,
 * screenshotted, re-compressed by a chat app and scanned off a second screen at
 * an angle. H would survive more and costs a denser symbol, which scans worse
 * at the 190px the panel gives it. M is the level the reference readers are
 * tuned for.
 */
const ERROR_CORRECTION = "M" as const

/**
 * The dark modules of `text` as a single SVG path.
 *
 * No quiet zone is emitted. The spec's four-module margin is the QR panel's
 * white padding in `ProfileCard` — expressing it as layout rather than as empty
 * path space keeps the viewBox equal to the symbol, so the drawn size is the
 * scannable size and nothing has to be corrected for margin twice.
 */
export function qrShape(text: string): QrShape {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: ERROR_CORRECTION })
  const { size } = modules

  let d = ""

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // `get(row, col)` — y first. Reversing these produces a transposed symbol
      // that still looks like a QR code and scans as a different string.
      if (modules.get(y, x)) d += `M${x} ${y}h1v1h-1z`
    }
  }

  return { d, size }
}
