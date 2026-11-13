"use client"

import { useState } from "react"

import { Button } from "@/shared/components/ui"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { useMoveSquadMember, useSquads } from "../../hooks/useSquads"
import { squadErrorSentence } from "../../squadErrors"
import { countLabel } from "../../squadUtils"
import type { MemberItem, SquadDetail } from "../../types"
import parts from "../sheetParts.module.css"
import SquadSheet from "../SquadSheet/SquadSheet"

/**
 * Move a player to another of the club's squads. Same sport only: their
 * verified stint at the club carries over, and a different sport would be a
 * different stint (the server refuses it as sport_mismatch).
 */
export default function MoveSheet({
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
  const move = useMoveSquadMember(orgId, squad.id)
  const { data, isLoading } = useSquads(orgId, { sportId: squad.sport.id })
  const others = (data ?? []).filter(
    (other) => other.id !== squad.id && other.sport.id === squad.sport.id
  )

  const [targetId, setTargetId] = useState("")
  const [error, setError] = useState<string | null>(null)
  const target = others.find((other) => other.id === targetId)

  const submit = (close: () => void) => {
    if (!target || move.isPending) return
    setError(null)
    move.mutate(
      { memberId: member.id, toSquadId: target.id },
      {
        onSuccess: () => {
          toast.show({ title: `Moved to ${target.name}`, variant: "success", position: "top-center" })
          close()
        },
        onError: (err) =>
          setError(
            squadErrorSentence(err, {
              memberNoun: squad.config.member_noun,
              memberNounPlural: squad.config.member_noun_plural,
            })
          ),
      }
    )
  }

  return (
    <SquadSheet
      title={`Move ${member.user.name}`}
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
            loading={move.isPending}
            disabled={!target || move.isPending}
            onClick={() => submit(close)}
          >
            Move
          </Button>
        </div>
      )}
    >
      {() =>
        isLoading ? (
          <p className={parts.hint}>Loading squads…</p>
        ) : others.length === 0 ? (
          <p className={parts.empty}>There&apos;s no other {squad.sport.name} squad to move them to.</p>
        ) : (
          <fieldset className={parts.radioList}>
            <legend className={parts.label}>Move to</legend>
            {others.map((other) => {
              const checked = other.id === targetId
              return (
                <label
                  key={other.id}
                  className={`${parts.radioCard} ${checked ? parts.radioCardOn : ""}`}
                >
                  <input
                    type="radio"
                    name={`move-${member.id}`}
                    value={other.id}
                    checked={checked}
                    onChange={() => setTargetId(other.id)}
                    disabled={move.isPending}
                  />
                  <span className={parts.radioText}>
                    <span className={parts.radioTitle}>{other.name}</span>
                    <span className={parts.radioSub}>
                      {countLabel(other.members_count, "player", "players")}
                    </span>
                  </span>
                </label>
              )
            })}
          </fieldset>
        )
      }
    </SquadSheet>
  )
}
