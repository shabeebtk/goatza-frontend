"use client"

import { useId, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { Icon } from "@iconify/react"

import OrgPhotoCropSheet from "@/features/organization/component/OrgPhotoCropSheet/OrgPhotoCropSheet"
import { useSportsList } from "@/features/profile/hooks/useSportsQueries"
import { Button, Select } from "@/shared/components/ui"
import ConfirmDialog from "@/shared/components/ui/ConfirmDialog/ConfirmDialog"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { checkRawImageSize, isImageFile } from "@/shared/constants/media"
import { ensureDecodableImage } from "@/shared/services/imageVariants"
import { useOrgName } from "../../hooks/useSquadPermissions"
import { useSquadInviteShare } from "../../hooks/useSquadInviteShare"
import {
  useDeleteSquad,
  useResetInviteLink,
  useSetInviteLinkEnabled,
  useSetSquadPhoto,
  useUpdateSquad,
  useUploadSquadPhoto,
} from "../../hooks/useSquads"
import { SQUAD_PHOTO_ASPECT } from "../../services/uploadSquadPhoto"
import { squadErrorCode, squadErrorSentence, squadFieldError } from "../../squadErrors"
import type { SquadDetail, SquadInviteLink, SquadLevel, UpdateSquadPayload } from "../../types"
import parts from "../sheetParts.module.css"
import SquadPhoto from "../SquadPhoto/SquadPhoto"
import SquadSwitch from "../SquadSwitch/SquadSwitch"
import styles from "./SettingsTab.module.css"

const NAME_MIN = 2
const NAME_MAX = 80
const SHORT_MAX = 20
export const ABOUT_MAX = 600

export const SPORT_LOCKED_HINT = "The sport can't change once the squad has players."

const LEVELS: { value: Exclude<SquadLevel, "">; label: string }[] = [
  { value: "youth", label: "Youth" },
  { value: "reserve", label: "Reserve" },
  { value: "senior", label: "Senior" },
]

type Draft = {
  name: string
  sport_id: string
  level: SquadLevel
  age_group: string
  season: string
  description: string
}

type DraftErrors = Partial<Record<keyof Draft | "form", string>>

function draftFrom(squad: SquadDetail): Draft {
  return {
    name: squad.name,
    sport_id: squad.sport.id,
    level: squad.level,
    age_group: squad.age_group,
    season: squad.season,
    description: squad.description,
  }
}

/** Only what changed, trimmed the way the server stores it. */
export function changedFields(draft: Draft, squad: SquadDetail): UpdateSquadPayload {
  const saved = draftFrom(squad)
  const payload: UpdateSquadPayload = {}
  const name = draft.name.trim()
  if (name !== saved.name) payload.name = name
  if (draft.sport_id !== saved.sport_id) payload.sport_id = draft.sport_id
  if (draft.level !== saved.level) payload.level = draft.level
  if (draft.age_group.trim() !== saved.age_group) payload.age_group = draft.age_group.trim()
  if (draft.season.trim() !== saved.season) payload.season = draft.season.trim()
  if (draft.description.trim() !== saved.description) {
    payload.description = draft.description.trim()
  }
  return payload
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  const id = useId()
  return (
    <section className={styles.card} aria-labelledby={id}>
      <h2 id={id} className={styles.cardTitle}>
        {title}
      </h2>
      {children}
    </section>
  )
}

function WhoSeesIt({ orgId, squad }: { orgId: string; squad: SquadDetail }) {
  const toast = useToast()
  const orgName = useOrgName(orgId)
  const update = useUpdateSquad(orgId, squad.id)

  return (
    <Card title="Who sees it">
      <SquadSwitch
        label="Show on club profile"
        hint={`Your squad page and its players appear on ${orgName}'s profile.`}
        checked={squad.is_public}
        busy={update.isPending}
        bordered={false}
        onChange={(next) => {
          if (update.isPending) return
          update.mutate(
            { is_public: next },
            {
              onSuccess: () =>
                toast.show({
                  title: next ? "Shown on your club's profile" : "Hidden from your club's profile",
                  variant: "success",
                  position: "top-center",
                }),
              onError: (err) =>
                toast.show({ title: squadErrorSentence(err), variant: "error", position: "top-center" }),
            }
          )
        }}
      />
      <p className={styles.lockNote}>
        <Icon icon="mdi:lock-outline" width={16} height={16} aria-hidden="true" />
        <span>
          People who aren&apos;t signed in only see players whose own profile is public. Ages and
          birthdays are never shown.
        </span>
      </p>
    </Card>
  )
}

function InviteLink({
  orgId,
  squad,
  invite,
}: {
  orgId: string
  squad: SquadDetail
  invite: SquadInviteLink
}) {
  const toast = useToast()
  const orgName = useOrgName(orgId)
  const setEnabled = useSetInviteLinkEnabled(orgId, squad.id)
  const reset = useResetInviteLink(orgId, squad.id)
  const { copyLink } = useSquadInviteShare({ url: invite.url, squadName: squad.name, orgName })
  const [askingReset, setAskingReset] = useState(false)

  return (
    <Card title="Invite link">
      <SquadSwitch
        label="Link is on"
        hint="Anyone with it can ask to join"
        checked={invite.enabled}
        busy={setEnabled.isPending}
        bordered={false}
        onChange={(next) => {
          if (setEnabled.isPending) return
          setEnabled.mutate(next, {
            onError: (err) =>
              toast.show({ title: squadErrorSentence(err), variant: "error", position: "top-center" }),
          })
        }}
      />

      <div className={styles.linkBox}>
        <span className={`${styles.linkText} ${invite.enabled ? "" : styles.linkOff}`}>
          {invite.url}
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void copyLink()}
          leftIcon={<Icon icon="mdi:content-copy" width={16} height={16} />}
          aria-label="Copy invite link"
        >
          Copy
        </Button>
      </div>

      <Button
        variant="outline"
        className={styles.dangerOutline}
        loading={reset.isPending}
        disabled={reset.isPending}
        leftIcon={<Icon icon="mdi:refresh" width={18} height={18} />}
        onClick={() => setAskingReset(true)}
      >
        Reset link
      </Button>

      <ConfirmDialog
        open={askingReset}
        title="Reset the invite link?"
        message="Every link you've shared stops working. Requests you already have stay."
        confirmLabel="Reset link"
        cancelLabel="Keep"
        tone="danger"
        onCancel={() => setAskingReset(false)}
        onConfirm={() => {
          setAskingReset(false)
          reset.mutate(undefined, {
            onSuccess: () =>
              toast.show({ title: "New link ready", variant: "success", position: "top-center" }),
            onError: (err) =>
              toast.show({ title: squadErrorSentence(err), variant: "error", position: "top-center" }),
          })
        }}
      />
    </Card>
  )
}

