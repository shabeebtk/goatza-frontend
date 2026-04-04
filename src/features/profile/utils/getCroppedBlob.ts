/**
 * Converts react-easy-crop's pixel crop area into a Blob.
 * Call this inside the `onCropComplete` → confirm flow.
 */

export type PixelCrop = {
  x: number
  y: number
  width: number
  height: number
}

export async function getCroppedBlob(
  imageSrc: string,
  pixelCrop: PixelCrop,
  mimeType = "image/jpeg",
  quality = 0.92
): Promise<Blob> {
  const image = await loadImage(imageSrc)

  const canvas = document.createElement("canvas")
  canvas.width  = pixelCrop.width
  canvas.height = pixelCrop.height

  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas context unavailable")

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  )

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error("Canvas toBlob failed"))
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