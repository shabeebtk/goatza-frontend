"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"

import { useVerifyCareerEntryIntoSquad } from "@/features/career/hooks/useCareerQueries"
import type { CareerReviewTab, CareerVerificationRequest } from "@/features/career/types"
import { Button } from "@/shared/components/ui"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { squadKeys, useSquad, useSquadRoster } from "../../hooks/useSquads"
import { squadErrorCode, squadErrorSentence } from "../../squadErrors"
import { countLabel } from "../../squadUtils"
import type { SquadListItem } from "../../types"
import parts from "../sheetParts.module.css"
import SquadPlacementFields, {
  initialPlacement,
  placementBody,
  type PlacementValue,
} from "../SquadPlacementFields/SquadPlacementFields"
import SquadSheet from "../SquadSheet/SquadSheet"

const JERSEY_CODES = new Set(["jersey_taken", "invalid_jersey"])

/**
 * "Verify and add to squad" on a pending career claim (verifications.review AND
 * squads.review): one call verifies the stint and puts the player in one of the
 * club's squads of that sport. The player hears about it once, as a squad place.
 */
export default function VerifyIntoSquadSheet({
  orgId,
  request,
  squads,
  tab,
  onClose,
}: {
  orgId: string
  request: CareerVerificationRequest
  /** The club's live squads in the claim's sport (at least one). */
  squads: SquadListItem[]
  tab: CareerReviewTab
  onClose: () => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const verify = useVerifyCareerEntryIntoSquad({ ownsError: (err) => !!squadErrorCode(err) })

  const [squadId, setSquadId] = useState(() => (squads.length === 1 ? squads[0].id : ""))
  // One placement per squad looked at, so switching back keeps what was typed.
  const [placements, setPlacements] = useState<Record<string, PlacementValue>>({})
  const [error, setError] = useState<string | null>(null)
  const [jerseyError, setJerseyError] = useState<string | undefined>()

  const { data: detail } = useSquad(orgId, squadId)
  const { data: roster } = useSquadRoster(orgId, squadId, !!squadId)
  const chosen = squads.find((squad) => squad.id === squadId)
  const name = request.user.name || request.user.username || "this player"

  const firstPosition = detail
    ? request.positions.find((position) =>
        detail.config.positions.some((option) => option.id === position.id)
      )
    : undefined
  const placement =
    (squadId && placements[squadId]) ||
    (detail ? initialPlacement(detail.config, firstPosition?.id) : { positionId: "", jersey: "" })

  const submit = (close: () => void) => {
    if (!chosen || !detail || verify.isPending) return
    const body = placementBody(detail.config, placement)
    if (body.invalid) {
      setJerseyError("Shirt numbers go from 0 to 99.")
      return
    }
    setError(null)
    setJerseyError(undefined)

    verify.mutate(
      {
        entryId: request.id,
        userId: request.user.id,
        tab,
        squad: { squad_id: chosen.id, ...body.fields },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: squadKeys.lists(orgId) })
          queryClient.invalidateQueries({ queryKey: squadKeys.members(orgId, chosen.id) })
          queryClient.invalidateQueries({ queryKey: squadKeys.detail(orgId, chosen.id) })
          toast.show({
            title: `Verified and added to ${chosen.name}`,
            variant: "success",
            position: "top-center",
          })
          close()
        },
        onError: (err) => {
          // A squads refusal is said here; a career one is the hook's toast.
          const code = squadErrorCode(err)
          if (!code) return
          // squadErrors' sport_mismatch sentence is about moving a player; here
          // it is the claim that is for another sport.
          const sentence =
            code === "sport_mismatch"
              ? `This claim is for a different sport than ${chosen.name}.`
              : squadErrorSentence(err, {
                  memberNoun: detail.config.member_noun,
                  memberNounPlural: detail.config.member_noun_plural,
                })
          if (JERSEY_CODES.has(code)) setJerseyError(sentence)
          else setError(sentence)
        },
      }
    )
  }

  return (
    <SquadSheet
      title={`Add ${name} to a squad`}
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
            loading={verify.isPending}
            disabled={!chosen || !detail || verify.isPending}
            onClick={() => submit(close)}
          >
            Verify and add
          </Button>
        </div>
      )}
    >
      {() => (
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
                    name={`verify-squad-${request.id}`}
                    value={squad.id}
                    checked={checked}
                    onChange={() => {
                      setSquadId(squad.id)
                      setError(null)
                      setJerseyError(undefined)
                    }}
                    disabled={verify.isPending}
                  />
                  <span className={parts.radioText}>
                    <span className={parts.radioTitle}>{squad.name}</span>
                    <span className={parts.radioSub}>
                      {countLabel(squad.members_count, "player", "players")}
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
              profilePositionId={firstPosition?.id}
              jerseyError={jerseyError}
              disabled={verify.isPending}
            />
          )}

          {chosen && (
            <p className={parts.note}>
              Their {request.sport.name} stint is verified, and they join {chosen.name} straight
              away.
            </p>
          )}
        </div>
      )}
    </SquadSheet>
  )
}