function PhotoField({ orgId, squad }: { orgId: string; squad: SquadDetail }) {
  const toast = useToast()
  const upload = useUploadSquadPhoto(orgId, squad.id)
  const setPhoto = useSetSquadPhoto(orgId, squad.id)
  const inputRef = useRef<HTMLInputElement>(null)
  const [cropFile, setCropFile] = useState<File | null>(null)
  const [askingRemove, setAskingRemove] = useState(false)

  const fail = (message: string) =>
    toast.show({ title: message, variant: "error", position: "top-center" })

  // Crop-first, like every small photo flow: the cropper draws the photo itself,
  // so a HEIC this browser can't decode is converted before it gets there.
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
      setCropFile(await ensureDecodableImage(picked, { flow: "single", surface: "squads" }))
    } catch (err) {
      fail(err instanceof Error ? err.message : "Couldn't open that photo.")
    }
  }

  const onCropped = (blob: Blob) => {
    const name = cropFile?.name ?? "squad.jpg"
    setCropFile(null)
    // The sheet closes at once; the button says the upload is running, and a
    // failure keeps the photo the squad already has.
    upload.mutate(
      { blob, originalName: name },
      {
        onSuccess: () =>
          toast.show({ title: "Photo updated", variant: "success", position: "top-center" }),
        onError: (err) => fail(squadErrorSentence(err)),
      }
    )
  }

  const busy = upload.isPending || setPhoto.isPending

  return (
    <div className={styles.photoField}>
      <SquadPhoto
        photoUrl={squad.photo_url}
        sport={squad.sport}
        showAddHint
        className={styles.photoPreview}
      />
      <div className={styles.photoActions}>
        <Button
          variant="outline"
          size="sm"
          loading={upload.isPending}
          disabled={busy}
          leftIcon={<Icon icon="mdi:image-edit-outline" width={16} height={16} />}
          onClick={() => inputRef.current?.click()}
        >
          {upload.isPending ? "Uploading photo…" : squad.photo_url ? "Change photo" : "Add photo"}
        </Button>
        {squad.photo_url && (
          <Button
            variant="ghost"
            size="sm"
            loading={setPhoto.isPending}
            disabled={busy}
            onClick={() => setAskingRemove(true)}
          >
            Remove photo
          </Button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => void onPick(event)}
        data-testid="squad-photo-input"
      />

      {cropFile && (
        <OrgPhotoCropSheet
          type="cover"
          file={cropFile}
          aspect={SQUAD_PHOTO_ASPECT}
          title="Crop squad photo"
          confirmLabel="Use photo"
          onCancel={() => setCropFile(null)}
          onDone={onCropped}
        />
      )}

      <ConfirmDialog
        open={askingRemove}
        title="Remove the squad photo?"
        message="The squad shows its sport's icon instead."
        confirmLabel="Remove photo"
        cancelLabel="Keep"
        tone="danger"
        onCancel={() => setAskingRemove(false)}
        onConfirm={() => {
          setAskingRemove(false)
          setPhoto.mutate(
            { remove: true },
            {
              onSuccess: () =>
                toast.show({ title: "Photo removed", variant: "success", position: "top-center" }),
              onError: (err) => fail(squadErrorSentence(err)),
            }
          )
        }}
      />
    </div>
  )
}

