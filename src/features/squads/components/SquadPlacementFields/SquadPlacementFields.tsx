"use client"

import { useId, useMemo } from "react"

import { Select } from "@/shared/components/ui"
import { freeJerseyNumbers, jerseyHolder } from "../../squadUtils"
import type { Roster, SquadConfig } from "../../types"
import parts from "../sheetParts.module.css"
import styles from "./SquadPlacementFields.module.css"

/** The Select's value for "No position": the Select keeps "" for its placeholder. */
const NO_POSITION = "__none__"

/** Shirt numbers the server takes: 0 to 99. */
export const JERSEY_MAX = 99

/**
 * The typed shirt number: null when the box is empty, a number when it is a valid
 * one, "invalid" otherwise. The input only lets digits through, so "invalid" is
 * a number above 99.
 */
export function parseJersey(value: string): number | null | "invalid" {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!/^\d{1,2}$/.test(trimmed)) return "invalid"
  const number = Number(trimmed)
  return number >= 0 && number <= JERSEY_MAX ? number : "invalid"
}

export type PlacementValue = {
  /** "" for no position. */
  positionId: string
  /** What is typed in the shirt-number box. */
  jersey: string
}

/** A starting value: the player's own position when the squad's sport has it. */
export function initialPlacement(
  config: SquadConfig,
  positionId?: string | null,
  jersey?: number | null
): PlacementValue {
  const known = !!positionId && config.positions.some((position) => position.id === positionId)
  return { positionId: known ? positionId : "", jersey: jersey != null ? String(jersey) : "" }
}

/**
 * The optional fields of a create-style body (approve, invite, verify into a
 * squad): only what the sport uses and the club filled in. `invalid` is true for
 * a shirt number the server would refuse, which the caller checks first.
 */
export function placementBody(
  config: SquadConfig,
  value: PlacementValue
): { fields: { position_id?: string; jersey_number?: number }; invalid: boolean } {
  const jersey = config.uses_jersey_numbers ? parseJersey(value.jersey) : null
  return {
    fields: {
      ...(config.uses_positions && value.positionId ? { position_id: value.positionId } : {}),
      ...(typeof jersey === "number" ? { jersey_number: jersey } : {}),
    },
    invalid: jersey === "invalid",
  }
}

/**
 * Where a player goes in a squad: the position (only for a sport that uses
 * positions) and the shirt number (only for one that uses numbers), with the
 * squad's free numbers as quick picks and a live "free / taken" line read from
 * the roster. Every flow that puts a player in a squad uses this one: approving
 * a request, a direct invite, editing a player, verifying into a squad, and
 * adding a selected applicant.
 */
export default function SquadPlacementFields({
  config,
  roster,
  value,
  onChange,
  profilePositionId,
  excludeMemberId,
  positionError,
  jerseyError,
  disabled,
}: {
  config: SquadConfig
  /** For the quick picks and the taken check; both wait for it. */
  roster?: Roster
  value: PlacementValue
  onChange: (next: PlacementValue) => void
  /** The player's own position; while it is the one chosen, the field says so. */
  profilePositionId?: string | null
  /** The player being edited, whose own number is not "another player's". */
  excludeMemberId?: string
  positionError?: string
  jerseyError?: string
  disabled?: boolean
}) {
  const ids = useId()
  const jerseyId = `${ids}-jersey`
  const jerseyStatusId = `${ids}-jersey-status`

  const positionOptions = useMemo(
    () => [
      { value: NO_POSITION, label: "No position" },
      ...config.positions.map((position) => ({
        value: position.id,
        label: position.name,
        hint: position.group || undefined,
      })),
    ],
    [config.positions]
  )

  const quickPicks = useMemo(() => (roster ? freeJerseyNumbers(roster) : []), [roster])

  const parsed = parseJersey(value.jersey)
  const holder =
    typeof parsed === "number" && roster ? jerseyHolder(roster, parsed, excludeMemberId) : undefined

  let jerseyStatus: { text: string; taken: boolean } | null = null
  if (jerseyError) jerseyStatus = { text: jerseyError, taken: true }
  else if (parsed === "invalid") {
    jerseyStatus = { text: `Shirt numbers go from 0 to ${JERSEY_MAX}.`, taken: true }
  }
  else if (holder) jerseyStatus = { text: `Another player has #${parsed}`, taken: true }
  else if (typeof parsed === "number" && roster) jerseyStatus = { text: "Free in this squad", taken: false }

  const fromProfile =
    !!profilePositionId && value.positionId === profilePositionId && !positionError

  if (!config.uses_positions && !config.uses_jersey_numbers) return null

  return (
    <div className={styles.fields}>
      {config.uses_positions && (
        <Select
          label="Position"
          sheetTitle="Position"
          placeholder="Choose a position"
          options={positionOptions}
          // "" shows the placeholder, which is also what "No position" picks.
          value={value.positionId}
          onChange={(next) =>
            onChange({ ...value, positionId: next === NO_POSITION ? "" : next })
          }
          helperText={fromProfile ? "From their profile" : undefined}
          error={positionError}
          disabled={disabled}
        />
      )}

      {config.uses_jersey_numbers && (
        <div className={parts.field}>
          <label className={parts.label} htmlFor={jerseyId}>
            Shirt number <span className={parts.optional}>(optional)</span>
          </label>
          <input
            id={jerseyId}
            className={`${parts.input} ${styles.jerseyInput} ${
              jerseyStatus?.taken ? parts.inputInvalid : ""
            }`}
            value={value.jersey}
            onChange={(event) =>
              onChange({ ...value, jersey: event.target.value.replace(/\D/g, "").slice(0, 2) })
            }
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={2}
            placeholder="—"
            autoComplete="off"
            disabled={disabled}
            aria-invalid={!!jerseyStatus?.taken}
            aria-describedby={jerseyStatus ? jerseyStatusId : undefined}
          />

          {quickPicks.length > 0 && (
            <div className={styles.picks} role="group" aria-label="Free shirt numbers">
              {quickPicks.map((number) => {
                const chosen = parsed === number
                return (
                  <button
                    key={number}
                    type="button"
                    className={`${styles.pick} ${chosen ? styles.pickOn : ""}`}
                    aria-pressed={chosen}
                    disabled={disabled}
                    onClick={() => onChange({ ...value, jersey: String(number) })}
                  >
                    {number}
                  </button>
                )
              })}
            </div>
          )}

          {jerseyStatus && (
            <p
              id={jerseyStatusId}
              className={jerseyStatus.taken ? parts.fieldError : styles.free}
              aria-live="polite"
            >
              {jerseyStatus.text}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
