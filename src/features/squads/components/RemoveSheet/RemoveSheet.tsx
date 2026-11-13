"use client"

import { useState } from "react"

import { Button } from "@/shared/components/ui"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { useRemoveSquadMember } from "../../hooks/useSquads"
import { squadErrorSentence } from "../../squadErrors"
import type { MemberItem, RemoveReason, SquadDetail } from "../../types"
import parts from "../sheetParts.module.css"
import SquadSheet from "../SquadSheet/SquadSheet"

/**
 * Take a player out of the squad. Why decides what their profile keeps: someone
 * who left keeps a verified stint that ends today; someone added by mistake was
 * never there, so the squad comes off their profile.
 */
export default function RemoveSheet({
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
  const remove = useRemoveSquadMember(orgId, squad.id)
  const [reason, setReason] = useState<RemoveReason>("left")
  const [error, setError] = useState<string | null>(null)

  const reasons: { value: RemoveReason; title: string; sub: string }[] = [
    {
      value: "left",
      title: "They left the squad",
      sub: "Stays on their profile as verified, ending today. Their time here still counts.",
    },
    {
      value: "mistake",
      title: "Added by mistake",
      sub: `They were never part of this squad. ${squad.name} is taken off their profile.`,
    },
  ]

  const submit = (close: () => void) => {
    if (remove.isPending) return
    setError(null)
    remove.mutate(
      { memberId: member.id, reason },
      {
        onSuccess: () => {
          toast.show({
            title: `Removed from ${squad.name}`,
            variant: "success",
            position: "top-center",
          })
          close()
        },
        onError: (err) => setError(squadErrorSentence(err)),
      }
    )
  }

  return (
    <SquadSheet
      title={`Remove ${member.user.name}?`}
      onClose={onClose}
      footer={(close) => (
        <div className={parts.footer}>
          {error && (
            <p className={parts.error} role="alert">
              {error}
            </p>
          )}
          <Button
            variant="danger"
            fullWidth
            loading={remove.isPending}
            disabled={remove.isPending}
            onClick={() => submit(close)}
          >
            Remove
          </Button>
          <button
            type="button"
            className={parts.textButton}
            disabled={remove.isPending}
            onClick={close}
          >
            Cancel
          </button>
        </div>
      )}
    >
      {() => (
        <div className={parts.content}>
          <p className={parts.hint}>
            From {squad.name}. Tell us why, so their profile stays right.
          </p>
          <fieldset className={parts.radioList}>
            <legend className="sr-only">Why are they leaving?</legend>
            {reasons.map((option) => {
              const checked = option.value === reason
              return (
                <label
                  key={option.value}
                  className={`${parts.radioCard} ${checked ? parts.radioCardOn : ""}`}
                >
                  <input
                    type="radio"
                    name={`remove-${member.id}`}
                    value={option.value}
                    checked={checked}
                    onChange={() => setReason(option.value)}
                    disabled={remove.isPending}
                  />
                  <span className={parts.radioText}>
                    <span className={parts.radioTitle}>{option.title}</span>
                    <span className={parts.radioSub}>{option.sub}</span>
                  </span>
                </label>
              )
            })}
          </fieldset>
        </div>
      )}
    </SquadSheet>
  )
}
