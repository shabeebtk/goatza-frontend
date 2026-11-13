import { qrShape } from "@/features/profile/utils/shareCard/qr"

/** The PNG's side, in pixels: big enough to print on a notice board. */
export const QR_PNG_SIZE = 1024

/** The spec's quiet zone, four modules on every side, as a white margin. */
const QUIET_MODULES = 4

// A printed QR is black on white whatever the app's theme is: a canvas export is
// not themed, and a dark-mode inversion is a different symbol to most scanners.
const QR_LIGHT = "#ffffff"
const QR_DARK = "#000000"

/**
 * The invite link's QR as a PNG blob: the same one-path geometry the sheet draws
 * (qrShape), filled on a canvas with a white margin.
 */
export async function squadQrPng(text: string, size = QR_PNG_SIZE): Promise<Blob> {
  const qr = qrShape(text)

  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Couldn't make the QR image on this device.")

  ctx.fillStyle = QR_LIGHT
  ctx.fillRect(0, 0, size, size)

  const modulePx = size / (qr.size + QUIET_MODULES * 2)
  ctx.save()
  ctx.translate(modulePx * QUIET_MODULES, modulePx * QUIET_MODULES)
  ctx.scale(modulePx, modulePx)
  ctx.fillStyle = QR_DARK
  ctx.fill(new Path2D(qr.d))
  ctx.restore()

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error("Couldn't make the QR image on this device."))
    }, "image/png")
  })
}

/** Save `blob` as `fileName` through a temporary link. */
export function saveBlob(blob: Blob, fileName: string): void {
  const href = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = href
  link.download = fileName
  link.rel = "noopener"
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Long enough for the download to have started everywhere, iOS included.
  window.setTimeout(() => URL.revokeObjectURL(href), 10_000)
}