function DetailsForm({ orgId, squad }: { orgId: string; squad: SquadDetail }) {
  const toast = useToast()
  const ids = useId()
  const update = useUpdateSquad(orgId, squad.id)
  const { data: sports, isLoading: sportsLoading } = useSportsList()
  const [draft, setDraft] = useState<Draft>(() => draftFrom(squad))
  const [errors, setErrors] = useState<DraftErrors>({})

  const sportLocked = squad.members_count + squad.pending_count + squad.open_invites_count > 0
  const sportOptions = useMemo(() => {
    const options = (sports ?? []).map((sport) => ({
      value: sport.id,
      label: sport.name,
      icon: sport.icon_name || undefined,
    }))
    // The squad's own sport is always an option, even before the catalog loads.
    if (!options.some((option) => option.value === squad.sport.id)) {
      options.unshift({
        value: squad.sport.id,
        label: squad.sport.name,
        icon: squad.sport.icon_name || undefined,
      })
    }
    return options
  }, [sports, squad.sport])

  const changes = changedFields(draft, squad)
  const dirty = Object.keys(changes).length > 0

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((previous) => ({ ...previous, [key]: value }))
    if (errors[key] || errors.form) {
      setErrors((previous) => ({ ...previous, [key]: undefined, form: undefined }))
    }
  }

  const save = () => {
    if (!dirty || update.isPending) return
    const name = changes.name
    if (name !== undefined && (name.length < NAME_MIN || name.length > NAME_MAX)) {
      setErrors({ name: `Give the squad a name of ${NAME_MIN} to ${NAME_MAX} characters.` })
      return
    }
    setErrors({})
    update.mutate(changes, {
      onSuccess: (saved) => {
        setDraft(draftFrom(saved))
        toast.show({ title: "Saved", variant: "success", position: "top-center" })
      },
      onError: (err) => {
        const code = squadErrorCode(err)
        const sentence = squadErrorSentence(err)
        if (code === "name_taken" || code === "invalid_name") setErrors({ name: sentence })
        else if (code === "invalid_sport" || code === "sport_locked") setErrors({ sport_id: sentence })
        else if (code === "invalid_field") {
          const field = (["level", "age_group", "season", "description"] as const).find((key) =>
            squadFieldError(err, key)
          )
          setErrors(field ? { [field]: squadFieldError(err, field) } : { form: sentence })
        } else setErrors({ form: sentence })
      },
    })
  }

  const field = (
    key: "name" | "age_group" | "season",
    label: string,
    max: number,
    extra?: { placeholder?: string; optional?: boolean }
  ) => {
    const id = `${ids}-${key}`
    return (
      <div className={parts.field}>
        <label className={parts.label} htmlFor={id}>
          {label} {extra?.optional && <span className={parts.optional}>(optional)</span>}
        </label>
        <input
          id={id}
          className={`${parts.input} ${errors[key] ? parts.inputInvalid : ""}`}
          value={draft[key]}
          onChange={(event) => set(key, event.target.value)}
          maxLength={max}
          placeholder={extra?.placeholder}
          autoComplete="off"
          disabled={update.isPending}
          aria-invalid={!!errors[key]}
          aria-describedby={errors[key] ? `${id}-error` : undefined}
        />
        {errors[key] && (
          <p id={`${id}-error`} className={parts.fieldError}>
            {errors[key]}
          </p>
        )}
      </div>
    )
  }

  const aboutId = `${ids}-about`

  return (
    <div className={styles.form}>
      {field("name", "Name", NAME_MAX)}

      <Select
        label="Sport"
        sheetTitle="Sport"
        placeholder={sportsLoading ? "Loading sports…" : "Choose a sport"}
        options={sportOptions}
        value={draft.sport_id}
        onChange={(value) => set("sport_id", value)}
        disabled={sportLocked || update.isPending}
        helperText={sportLocked ? SPORT_LOCKED_HINT : undefined}
        error={errors.sport_id}
        searchable
      />

      <div className={parts.field}>
        <span className={parts.label} id={`${ids}-level`}>
          Level <span className={parts.optional}>(optional)</span>
        </span>
        <div className={styles.chips} role="group" aria-labelledby={`${ids}-level`}>
          {LEVELS.map((option) => {
            const selected = draft.level === option.value
            return (
              <button
                key={option.value}
                type="button"
                className={`${styles.chip} ${selected ? styles.chipOn : ""}`}
                aria-pressed={selected}
                disabled={update.isPending}
                onClick={() => set("level", selected ? "" : option.value)}
              >
                {selected && <Icon icon="mdi:check" width={16} height={16} aria-hidden="true" />}
                {option.label}
              </button>
            )
          })}
        </div>
        {errors.level && <p className={parts.fieldError}>{errors.level}</p>}
      </div>

      <div className={styles.row}>
        {field("age_group", "Age group", SHORT_MAX, { placeholder: "U17", optional: true })}
        {field("season", "Season", SHORT_MAX, { optional: true })}
      </div>

      <div className={parts.field}>
        <label className={parts.label} htmlFor={aboutId}>
          About <span className={parts.optional}>(optional)</span>
        </label>
        <textarea
          id={aboutId}
          className={`${parts.textarea} ${errors.description ? parts.inputInvalid : ""}`}
          value={draft.description}
          onChange={(event) => set("description", event.target.value.slice(0, ABOUT_MAX))}
          maxLength={ABOUT_MAX}
          rows={4}
          disabled={update.isPending}
          aria-invalid={!!errors.description}
        />
        <div className={parts.fieldFoot}>
          {errors.description ? (
            <p className={parts.fieldError}>{errors.description}</p>
          ) : (
            <span />
          )}
          <span className={parts.counter}>
            {draft.description.length}/{ABOUT_MAX}
          </span>
        </div>
      </div>

      {errors.form && (
        <p className={parts.error} role="alert">
          {errors.form}
        </p>
      )}

      <Button
        variant="brand"
        fullWidth
        loading={update.isPending}
        disabled={!dirty || update.isPending}
        onClick={save}
      >
        Save changes
      </Button>
    </div>
  )
}

