"use client"

import { useId, useState } from "react"

import { Button } from "@/shared/components/ui"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { keepFocusProps } from "@/shared/hooks/keepFocus"
import { settleViewport } from "@/shared/utils/settleViewport"
import { useSquadRoster, useUpdateSquadMember } from "../../hooks/useSquads"
import { squadErrorCode, squadErrorSentence, squadFieldError } from "../../squadErrors"
import type { MemberItem, SquadDetail, UpdateMemberPayload } from "../../types"
import parts from "../sheetParts.module.css"
import SquadPlacementFields, {
  initialPlacement,
  parseJersey,
  type PlacementValue,
} from "../SquadPlacementFields/SquadPlacementFields"
import SquadSheet from "../SquadSheet/SquadSheet"

export const NOTES_MAX = 500

/**
 * A player's place in the squad and the club's private note on them. Only what
 * changed is sent; "No position" and an emptied number are sent as null.
 */
export default function EditPlayerSheet({
  orgId,
  squad,
  member,
  onClose,
}: {
  orgId: string
  squad: SquadDetail
  member: MemberItem
  onClose: () => void
}) {
  const toast = useToast()
  const ids = useId()
  const notesId = `${ids}-notes`
  const update = useUpdateSquadMember(orgId, squad.id)
  const { data: roster } = useSquadRoster(orgId, squad.id)

  const initial = initialPlacement(squad.config, member.position?.id, member.jersey_number)
  const [placement, setPlacement] = useState<PlacementValue>(initial)
  const [notes, setNotes] = useState(member.notes ?? "")
  const [error, setError] = useState<string | null>(null)
  const [positionError, setPositionError] = useState<string | undefined>()
  const [jerseyError, setJerseyError] = useState<string | undefined>()

  const changes = (): UpdateMemberPayload | "invalid" => {
    const payload: UpdateMemberPayload = {}
    if (squad.config.uses_positions && placement.positionId !== initial.positionId) {
      payload.position_id = placement.positionId || null
    }
    if (squad.config.uses_jersey_numbers && placement.jersey !== initial.jersey) {
      const jersey = parseJersey(placement.jersey)
      if (jersey === "invalid") return "invalid"
      payload.jersey_number = jersey
    }
    if (notes !== (member.notes ?? "")) payload.notes = notes
    return payload
  }

  const pending = changes()
  const dirty = pending === "invalid" || Object.keys(pending).length > 0

  const save = (close: () => void) => {
    if (update.isPending) return
    const payload = changes()
    if (payload === "invalid") {
      setJerseyError("Shirt numbers go from 0 to 99.")
      return
    }
    if (Object.keys(payload).length === 0) {
      close()
      return
    }
    setError(null)
    setPositionError(undefined)
    setJerseyError(undefined)

    update.mutate(
      { memberId: member.id, payload },
      {
        onSuccess: () => {
          toast.show({ title: "Saved", variant: "success", position: "top-center" })
          void settleViewport()
          close()
        },
        onError: (err) => {
          const code = squadErrorCode(err)
          const sentence = squadErrorSentence(err, {
            memberNoun: squad.config.member_noun,
            memberNounPlural: squad.config.member_noun_plural,
          })
          if (code === "jersey_taken" || code === "invalid_jersey") setJerseyError(sentence)
          else if (code === "invalid_position") setPositionError(sentence)
          else setError(squadFieldError(err, "notes") ?? sentence)
        },
      }
    )
  }

  return (
    <SquadSheet
      title={member.user.name}
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
            loading={update.isPending}
            disabled={update.isPending || !dirty}
            onClick={() => save(close)}
            {...keepFocusProps}
          >
            Save
          </Button>
        </div>
      )}
    >
      {() => (
        <div className={parts.content}>
          <SquadPlacementFields
            config={squad.config}
            roster={roster}
            value={placement}
            onChange={(next) => {
              setPlacement(next)
              if (jerseyError) setJerseyError(undefined)
              if (positionError) setPositionError(undefined)
            }}
            excludeMemberId={member.id}
            positionError={positionError}
            jerseyError={jerseyError}
            disabled={update.isPending}
          />

          <div className={parts.field}>
            <label className={parts.label} htmlFor={notesId}>
              Notes <span className={parts.optional}>(optional)</span>
            </label>
            <textarea
              id={notesId}
              className={parts.textarea}
              value={notes}
              onChange={(event) => setNotes(event.target.value.slice(0, NOTES_MAX))}
              maxLength={NOTES_MAX}
              rows={4}
              disabled={update.isPending}
              aria-describedby={`${notesId}-hint`}
            />
            <div className={parts.fieldFoot}>
              <p id={`${notesId}-hint`} className={parts.hint}>
                Only your club sees this
              </p>
              <span className={parts.counter} aria-live="polite">
                {notes.length}/{NOTES_MAX}
              </span>
            </div>
          </div>
        </div>
      )}
    </SquadSheet>
  )
}
