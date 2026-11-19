"use client"

import { useRef, useState, type ChangeEvent, type ReactNode } from "react"

import OrgPhotoCropSheet from "@/features/organization/component/OrgPhotoCropSheet/OrgPhotoCropSheet"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { checkRawImageSize, isImageFile } from "@/shared/constants/media"
import { ensureDecodableImage } from "@/shared/services/imageVariants"
import { ORG_PAGE_UPLOAD_TYPE } from "../../services/uploadOrgPagePhoto"

/**
 * Pick → check → crop, the picker rules every crop-first flow follows (CLAUDE.md
 * "Photos: what the picker takes"): isImageFile, checkRawImageSize, then
 * ensureDecodableImage, because the cropper draws the photo before anything is
 * compressed. `onCropped` gets the cropped blob; uploading it is the caller's.
 *
 * Returns `open` (the file picker) and `element`, which renders the hidden input
 * and, while a photo is being cropped, OrgPhotoCropSheet.
 */
export function usePagePhotoPick({
  aspect,
  title = "Crop photo",
  confirmLabel = "Use photo",
  onCropped,
}: {
  aspect: number
  title?: string
  confirmLabel?: string
  onCropped: (blob: Blob, originalName: string) => void
}): { open: () => void; element: ReactNode } {
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [cropFile, setCropFile] = useState<File | null>(null)

  const fail = (message: string) =>
    toast.show({ title: message, variant: "error", position: "top-center" })

  const onPick = async (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0]
    event.target.value = ""
    if (!picked) return
    if (!isImageFile(picked)) {
      fail("Pick a photo.")
      return
    }
    const tooLarge = checkRawImageSize(picked)
    if (tooLarge) {
      fail(tooLarge)
      return
    }
    try {
      setCropFile(await ensureDecodableImage(picked, { flow: "single", surface: ORG_PAGE_UPLOAD_TYPE }))
    } catch (err) {
      fail(err instanceof Error ? err.message : "Couldn't open that photo.")
    }
  }

  const element = (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => void onPick(event)}
        data-testid="page-photo-input"
      />
      {cropFile && (
        <OrgPhotoCropSheet
          type="logo"
          file={cropFile}
          aspect={aspect}
          title={title}
          confirmLabel={confirmLabel}
          onCancel={() => setCropFile(null)}
          onDone={(blob) => {
            const name = cropFile.name || "photo.jpg"
            // The sheet closes at once; the upload shows where the photo goes.
            setCropFile(null)
            onCropped(blob, name)
          }}
        />
      )}
    </>
  )

  return { open: () => inputRef.current?.click(), element }
}