/**
 * The Settings tab (squads.manage only; SquadPage sends anyone else to Players):
 * who sees the squad, its invite link, its details, and deleting it.
 */
export default function SettingsTab({ orgId, squad }: { orgId: string; squad: SquadDetail }) {
  const toast = useToast()
  const router = useRouter()
  const remove = useDeleteSquad(orgId, squad.id)
  const [askingDelete, setAskingDelete] = useState(false)

  return (
    <div className={styles.tab}>
      <WhoSeesIt orgId={orgId} squad={squad} />

      {squad.invite && <InviteLink orgId={orgId} squad={squad} invite={squad.invite} />}

      <Card title="Squad details">
        <PhotoField orgId={orgId} squad={squad} />
        <DetailsForm orgId={orgId} squad={squad} />
      </Card>

      <button
        type="button"
        className={styles.deleteBtn}
        disabled={remove.isPending}
        onClick={() => setAskingDelete(true)}
      >
        <Icon icon="mdi:delete-outline" width={18} height={18} aria-hidden="true" />
        {remove.isPending ? "Deleting…" : "Delete squad"}
      </button>

      <ConfirmDialog
        open={askingDelete}
        title={`Delete ${squad.name}?`}
        message={`Players keep ${squad.name} on their profile, ending today. Requests and invites are cancelled.`}
        confirmLabel="Delete squad"
        cancelLabel="Keep"
        tone="danger"
        onCancel={() => setAskingDelete(false)}
        onConfirm={() => {
          setAskingDelete(false)
          remove.mutate(undefined, {
            onSuccess: () => {
              toast.show({ title: "Squad deleted", variant: "success", position: "top-center" })
              // Replace: back from the list must not reopen a squad that is gone.
              router.replace(`/organization/admin/${orgId}/squads`)
            },
            onError: (err) =>
              toast.show({ title: squadErrorSentence(err), variant: "error", position: "top-center" }),
          })
        }}
      />
    </div>
  )
}
