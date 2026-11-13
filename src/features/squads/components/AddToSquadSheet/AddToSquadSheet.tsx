"use client"

import { useMemo, useState } from "react"

import { Button } from "@/shared/components/ui"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { keepFocusProps } from "@/shared/hooks/keepFocus"
import { settleViewport } from "@/shared/utils/settleViewport"
import { useInviteToSquad, useSquad, useSquadRoster, useSquads } from "../../hooks/useSquads"
import { squadErrorCode, squadErrorSentence } from "../../squadErrors"
import { countLabel } from "../../squadUtils"
import type { SquadListItem } from "../../types"
import parts from "../sheetParts.module.css"
import SquadPlacementFields, {
  placementBody,
  type PlacementValue,
} from "../SquadPlacementFields/SquadPlacementFields"
import SquadSheet from "../SquadSheet/SquadSheet"

const EMPTY_PLACEMENT: PlacementValue = { positionId: "", jersey: "" }

/** The club's squads, the recruitment's sport first; otherwise as the server orders them. */
export function squadsForApplicant(squads: SquadListItem[], sportId?: string): SquadListItem[] {
  if (!sportId) return squads
  return [
    ...squads.filter((squad) => squad.sport.id === sportId),
    ...squads.filter((squad) => squad.sport.id !== sportId),
  ]
}

/**
 * "Add to squad" on a Selected applicant (squads.review): a direct invite that
 * names the application, so the server can tie the squad place to the trial
 * the player was picked at.
 */
export default function AddToSquadSheet({
  orgId,
  applicationId,
  applicant,
  sportId,
  onClose,
}: {
  orgId: string
  applicationId: string
  applicant: { id: string; name: string }
  /** The recruitment's sport, when the caller knows it: its squads come first. */
  sportId?: string
  onClose: () => void
}) {
  const toast = useToast()
  const { data, isLoading, isError } = useSquads(orgId)
  const squads = useMemo(() => squadsForApplicant(data ?? [], sportId), [data, sportId])

  const [chosenId, setChosenId] = useState("")
  const squadId = chosenId || (squads.length === 1 ? squads[0].id : "")
  const chosen = squads.find((squad) => squad.id === squadId)

  const [placements, setPlacements] = useState<Record<string, PlacementValue>>({})
  const [error, setError] = useState<string | null>(null)
  const [jerseyError, setJerseyError] = useState<string | undefined>()

  const { data: detail } = useSquad(orgId, squadId)
  const { data: roster } = useSquadRoster(orgId, squadId, !!squadId)
  const invite = useInviteToSquad(orgId, squadId)
  const placement = placements[squadId] ?? EMPTY_PLACEMENT

  const submit = (close: () => void) => {
    if (!chosen || !detail || invite.isPending) return
    const body = placementBody(detail.config, placement)
    if (body.invalid) {
      setJerseyError("Shirt numbers go from 0 to 99.")
      return
    }
    setError(null)
    setJerseyError(undefined)

    invite.mutate(
      { user_id: applicant.id, application_id: applicationId, ...body.fields },
      {
        onSuccess: (row) => {
          toast.show({
            title:
              row.status === "active"
                ? `${applicant.name} added to ${chosen.name}`
                : `Invite sent — ${applicant.name} joins when they accept.`,
            variant: "success",
            position: "top-center",
          })
          void settleViewport()
          close()
        },
        onError: (err) => {
          const code = squadErrorCode(err)
          if (code === "jersey_taken" || code === "invalid_jersey") {
            setJerseyError(squadErrorSentence(err))
          } else if (code === "already_member") {
            setError(`Already in ${chosen.name}.`)
          } else if (code === "already_invited") {
            setError(`Already invited to ${chosen.name}.`)
          } else if (code === "invalid_application") {
            setError("This application can't be used for an invite.")
          } else {
            setError(
              squadErrorSentence(err, {
                memberNoun: detail.config.member_noun,
                memberNounPlural: detail.config.member_noun_plural,
              })
            )
          }
        },
      }
    )
  }

  return (
    <SquadSheet
      title={`Add ${applicant.name} to a squad`}
      onClose={onClose}
      footer={(close) => (
        <div className={parts.footer}>
          {error && (
            <p className={parts.error} role="alert">
              {error}
            </p>
          )}
          <Button
            variant="brand"
            fullWidth
            loading={invite.isPending}
            disabled={!chosen || !detail || invite.isPending}
            onClick={() => submit(close)}
            {...keepFocusProps}
          >
            Send invite
          </Button>
        </div>
      )}
    >
      {() =>
        isLoading ? (
          <p className={parts.hint}>Loading squads…</p>
        ) : isError && !data ? (
          <p className={parts.error} role="alert">
            Couldn&apos;t load your squads.
          </p>
        ) : squads.length === 0 ? (
          <p className={parts.empty}>Your club has no squads yet.</p>
        ) : (
          <div className={parts.content}>
            <fieldset className={parts.radioList}>
              <legend className={parts.label}>Squad</legend>
              {squads.map((squad) => {
                const checked = squad.id === squadId
                return (
                  <label
                    key={squad.id}
                    className={`${parts.radioCard} ${checked ? parts.radioCardOn : ""}`}
                  >
                    <input
                      type="radio"
                      name={`add-to-squad-${applicationId}`}
                      value={squad.id}
                      checked={checked}
                      onChange={() => {
                        setChosenId(squad.id)
                        setError(null)
                        setJerseyError(undefined)
                      }}
                      disabled={invite.isPending}
                    />
                    <span className={parts.radioText}>
                      <span className={parts.radioTitle}>{squad.name}</span>
                      <span className={parts.radioSub}>
                        {squad.sport.name} · {countLabel(squad.members_count, "player", "players")}
                      </span>
                    </span>
                  </label>
                )
              })}
            </fieldset>

            {detail && detail.id === squadId && (
              <SquadPlacementFields
                config={detail.config}
                roster={roster}
                value={placement}
                onChange={(next) => {
                  setPlacements((previous) => ({ ...previous, [squadId]: next }))
                  if (jerseyError) setJerseyError(undefined)
                }}
                jerseyError={jerseyError}
                disabled={invite.isPending}
              />
            )}

            {chosen && (
              <p className={parts.note}>
                They join as soon as they accept. Their profile will show {chosen.name} as
                verified.
              </p>
            )}
          </div>
        )
      }
    </SquadSheet>
  )
}
