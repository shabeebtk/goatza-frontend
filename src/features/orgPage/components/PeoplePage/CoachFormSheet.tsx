"use client"

import { useId, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { Icon } from "@iconify/react"

import Avatar from "@/shared/components/ui/Avatar/Avatar"
import Button from "@/shared/components/ui/Button/Button"
import ConfirmDialog from "@/shared/components/ui/ConfirmDialog/ConfirmDialog"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { settleViewport } from "@/shared/utils/settleViewport"
import { useCreateCoach, useDeleteCoach, useUpdateCoach } from "../../hooks/usePeople"
import { pageErrorSentence, pageFieldErrors } from "../../pageErrors"
import { COACH_PHOTO_ASPECT, uploadOrgPagePhoto, type OrgPagePhoto } from "../../services/uploadOrgPagePhoto"
import type { Coach, CoachUpdatePayload } from "../../types"
import { usePagePhotoPick } from "../PagePhotoPick/usePagePhotoPick"
import PageSheet from "../PageSheet/PageSheet"
import { PageTextField } from "../PageFields/PageFields"
import {
  COACH_NAME_MAX,
  COACH_NAME_MIN,
  CoachDetailsFields,
  coachDetailsErrors,
  coachDetailsOf,
  coachDetailsPayload,
  emptyCoachDetails,
  initialsOf,
  type CoachDetails,
} from "./coachFields"
import styles from "./PeoplePage.module.css"

const withoutKey = (errors: Record<string, string>, key: string) => {
  const next = { ...errors }
  delete next[key]
  return next
}

/** The photo as the sheet holds it: unchanged, a new upload, or taken off. */
type PhotoState = { kind: "same" } | { kind: "new"; photo: OrgPagePhoto } | { kind: "none" }

/**
 * Without `coach`: add a coach who isn't on Goatza (photo, name, role, details).
 * With `coach`: edit them (EditCoachSheet). A member's name and photo come from
 * their profile and can't be changed here. Save sends only what changed.
 */
export default function CoachFormSheet({
  orgId,
  coach,
  onClose,
}: {
  orgId: string
  coach?: Coach
  onClose: () => void
}) {
  const ids = useId()
  const toast = useToast()
  const create = useCreateCoach(orgId)
  const update = useUpdateCoach(orgId)
  const remove = useDeleteCoach(orgId)

  const ownProfile = coach?.is_member ?? false
  const [name, setName] = useState(coach?.name ?? "")
  const [details, setDetails] = useState<CoachDetails>(() => (coach ? coachDetailsOf(coach) : emptyCoachDetails()))
  const [photo, setPhoto] = useState<PhotoState>({ kind: "same" })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [askRemove, setAskRemove] = useState(false)

  const upload = useMutation({
    mutationFn: ({ blob, originalName }: { blob: Blob; originalName: string }) =>
      uploadOrgPagePhoto({ orgId, blob, originalName }),
    onSuccess: (uploaded) => setPhoto({ kind: "new", photo: uploaded }),
    onError: (err) =>
      toast.show({
        title: "Couldn't upload the photo",
        message: pageErrorSentence(err),
        variant: "error",
        position: "top-center",
      }),
  })
  const picker = usePagePhotoPick({
    aspect: COACH_PHOTO_ASPECT,
    title: "Crop photo",
    onCropped: (blob, originalName) => upload.mutate({ blob, originalName }),
  })

  const shownPhoto =
    photo.kind === "new" ? photo.photo.photo_url : photo.kind === "none" ? "" : coach?.photo ?? ""
  const busy = create.isPending || update.isPending || upload.isPending

  /** The edit's PATCH body: only what differs from the coach as opened. */
  const changes = (): CoachUpdatePayload => {
    if (!coach) return {}
    const out: CoachUpdatePayload = {}
    const next = coachDetailsPayload(details)
    const before = coachDetailsPayload(coachDetailsOf(coach))
    if (next.role !== before.role) out.role = next.role
    if (next.title !== before.title) out.title = next.title
    if (next.licence !== before.licence) out.licence = next.licence
    if (next.years_coaching !== before.years_coaching) out.years_coaching = next.years_coaching
    if (!ownProfile) {
      if (name.trim() !== coach.name.trim()) out.name = name.trim()
      if (photo.kind === "new") {
        out.photo_url = photo.photo.photo_url
        out.photo_public_id = photo.photo.photo_public_id
      } else if (photo.kind === "none" && coach.photo) {
        out.photo_url = ""
        out.photo_public_id = ""
      }
    }
    return out
  }

  const refused = (err: unknown) => {
    const fieldErrors = pageFieldErrors(err)
    const named = Object.keys(fieldErrors).filter((field) => field !== "non_field_errors")
    if (named.length) {
      setErrors(fieldErrors)
      return
    }
    toast.show({
      title: "Couldn't save",
      message: pageErrorSentence(err),
      variant: "error",
      position: "top-center",
    })
  }

  const submit = (close: () => void) => {
    if (busy) return
    const local = coachDetailsErrors(details)
    if (!ownProfile) {
      const length = name.trim().length
      if (length < COACH_NAME_MIN || length > COACH_NAME_MAX) {
        local.name = `Enter a name of ${COACH_NAME_MIN} to ${COACH_NAME_MAX} characters.`
      }
    }
    if (Object.keys(local).length) {
      setErrors(local)
      return
    }

    const done = (title: string) => {
      toast.show({ title, variant: "success", position: "top-center" })
      void settleViewport()
      close()
    }

    if (!coach) {
      create.mutate(
        {
          name: name.trim(),
          ...coachDetailsPayload(details),
          ...(photo.kind === "new" ? photo.photo : {}),
        },
        { onSuccess: () => done("Coach added"), onError: refused }
      )
      return
    }

    const body = changes()
    if (Object.keys(body).length === 0) {
      void settleViewport()
      close()
      return
    }
    update.mutate({ coachId: coach.id, payload: body }, { onSuccess: () => done("Coach saved"), onError: refused })
  }

  return (
    <PageSheet
      title={coach ? `Edit ${coach.name}` : "Add a coach"}
      onClose={onClose}
      footer={(close) => (
        <div className={styles.sheetFooter}>
          <Button variant="brand" fullWidth loading={create.isPending || update.isPending} disabled={busy} onClick={() => submit(close)}>
            {coach ? "Save" : "Add coach"}
          </Button>
          {coach && (
            <Button
              variant="ghost"
              fullWidth
              className={styles.removeButton}
              loading={remove.isPending}
              onClick={() => setAskRemove(true)}
            >
              Remove from page
            </Button>
          )}
        </div>
      )}
    >
      {(close) => (
        <div className={styles.sheetForm}>
          {ownProfile ? (
            <div className={styles.pickedPerson}>
              <Avatar src={coach?.photo || undefined} initials={initialsOf(coach?.name ?? "")} size="md" />
              <span className={styles.rowText}>
                <span className={styles.rowName}>{coach?.name}</span>
                <span className={styles.rowLine}>Name and photo come from their profile.</span>
              </span>
            </div>
          ) : (
            <>
              <div className={styles.photoField}>
                <span className={styles.photoWrap}>
                  <Avatar src={shownPhoto || undefined} initials={initialsOf(name)} size="lg" />
                  {upload.isPending && <span className={styles.photoSpinner} aria-label="Uploading photo" />}
                </span>
                <span className={styles.photoActions}>
                  <Button
                    variant="outline"
                    disabled={upload.isPending}
                    leftIcon={<Icon icon="mdi:camera-outline" width={18} height={18} />}
                    onClick={picker.open}
                  >
                    {shownPhoto ? "Change photo" : "Add photo"}
                  </Button>
                  {shownPhoto && !upload.isPending && (
                    <Button variant="ghost" onClick={() => setPhoto({ kind: "none" })}>
                      Remove
                    </Button>
                  )}
                </span>
              </div>
              <PageTextField
                id={`${ids}-name`}
                label="Name"
                placeholder="Coach's full name"
                maxLength={COACH_NAME_MAX}
                autoComplete="off"
                value={name}
                onChange={(event) => {
                  setName(event.target.value)
                  if (errors.name) setErrors((current) => withoutKey(current, "name"))
                }}
                error={errors.name}
              />
            </>
          )}

          <CoachDetailsFields
            idBase={ids}
            value={details}
            onChange={(next) => {
              setDetails(next)
              // The details' own errors go; one on the name stays until the name changes.
              setErrors((current): Record<string, string> => (current.name ? { name: current.name } : {}))
            }}
            errors={errors}
          />

          {picker.element}

          {coach && (
            <ConfirmDialog
              open={askRemove}
              title={`Remove ${coach.name} from your page?`}
              message={
                coach.is_member
                  ? "They stay a member of your page. You can add them again later."
                  : "Their name, photo and details come off your page."
              }
              confirmLabel="Remove"
              cancelLabel="Keep"
              tone="danger"
              onConfirm={() => {
                setAskRemove(false)
                remove.mutate(coach.id, {
                  onSuccess: () => {
                    toast.show({ title: "Removed from your page", variant: "success", position: "top-center" })
                    close()
                  },
                  onError: (err) =>
                    toast.show({
                      title: "Couldn't remove them",
                      message: pageErrorSentence(err),
                      variant: "error",
                      position: "top-center",
                    }),
                })
              }}
              onCancel={() => setAskRemove(false)}
            />
          )}
        </div>
      )}
    </PageSheet>
  )
}
