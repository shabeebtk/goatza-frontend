"use client"

import { useId, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Icon } from "@iconify/react"

import { useSportsList } from "@/features/profile/hooks/useSportsQueries"
import { Button, Select } from "@/shared/components/ui"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { keepFocusProps } from "@/shared/hooks/keepFocus"
import { navigateAwayFromOverlays } from "@/shared/hooks/useBackToClose"
import { settleViewport } from "@/shared/utils/settleViewport"
import { useCreateSquad } from "../../hooks/useSquads"
import { squadErrorCode, squadErrorSentence, squadFieldError } from "../../squadErrors"
import { currentSeasonLabel } from "../../squadUtils"
import type { SquadLevel } from "../../types"
import SquadSheet from "../SquadSheet/SquadSheet"
import SquadSwitch from "../SquadSwitch/SquadSwitch"
import styles from "./NewSquadSheet.module.css"

const NAME_MIN = 2
const NAME_MAX = 80
const SHORT_MAX = 20

const LEVELS: { value: Exclude<SquadLevel, "">; label: string }[] = [
  { value: "youth", label: "Youth" },
  { value: "reserve", label: "Reserve" },
  { value: "senior", label: "Senior" },
]

const NAME_ERROR = `Give the squad a name of ${NAME_MIN} to ${NAME_MAX} characters.`
const SPORT_ERROR = "Choose a sport for this squad."
const OFFLINE_ERROR = "You're offline. Check your connection and try again."

type FieldErrors = {
  name?: string
  sport?: string
  age_group?: string
  season?: string
  form?: string
}

/**
 * New squad (squads.manage). Name and sport are all it needs; the rest can be
 * set now or later in Settings. On success the club lands on the new squad's
 * page, which for an empty squad is its share screen.
 */
