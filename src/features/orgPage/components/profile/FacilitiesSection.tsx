"use client"

import { useState } from "react"
import { Icon } from "@iconify/react"

import MediaLightbox from "@/shared/components/ImageLightbox/MediaLightbox"
import Select from "@/shared/components/ui/Select/Select"
import { formatBranch } from "../../format"
import { facilitiesWithContent } from "../../profileSections"
import type { ShowcaseFacility } from "../../types"
import ProfileSection from "./ProfileSection"
import styles from "./FacilitiesSection.module.css"

/** One large photo and up to three thumbs; the last thumb counts the rest. */
const THUMBS = 3

/**
 * One photo, lazy, at an explicit size (the box's ratio, so nothing shifts as
 * it loads). One that fails to load is a quiet tile, never a broken-image icon.
 */
function FacilityPhoto({ src, alt, width, height }: { src: string; alt: string; width: number; height: number }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <span
        className={styles.placeholder}
        {...(alt ? { role: "img", "aria-label": alt } : { "aria-hidden": true })}
      >
        <Icon icon="mdi:image-outline" width={28} height={28} aria-hidden="true" />
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- R2 photos, shown as stored
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={styles.photo}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  )
}

/**
 * Facilities, per branch: a branch picker when more than one has something to
 * show, the branch's photos (any tap opens the lightbox there), then what it has
 * as check chips — the catalog's in the payload's order, then the club's own.
 */
export default function FacilitiesSection({ facilities }: { facilities: ShowcaseFacility[] }) {
  const branches = facilitiesWithContent(facilities)
  const [picked, setPicked] = useState("")
  const [viewerAt, setViewerAt] = useState<number | null>(null)

  if (branches.length === 0) return null
  // A branch that went away on a refetch falls back to the first.
  const branch = branches.find((entry) => entry.location.id === picked) ?? branches[0]
  const place = branch.location.name || branch.location.city || "the ground"
  const photos = branch.photos
  const [main, ...rest] = photos
  const thumbs = rest.slice(0, THUMBS)
  const more = photos.length - 1 - thumbs.length
  const alt = (index: number) => `Facilities at ${place}, photo ${index + 1}`

  return (
    <ProfileSection sectionKey="facilities" title="Facilities">
      {branches.length > 1 && (
        <div className={styles.picker}>
          <Select
            size="sm"
            aria-label="Branch"
            sheetTitle="Branch"
            options={branches.map((entry) => ({
              value: entry.location.id,
              label: formatBranch(entry.location) || "Branch",
            }))}
            value={branch.location.id}
            onChange={setPicked}
          />
        </div>
      )}

      {main && (
        <div className={styles.photos}>
          <button
            type="button"
            className={`${styles.photoButton} ${styles.mainPhoto}`}
            onClick={() => setViewerAt(0)}
          >
            <FacilityPhoto key={main.id} src={main.url} alt={alt(0)} width={1280} height={720} />
          </button>

          {thumbs.length > 0 && (
            <ul className={styles.thumbs}>
              {thumbs.map((photo, index) => {
                const at = index + 1
                const counts = more > 0 && index === thumbs.length - 1
                return (
                  <li key={photo.id}>
                    <button
                      type="button"
                      className={`${styles.photoButton} ${styles.thumb}`}
                      aria-label={counts ? `${alt(at)}, and ${more} more` : undefined}
                      onClick={() => setViewerAt(at)}
                    >
                      <FacilityPhoto
                        key={photo.id}
                        src={photo.url}
                        alt={counts ? "" : alt(at)}
                        width={400}
                        height={400}
                      />
                      {counts && (
                        <span className={styles.more} aria-hidden="true">
                          +{more} {more === 1 ? "photo" : "photos"}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {(branch.items.length > 0 || branch.custom_items.length > 0) && (
        <ul className={styles.chips} aria-label={`What ${place} has`}>
          {branch.items.map((item) => (
            <li key={item.key} className={styles.chip}>
              <Icon icon="mdi:check" width={16} height={16} aria-hidden="true" />
              {item.label}
            </li>
          ))}
          {branch.custom_items.map((label, index) => (
            <li key={`custom-${index}`} className={styles.chip}>
              <Icon icon="mdi:check" width={16} height={16} aria-hidden="true" />
              {label}
            </li>
          ))}
        </ul>
      )}

      {viewerAt !== null && (
        <MediaLightbox
          media={photos.map((photo) => ({ id: photo.id, media_type: "image", file_url: photo.url }))}
          startIndex={viewerAt}
          onClose={() => setViewerAt(null)}
          label={`Facilities at ${place}`}
        />
      )}
    </ProfileSection>
  )
}
