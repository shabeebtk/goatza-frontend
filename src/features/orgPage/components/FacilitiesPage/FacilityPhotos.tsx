"use client"

import { useState } from "react"
import { Icon } from "@iconify/react"

import ConfirmDialog from "@/shared/components/ui/ConfirmDialog/ConfirmDialog"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import {
  MAX_FACILITY_PHOTOS,
  useAddFacilityPhoto,
  useDeleteFacilityPhoto,
  useReorderFacilityPhotos,
} from "../../hooks/useFacilities"
import { moveId } from "../../hooks/reorder"
import { pageErrorSentence } from "../../pageErrors"
import { FACILITY_PHOTO_ASPECT } from "../../services/uploadOrgPagePhoto"
import type { FacilityPhoto, LocationFacilities } from "../../types"
import ActionsSheet from "../ActionsSheet/ActionsSheet"
import { usePagePhotoPick } from "../PagePhotoPick/usePagePhotoPick"
import styles from "./FacilitiesPage.module.css"

/**
 * One branch's photos, saved as they change (no Save button): a square grid in
 * order, the first marked Cover; "+ Add" picks, crops 4:3 and uploads; ⋯ on each
 * moves it or deletes it. Twelve at most, and the Add tile goes at twelve.
 */
export default function FacilityPhotos({ orgId, branch }: { orgId: string; branch: LocationFacilities }) {
  const toast = useToast()
  const locationId = branch.location.id
  const add = useAddFacilityPhoto(orgId, locationId)
  const remove = useDeleteFacilityPhoto(orgId, locationId)
  const reorder = useReorderFacilityPhotos(orgId, locationId)
  const [menuFor, setMenuFor] = useState<{ photo: FacilityPhoto; index: number } | null>(null)
  const [deleting, setDeleting] = useState<FacilityPhoto | null>(null)

  const photos = branch.photos
  const full = photos.length >= MAX_FACILITY_PHOTOS
  const fail = (title: string, err: unknown) =>
    toast.show({ title, message: pageErrorSentence(err), variant: "error", position: "top-center" })

  const picker = usePagePhotoPick({
    aspect: FACILITY_PHOTO_ASPECT,
    title: "Crop photo",
    onCropped: (blob, originalName) =>
      add.mutate({ blob, originalName }, { onError: (err) => fail("Couldn't add the photo", err) }),
  })

  const move = (photo: FacilityPhoto, delta: -1 | 1) => {
    const ids = moveId(
      photos.map((item) => item.id),
      photo.id,
      delta
    )
    if (ids) reorder.mutate(ids)
  }

  return (
    <section className={styles.card} aria-labelledby="facility-photos-title">
      <h2 id="facility-photos-title" className={styles.cardTitle}>
        Photos
      </h2>
      <p className={styles.hint}>Up to {MAX_FACILITY_PHOTOS} photos. The first one leads.</p>

      <ul className={styles.photoGrid}>
        {photos.map((photo, index) => (
          <li key={photo.id} className={styles.photoTile}>
            {/* eslint-disable-next-line @next/next/no-img-element -- R2 photos, shown as stored */}
            <img src={photo.url} alt={`Facility photo ${index + 1}`} className={styles.photo} loading="lazy" />
            {index === 0 && <span className={styles.coverBadge}>Cover</span>}
            <button
              type="button"
              className={styles.photoMore}
              aria-label={`Options for photo ${index + 1}`}
              onClick={() => setMenuFor({ photo, index })}
            >
              <Icon icon="mdi:dots-horizontal" width={20} height={20} aria-hidden="true" />
            </button>
          </li>
        ))}

        {add.isPending && (
          <li className={`${styles.photoTile} ${styles.uploadingTile}`} aria-live="polite">
            <span className={styles.spinner} aria-hidden="true" />
            <span className={styles.srOnly}>Uploading photo</span>
          </li>
        )}

        {!full && !add.isPending && (
          <li className={styles.photoTile}>
            <button type="button" className={styles.addTile} onClick={picker.open}>
              <Icon icon="mdi:plus" width={26} height={26} aria-hidden="true" />
              <span>Add</span>
            </button>
          </li>
        )}
      </ul>

      {picker.element}

      {menuFor && (
        <ActionsSheet
          title={`Photo ${menuFor.index + 1}`}
          onClose={() => setMenuFor(null)}
          actions={[
            {
              id: "earlier",
              label: "Move earlier",
              icon: "mdi:arrow-left",
              disabled: menuFor.index === 0,
              onSelect: () => move(menuFor.photo, -1),
            },
            {
              id: "later",
              label: "Move later",
              icon: "mdi:arrow-right",
              disabled: menuFor.index === photos.length - 1,
              onSelect: () => move(menuFor.photo, 1),
            },
            {
              id: "delete",
              label: "Delete photo",
              icon: "mdi:trash-can-outline",
              tone: "danger",
              onSelect: () => setDeleting(menuFor.photo),
            },
          ]}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Delete this photo?"
        message="It comes off your page straight away."
        confirmLabel="Delete"
        cancelLabel="Keep it"
        tone="danger"
        onConfirm={() => {
          const photo = deleting
          setDeleting(null)
          if (!photo) return
          remove.mutate(photo.id, {
            onSuccess: () => toast.show({ title: "Photo deleted", variant: "success", position: "top-center" }),
            onError: (err) => fail("Couldn't delete the photo", err),
          })
        }}
        onCancel={() => setDeleting(null)}
      />
    </section>
  )
}