export default function NewSquadSheet({
  orgId,
  onClose,
}: {
  orgId: string
  onClose: () => void
}) {
  const router = useRouter()
  const toast = useToast()
  const ids = useId()
  const create = useCreateSquad(orgId)
  const { data: sports, isLoading: sportsLoading } = useSportsList()

  const [name, setName] = useState("")
  const [sportId, setSportId] = useState("")
  const [level, setLevel] = useState<SquadLevel>("")
  const [ageGroup, setAgeGroup] = useState("")
  const [season, setSeason] = useState(() => currentSeasonLabel())
  const [isPublic, setIsPublic] = useState(true)
  const [errors, setErrors] = useState<FieldErrors>({})

  // isPending only turns true on the next render; two taps in one frame would
  // both get through it.
  const submittingRef = useRef(false)

  const sportOptions = useMemo(
    () =>
      (sports ?? []).map((sport) => ({
        value: sport.id,
        label: sport.name,
        icon: sport.icon_name || undefined,
      })),
    [sports]
  )

  const nameId = `${ids}-name`
  const ageId = `${ids}-age`
  const seasonId = `${ids}-season`

  const submit = () => {
    if (submittingRef.current || create.isPending) return

    const trimmedName = name.trim()
    const next: FieldErrors = {}
    if (trimmedName.length < NAME_MIN || trimmedName.length > NAME_MAX) next.name = NAME_ERROR
    if (!sportId) next.sport = SPORT_ERROR
    if (next.name || next.sport) {
      setErrors(next)
      return
    }

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setErrors({ form: OFFLINE_ERROR })
      return
    }

    submittingRef.current = true
    setErrors({})

    create.mutate(
      {
        name: trimmedName,
        sport_id: sportId,
        level,
        age_group: ageGroup.trim(),
        season: season.trim(),
        is_public: isPublic,
      },
      {
        onSuccess: (squad) => {
          toast.show({ title: "Squad created", variant: "success", position: "top-center" })
          void settleViewport()
          // Pops this sheet's history entry before pushing, so back from the
          // new squad lands on the list rather than on a dead sheet entry.
          navigateAwayFromOverlays(`/organization/admin/${orgId}/squads/${squad.id}`, router)
        },
        onError: (err) => {
          submittingRef.current = false
          const code = squadErrorCode(err)
          const sentence = squadErrorSentence(err)

          if (code === "name_taken" || code === "invalid_name") {
            setErrors({ name: sentence })
          } else if (code === "invalid_sport") {
            setErrors({ sport: sentence })
          } else {
            const ageError = squadFieldError(err, "age_group")
            const seasonError = squadFieldError(err, "season")
            if (code === "invalid_field" && (ageError || seasonError)) {
              setErrors({ age_group: ageError, season: seasonError })
            } else {
              setErrors({ form: sentence })
            }
          }
        },
      }
    )
  }

  return (
    <SquadSheet
      title="New squad"
      onClose={onClose}
      footer={() => (
        <div className={styles.footer}>
          {errors.form && (
            <p className={styles.formError} role="alert">
              {errors.form}
            </p>
          )}
          <Button
            variant="brand"
            fullWidth
            loading={create.isPending}
            disabled={create.isPending}
            onClick={submit}
            {...keepFocusProps}
          >
            {create.isPending ? "Creating…" : "Create"}
          </Button>
        </div>
      )}
    >
      {() => (
        <div className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor={nameId}>
              Name
            </label>
            <input
              id={nameId}
              className={`${styles.input} ${errors.name ? styles.inputInvalid : ""}`}
              value={name}
              onChange={(event) => {
                setName(event.target.value)
                if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }))
              }}
              maxLength={NAME_MAX}
              placeholder="U17 Boys"
              autoComplete="off"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? `${nameId}-error` : undefined}
              required
            />
            {errors.name && (
              <p id={`${nameId}-error`} className={styles.fieldError}>
                {errors.name}
              </p>
            )}
          </div>

          <Select
            label="Sport"
            sheetTitle="Sport"
            placeholder={sportsLoading ? "Loading sports…" : "Choose a sport"}
            options={sportOptions}
            value={sportId}
            onChange={(value) => {
              setSportId(value)
              if (errors.sport) setErrors((prev) => ({ ...prev, sport: undefined }))
            }}
            error={errors.sport}
            disabled={sportsLoading && sportOptions.length === 0}
            searchable
            required
          />

          <div className={styles.field}>
            <span className={styles.label} id={`${ids}-level`}>
              Level <span className={styles.optional}>(optional)</span>
            </span>
            <div className={styles.chips} role="group" aria-labelledby={`${ids}-level`}>
              {LEVELS.map((option) => {
                const selected = level === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`${styles.chip} ${selected ? styles.chipOn : ""}`}
                    aria-pressed={selected}
                    // Tapping the chosen level again clears it.
                    onClick={() => setLevel(selected ? "" : option.value)}
                  >
                    {selected && <Icon icon="mdi:check" width={16} height={16} aria-hidden="true" />}
                    {option.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor={ageId}>
                Age group <span className={styles.optional}>(optional)</span>
              </label>
              <input
                id={ageId}
                className={`${styles.input} ${errors.age_group ? styles.inputInvalid : ""}`}
                value={ageGroup}
                onChange={(event) => setAgeGroup(event.target.value)}
                maxLength={SHORT_MAX}
                placeholder="U17"
                autoComplete="off"
                  aria-invalid={!!errors.age_group}
              />
              {errors.age_group && <p className={styles.fieldError}>{errors.age_group}</p>}
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor={seasonId}>
                Season <span className={styles.optional}>(optional)</span>
              </label>
              <input
                id={seasonId}
                className={`${styles.input} ${errors.season ? styles.inputInvalid : ""}`}
                value={season}
                onChange={(event) => setSeason(event.target.value)}
                maxLength={SHORT_MAX}
                placeholder={currentSeasonLabel()}
                autoComplete="off"
                  aria-invalid={!!errors.season}
              />
              {errors.season && <p className={styles.fieldError}>{errors.season}</p>}
            </div>
          </div>

          <SquadSwitch
            label="Show on club profile"
            hint="Anyone can see this squad on your club's profile. You can turn it off any time."
            checked={isPublic}
            onChange={setIsPublic}
          />
        </div>
      )}
    </SquadSheet>
  )
}
