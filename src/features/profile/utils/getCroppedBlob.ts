/**
 * Converts react-easy-crop's pixel crop area into a Blob.
 * Call this inside the `onCropComplete` → confirm flow.
 *
 * The output is capped at {@link MAX_CROP_DIMENSION} on its longest side.
 * iOS Safari refuses any canvas over 16,777,216 px (4096²) — `toBlob` hands
 * back null — and a 1:1 crop of a 24 MP iPhone photo is already 4284×4284.
 * Every caller compresses to ≤2560 afterwards, so nothing visible is lost.
 */

import { imagePrepareFailed } from "@/shared/services/imageVariants"
import type { StepRecord } from "@/shared/services/videoEncode"

export type PixelCrop = {
  x: number
  y: number
  width: number
  height: number
}

/** 4096² is exactly iOS Safari's canvas area limit, so this always fits. */
export const MAX_CROP_DIMENSION = 4096

export async function getCroppedBlob(
  imageSrc: string,
  pixelCrop: PixelCrop,
  mimeType = "image/jpeg",
  quality = 0.92,
  maxDimension = MAX_CROP_DIMENSION
): Promise<Blob> {
  const scale = Math.min(1, maxDimension / Math.max(pixelCrop.width, pixelCrop.height))
  const width = Math.max(1, Math.round(pixelCrop.width * scale))
  const height = Math.max(1, Math.round(pixelCrop.height * scale))

  const startedAt = Date.now()
  // Coded and reported like every other photo failure; the source is never
  // recorded — it is a data URL of the photo itself.
  const fail = (step: string, err?: unknown) => {
    const record: StepRecord = {
      name: step,
      outcome: "failed",
      ...(err instanceof Error
        ? { errorName: err.name, errorMessage: err.message }
        : err !== undefined
          ? { errorMessage: (err as { type?: string })?.type ?? String(err) }
          : {}),
      ms: Date.now() - startedAt,
    }
    return imagePrepareFailed(
      "IMAGE_DECODE_FAILED",
      {
        facts: {
          fileType: mimeType,
          extension: "",
          size: 0,
          heic: false,
          width,
          height,
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
        },
        steps: [record],
      },
      { flow: "single", surface: "crop" }
    )
  }

  let image: HTMLImageElement
  try {
    image = await loadImage(imageSrc)
  } catch (err) {
    throw fail("crop: load image", err)
  }

  const canvas = document.createElement("canvas")
  canvas.width  = width
  canvas.height = height

  const ctx = canvas.getContext("2d")
  if (!ctx) throw fail("crop: canvas context")

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    width,
    height
  )

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(fail("crop: toBlob"))
      },
      mimeType,
      quality
    )
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.addEventListener("load", () => resolve(img))
    img.addEventListener("error", reject)
    img.src = src
  })
}
