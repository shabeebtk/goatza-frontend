"use client"

/**
 * The achievement's single proof/showcase image.
 *
 * Three states in one control — empty, cropping, chosen — because an
 * achievement image is a FIELD of a form, not its own screen. PhotoEditModal
 * can own the viewport for a profile photo; this cannot, so the cropper appears
 * inline and hands back a URL the parent writes into the form.
 *
 * The upload runs on confirm-crop rather than on form submit. That means
 * cancelling the modal after picking an image leaves an orphan in storage —
 * the same trade CreatePostModal makes, and the alternative (holding the blob
 * until submit) means the owner cannot see what they picked.
 */

import { useCallback, useRef, useState } from "react"
import Cropper from "react-easy-crop"
import { Icon } from "@iconify/react"

import {
    getCroppedBlob,
    type PixelCrop,
} from "@/features/profile/utils/getCroppedBlob"
import {
    MAX_IMAGE_BYTES,
    useAchievementImageUpload,
} from "../../hooks/useAchievementImageUpload"
import styles from "./AchievementModal.module.css"

/**
 * 4:3 rather than 1:1. A certificate is landscape and a trophy photo is usually
 * portrait-ish; 4:3 is the compromise that crops neither into uselessness, and
 * the card renders the result in a square with object-fit: cover anyway.
 */
const CROP_ASPECT = 4 / 3

interface AchievementImageFieldProps {
    /** Current image URL, or "" when there is none. */
    value: string
    disabled?: boolean
    onChange: (next: { url: string; publicId: string }) => void
}

export default function AchievementImageField({
    value,
    disabled = false,
    onChange,
}: AchievementImageFieldProps) {
    const fileInputRef = useRef<HTMLInputElement>(null)
    const upload = useAchievementImageUpload()

    const [imageSrc, setImageSrc] = useState("")
    const [originalName, setOriginalName] = useState("achievement.jpg")
    const [error, setError] = useState<string | null>(null)

    const [crop, setCrop] = useState({ x: 0, y: 0 })
    const [zoom, setZoom] = useState(1)
    const [croppedArea, setCroppedArea] = useState<PixelCrop | null>(null)

    const cropping = Boolean(imageSrc)
    const busy = upload.isPending

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setError(null)

        if (file.size > MAX_IMAGE_BYTES) {
            setError("That image is over 5 MB. Pick a smaller one.")
            e.target.value = ""
            return
        }

        setOriginalName(file.name)
        const reader = new FileReader()
        reader.onload = () => {
            setImageSrc(reader.result as string)
            setCrop({ x: 0, y: 0 })
            setZoom(1)
        }
        reader.readAsDataURL(file)
        // Clear the input so re-picking the same file still fires onChange.
        e.target.value = ""
    }

    const onCropComplete = useCallback(
        (_: unknown, pixelCrop: PixelCrop) => setCroppedArea(pixelCrop),
        []
    )

    const handleConfirmCrop = async () => {
        if (!croppedArea || !imageSrc) return
        setError(null)
        try {
            const blob = await getCroppedBlob(imageSrc, croppedArea)
            const { secure_url, public_id } = await upload.mutateAsync({
                croppedBlob: blob,
                originalName,
            })
            onChange({ url: secure_url, publicId: public_id })
            setImageSrc("")
        } catch (err: unknown) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Upload failed. Please try again."
            )
        }
    }

    const handleRemove = () => {
        setError(null)
        onChange({ url: "", publicId: "" })
    }

    // ── Cropping ──────────────────────────────────────────────
    if (cropping) {
        return (
            <div className={styles.imageField}>
                <div className={styles.cropWrap}>
                    <Cropper
                        image={imageSrc}
                        crop={crop}
                        zoom={zoom}
                        aspect={CROP_ASPECT}
                        onCropChange={setCrop}
                        onZoomChange={setZoom}
                        onCropComplete={onCropComplete}
                    />
                </div>

                <input
                    className={styles.zoomSlider}
                    type="range"
                    min={1}
                    max={3}
                    step={0.01}
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    disabled={busy}
                    aria-label="Zoom"
                />

                {error && (
                    <p className={styles.imageError} role="alert">
                        <Icon icon="mdi:alert-circle-outline" width={11} height={11} />
                        {error}
                    </p>
                )}

                <div className={styles.cropActions}>
                    <button
                        className={styles.imageBtn}
                        onClick={() => {
                            setImageSrc("")
                            setError(null)
                        }}
                        type="button"
                        disabled={busy}
                    >
                        Cancel
                    </button>
                    <button
                        className={`${styles.imageBtn} ${styles.imageBtnPrimary}`}
                        onClick={handleConfirmCrop}
                        type="button"
                        disabled={busy || !croppedArea}
                    >
                        {busy ? (
                            <>
                                <span className={styles.miniSpinner} aria-hidden="true" />
                                Uploading…
                            </>
                        ) : (
                            "Use photo"
                        )}
                    </button>
                </div>
            </div>
        )
    }

    // ── Chosen ────────────────────────────────────────────────
    if (value) {
        return (
            <div className={styles.imageField}>
                <div className={styles.imagePreview}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={value} alt="Achievement proof" />
                </div>

                {error && (
                    <p className={styles.imageError} role="alert">
                        <Icon icon="mdi:alert-circle-outline" width={11} height={11} />
                        {error}
                    </p>
                )}

                <div className={styles.imageActions}>
                    <button
                        className={styles.imageBtn}
                        onClick={() => fileInputRef.current?.click()}
                        type="button"
                        disabled={disabled || busy}
                    >
                        <Icon icon="mdi:image-sync-outline" width={14} height={14} />
                        Replace
                    </button>
                    <button
                        className={`${styles.imageBtn} ${styles.imageBtnDanger}`}
                        onClick={handleRemove}
                        type="button"
                        disabled={disabled || busy}
                    >
                        <Icon icon="mdi:close" width={14} height={14} />
                        Remove
                    </button>
                </div>

                <input
                    ref={fileInputRef}
                    className={styles.hiddenInput}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                />
            </div>
        )
    }

    // ── Empty ─────────────────────────────────────────────────
    return (
        <div className={styles.imageField}>
            <button
                className={styles.imageDropzone}
                onClick={() => fileInputRef.current?.click()}
                type="button"
                disabled={disabled || busy}
            >
                <Icon icon="mdi:image-plus-outline" width={26} height={26} />
                <span className={styles.imageDropzoneLabel}>Add a photo</span>
                <span className={styles.imageDropzoneHint}>
                    Certificate or trophy — optional, up to 5 MB
                </span>
            </button>

            {error && (
                <p className={styles.imageError} role="alert">
                    <Icon icon="mdi:alert-circle-outline" width={11} height={11} />
                    {error}
                </p>
            )}

            <input
                ref={fileInputRef}
                className={styles.hiddenInput}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
            />
        </div>
    )
}
