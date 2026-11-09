"use client"

/**
 * The page header, built in place: a cover banner at the page's own ratio with
 * the logo overlapping it, as the real page shows them. Tapping either picks a
 * photo. It is a crop-first flow, so the photo is checked at pick time
 * (isImageFile, the 25 MB ceiling, ensureDecodableImage for a HEIC the
 * browser can't draw) and then cropped in OrgPhotoCropSheet. Nothing is
 * uploaded here: the cropped blobs go up after the page exists.
 */

import { useRef, useState, type ChangeEvent } from "react"
import { Icon } from "@iconify/react"

import { ensureDecodableImage } from "@/shared/services/imageVariants"
import { checkRawImageSize, isImageFile } from "@/shared/constants/media"
import OrgPhotoCropSheet from "../OrgPhotoCropSheet/OrgPhotoCropSheet"
import type { OrgPhotoType } from "../../services/uploadOrgPhoto"
import { fieldId } from "./CreateField"
import styles from "./HeaderComposer.module.css"

export type PickedPhoto = {
  blob: Blob
  /** The picked file's name. */
  name: string
  /** An object URL of `blob`, owned (and revoked) by the page. */
  url:  string
}

const PHOTO_HINT_ID = `${fieldId("photos")}-hint`

export default function HeaderComposer({
  logo,
  cover,
  onChange,
  typeIcon,
  disabled,
  errorId,
}: {
  logo:  PickedPhoto | null
  cover: PickedPhoto | null
  onChange: (type: OrgPhotoType, photo: { blob: Blob; name: string } | null) => void
  /** Shown in an empty logo, so the composer looks like the page it makes. */
  typeIcon: string
  disabled?: boolean
  /** The id of an error about the photos shown by the step, when there is one. */
  errorId?: string
}) {
  const describedBy = errorId ? `${PHOTO_HINT_ID} ${errorId}` : PHOTO_HINT_ID
  const logoInputRef  = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const [cropping, setCropping]   = useState<{ type: OrgPhotoType; file: File } | null>(null)
  const [preparing, setPreparing] = useState<OrgPhotoType | null>(null)
  const [error, setError]         = useState<string | null>(null)

  const pick = (type: OrgPhotoType) => {
    if (disabled || preparing) return
    ;(type === "logo" ? logoInputRef : coverInputRef).current?.click()
  }

  const onFile = (type: OrgPhotoType) => async (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0]
    event.target.value = ""
    if (!picked) return
    setError(null)

    // By type, or by extension when the browser gave none (a .heic on
    // Windows) — `accept` is only a hint the picker's "All files" defeats.
    if (!isImageFile(picked)) {
      setError("That file isn't a photo. Pick a JPG, PNG, WebP or HEIC.")
      return
    }
    const tooLarge = checkRawImageSize(picked)
    if (tooLarge) {
      setError(tooLarge)
      return
    }

    setPreparing(type)
    try {
      const file = await ensureDecodableImage(picked, {
        flow: "single",
        surface: type === "logo" ? "organization_logo" : "organization_cover",
      })
      setCropping({ type, file })
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't open that photo.")
    } finally {
      setPreparing(null)
    }
  }

  const typeWord = (type: OrgPhotoType) => (type === "logo" ? "logo" : "cover")

  return (
    <div className={styles.composer} id={fieldId("photos")}>
      <button
        type="button"
        className={styles.cover}
        onClick={() => pick("cover")}
        disabled={disabled}
        aria-label={cover ? "Change cover photo" : "Add cover photo"}
        aria-describedby={describedBy}
      >
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- a blob: preview of an unsaved crop; next/image can't load one
          <img src={cover.url} alt="" className={styles.coverImg} />
        ) : (
          <span className={styles.coverEmpty}>
            <Icon icon="mdi:image-plus-outline" width={22} height={22} aria-hidden="true" />
            <span>{preparing === "cover" ? "Opening photo…" : "Add cover"}</span>
          </span>
        )}
      </button>

      <div className={styles.identity}>
        <button
          type="button"
          className={styles.logo}
          onClick={() => pick("logo")}
          disabled={disabled}
          aria-label={logo ? "Change logo" : "Add logo"}
          aria-describedby={describedBy}
        >
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- a blob: preview of an unsaved crop; next/image can't load one
            <img src={logo.url} alt="" className={styles.logoImg} />
          ) : (
            <span className={styles.logoEmpty}>
              <Icon icon={typeIcon} width={26} height={26} aria-hidden="true" />
              <span className={styles.logoBadge} aria-hidden="true">
                <Icon icon="mdi:camera-plus" width={14} height={14} />
              </span>
            </span>
          )}
        </button>

        {(logo || cover) && (
          <div className={styles.actions}>
            {(["logo", "cover"] as const).map((type) =>
              (type === "logo" ? logo : cover) ? (
                <span key={type} className={styles.actionGroup}>
                  <button
                    type="button"
                    className={styles.action}
                    onClick={() => pick(type)}
                    disabled={disabled}
                  >
                    Replace {typeWord(type)}
                  </button>
                  <button
                    type="button"
                    className={`${styles.action} ${styles.actionRemove}`}
                    onClick={() => onChange(type, null)}
                    disabled={disabled}
                  >
                    Remove {typeWord(type)}
                  </button>
                </span>
              ) : null
            )}
          </div>
        )}
      </div>

      <p id={PHOTO_HINT_ID} className={styles.hint}>
        {preparing === "logo"
          ? "Opening photo…"
          : "Square logo, wide cover. You can change them later."}
      </p>
      {error && (
        <p className={styles.error} role="alert">
          <Icon icon="mdi:alert-circle-outline" width={14} height={14} aria-hidden="true" />
          {error}
        </p>
      )}

      {/* Any photo, like every other picture surface: what this browser can't
          decode is converted before the cropper sees it. */}
      <input
        ref={logoInputRef}
        type="file"
        accept="image/*"
        hidden
        tabIndex={-1}
        aria-hidden="true"
        onChange={onFile("logo")}
        data-testid="org-create-logo-input"
      />
      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        hidden
        tabIndex={-1}
        aria-hidden="true"
        onChange={onFile("cover")}
        data-testid="org-create-cover-input"
      />

      {cropping && (
        <OrgPhotoCropSheet
          type={cropping.type}
          file={cropping.file}
          confirmLabel={cropping.type === "logo" ? "Use logo" : "Use cover"}
          onCancel={() => setCropping(null)}
          onDone={(blob) => {
            onChange(cropping.type, { blob, name: cropping.file.name })
            setCropping(null)
          }}
        />
      )}
    </div>
  )
}
