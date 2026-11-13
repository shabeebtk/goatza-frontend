"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Icon } from "@iconify/react"
import dayjs from "dayjs"

import { Avatar } from "@/shared/components/ui"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { navigateAwayFromOverlays } from "@/shared/hooks/useBackToClose"
import { useNavigation } from "@/shared/services/navigation.service"
import { useSquads, useUpdateSquadMember } from "../../hooks/useSquads"
import { squadErrorSentence } from "../../squadErrors"
import { initialsOf } from "../../squadUtils"
import type { MemberItem, SquadDetail } from "../../types"
import parts from "../sheetParts.module.css"
import SquadSheet from "../SquadSheet/SquadSheet"
import styles from "./PlayerActionsSheet.module.css"

export type PlayerAction = "edit" | "move" | "remove"

/** "#2 · Right-back · Joined Jun 2026", with only the parts the squad has. */
export function playerSummary(member: MemberItem, usesNumbers: boolean): string {
  return [
    usesNumbers && member.jersey_number != null ? `#${member.jersey_number}` : null,
    member.position?.name ?? member.primary_position?.name ?? "No position",
    member.joined_at ? `Joined ${dayjs(member.joined_at).format("MMM YYYY")}` : null,
  ]
    .filter(Boolean)
    .join(" · ")
}

/**
 * The ⋯ on a player's row (squads.review). Captaincy is answered here; the rest
 * open their own sheet, which the Players tab mounts once this one has closed.
 */
export default function PlayerActionsSheet({
  orgId,
  squad,
  member,
  onClose,
  onAction,
}: {
  orgId: string
  squad: SquadDetail
  member: MemberItem
  onClose: () => void
  /** Called right after this sheet starts closing. */
  onAction: (action: PlayerAction) => void
}) {
  const toast = useToast()
  const router = useRouter()
  const { toProfile } = useNavigation()
  const update = useUpdateSquadMember(orgId, squad.id)
  const { data: sameSport } = useSquads(orgId, { sportId: squad.sport.id })
  const [error, setError] = useState<string | null>(null)

  const { user } = member
  const usesNumbers = squad.config.uses_jersey_numbers
  const canMove = (sameSport ?? []).some((other) => other.id !== squad.id)

  const toggleCaptain = (close: () => void) => {
    if (update.isPending) return
    const next = !member.is_captain
    setError(null)
    update.mutate(
      { memberId: member.id, payload: { is_captain: next } },
      {
        onSuccess: () => {
          toast.show({
            title: next ? `${user.name} is captain` : "Captain removed",
            variant: "success",
            position: "top-center",
          })
          close()
        },
        onError: (err) => setError(squadErrorSentence(err)),
      }
    )
  }

  const profileHref = toProfile(user.username, "user")

  return (
    <SquadSheet title="Player options" onClose={onClose}>
      {(close) => {
        const open = (action: PlayerAction) => {
          close()
          onAction(action)
        }

        return (
          <div className={parts.content}>
            <div className={styles.header}>
              <Avatar src={user.photo || undefined} initials={initialsOf(user.name)} size="lg" />
              <span className={parts.personText}>
                <span className={parts.personName}>{user.name}</span>
                <span className={parts.personSub}>{playerSummary(member, usesNumbers)}</span>
              </span>
              {usesNumbers && member.jersey_number != null && (
                <span className={styles.bigNumber} aria-hidden="true">
                  {member.jersey_number}
                </span>
              )}
            </div>

            {error && (
              <p className={parts.error} role="alert">
                {error}
              </p>
            )}

            <ul className={styles.rows}>
              <li>
                <button type="button" className={styles.row} onClick={() => open("edit")}>
                  <Icon icon="mdi:pencil-outline" width={20} height={20} aria-hidden="true" />
                  {squad.config.uses_jersey_numbers && squad.config.uses_positions
                    ? "Edit position & shirt number"
                    : squad.config.uses_jersey_numbers
                      ? "Edit shirt number & notes"
                      : "Edit position & notes"}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className={styles.row}
                  disabled={update.isPending}
                  onClick={() => toggleCaptain(close)}
                >
                  <Icon
                    icon={member.is_captain ? "mdi:alpha-c-circle-outline" : "mdi:alpha-c-circle"}
                    width={20}
                    height={20}
                    aria-hidden="true"
                  />
                  {member.is_captain ? "Remove as captain" : "Make captain"}
                </button>
              </li>
              {canMove && (
                <li>
                  <button type="button" className={styles.row} onClick={() => open("move")}>
                    <Icon icon="mdi:swap-horizontal" width={20} height={20} aria-hidden="true" />
                    Move to another squad
                  </button>
                </li>
              )}
              <li>
                <button
                  type="button"
                  className={styles.row}
                  onClick={() => navigateAwayFromOverlays(profileHref, router)}
                >
                  <Icon icon="mdi:account-outline" width={20} height={20} aria-hidden="true" />
                  View profile
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className={`${styles.row} ${styles.danger}`}
                  onClick={() => open("remove")}
                >
                  <Icon icon="mdi:account-remove-outline" width={20} height={20} aria-hidden="true" />
                  Remove from squad
                </button>
              </li>
            </ul>
          </div>
        )
      }}
    </SquadSheet>
  )
}
