"use client"

import type { RefObject } from "react"
import { Icon } from "@iconify/react"

import LocationPicker from "@/shared/components/LocationPicker/LocationPicker"
import type { PlaceBias, PlaceResult } from "@/shared/services/places.service"
import type { Sport } from "@/features/profile/services/sports.api"
import {
  ADDRESS_MAX,
  BRANCH_NAME_MAX,
  DEFAULT_BRANCH_NAME,
  type CreateDraft,
  type CreateField,
  type FieldErrors,
} from "./createPageDraft"
import CreateFieldBox, { createInputClass, describedBy, fieldId } from "./CreateField"
import styles from "./LocationSportsStep.module.css"

export default function LocationSportsStep({
  draft,
  errors,
  onChange,
  onBlurField,
  placeBias,
  sports,
  sportsLoading,
  sportsError,
  onRetrySports,
  headingRef,
  disabled,
}: {
  draft: CreateDraft
  errors: FieldErrors
  onChange: (patch: Partial<CreateDraft>) => void
  onBlurField: (field: CreateField) => void
  placeBias: PlaceBias | null
  sports: Sport[]
  sportsLoading: boolean
  sportsError: boolean
  onRetrySports: () => void
  headingRef: RefObject<HTMLHeadingElement | null>
  disabled?: boolean
}) {
  const onCity = (city: PlaceResult | null) => {
    onChange({
      city,
      // A cleared town takes its branch details with it; a new one starts
      // from the default branch name if it was emptied.
      ...(city ? (draft.branchName.trim() ? {} : { branchName: DEFAULT_BRANCH_NAME }) : { address: "" }),
    })
  }

  const toggleSport = (id: string) => {
    onChange({
      sportIds: draft.sportIds.includes(id)
        ? draft.sportIds.filter((picked) => picked !== id)
        : [...draft.sportIds, id],
    })
  }

  const primaryId = draft.sportIds[0]

  return (
    <section className={styles.step} aria-labelledby="org-create-location-heading">
      <h2
        id="org-create-location-heading"
        ref={headingRef}
        tabIndex={-1}
        className={styles.heading}
      >
        Location & sports
      </h2>
      <p className={styles.lead}>Both are optional, and help nearby players find you.</p>

      <div className={styles.fields}>
        <CreateFieldBox field="city" label="Town or city" optional error={errors.city}>
          <LocationPicker
            inputId={fieldId("city")}
            value={draft.city}
            onChange={onCity}
            placeholder="Search your town, e.g. Kannur"
            bias={placeBias}
            disabled={disabled}
          />
        </CreateFieldBox>

        {draft.city && (
          <div className={styles.branch}>
            <CreateFieldBox
              field="branchName"
              label="Branch name"
              error={errors.branchName}
              hint={`Shown with the town, like “${DEFAULT_BRANCH_NAME}” or “North Campus”.`}
            >
              <input
                id={fieldId("branchName")}
                className={createInputClass}
                value={draft.branchName}
                onChange={(event) => onChange({ branchName: event.target.value })}
                onBlur={() => onBlurField("branchName")}
                maxLength={BRANCH_NAME_MAX}
                placeholder={DEFAULT_BRANCH_NAME}
                aria-invalid={!!errors.branchName}
                aria-describedby={describedBy("branchName", {
                  hint: !errors.branchName,
                  error: !!errors.branchName,
                })}
                disabled={disabled}
              />
            </CreateFieldBox>

            <CreateFieldBox field="address" label="Address" optional error={errors.address}>
              <input
                id={fieldId("address")}
                className={createInputClass}
                value={draft.address}
                onChange={(event) => onChange({ address: event.target.value })}
                onBlur={() => onBlurField("address")}
                maxLength={ADDRESS_MAX}
                placeholder="Street or landmark"
                autoComplete="street-address"
                aria-invalid={!!errors.address}
                aria-describedby={describedBy("address", { error: !!errors.address })}
                disabled={disabled}
              />
            </CreateFieldBox>
          </div>
        )}

        <div className={styles.group} id={fieldId("sports")}>
          <span id="org-create-sports-label" className={styles.groupLabel}>
            Sports <span className={styles.optional}>(optional)</span>
          </span>
          <p id="org-create-sports-hint" className={styles.groupHint}>
            Pick all that apply. The first one you pick is your primary sport.
          </p>

          {sportsLoading ? (
            <div className={styles.chips} aria-hidden="true">
              {Array.from({ length: 6 }, (_, index) => (
                <span key={index} className={styles.chipSkeleton} />
              ))}
            </div>
          ) : sportsError && sports.length === 0 ? (
            <p className={styles.loadError}>
              Couldn&apos;t load sports.{" "}
              <button type="button" className={styles.retry} onClick={onRetrySports}>
                Try again
              </button>
            </p>
          ) : (
            <div
              role="group"
              aria-labelledby="org-create-sports-label"
              aria-describedby="org-create-sports-hint"
              className={styles.chips}
            >
              {sports.map((sport) => {
                const on = draft.sportIds.includes(sport.id)
                const primary = on && sport.id === primaryId
                return (
                  <button
                    key={sport.id}
                    type="button"
                    aria-pressed={on}
                    className={`${styles.chip} ${on ? styles.chipOn : ""}`}
                    onClick={() => toggleSport(sport.id)}
                    disabled={disabled}
                  >
                    <Icon icon={sport.icon_name} width={16} height={16} aria-hidden="true" />
                    <span>{sport.name}</span>
                    {primary && <span className={styles.primary}>Primary</span>}
                    {on && !primary && (
                      <Icon icon="mdi:check" width={14} height={14} aria-hidden="true" />
                    )}
                  </button>
                )
              })}
            </div>
          )}
          {errors.sports && (
            <p className={styles.loadError}>{errors.sports}</p>
          )}
        </div>
      </div>
    </section>
  )
}
