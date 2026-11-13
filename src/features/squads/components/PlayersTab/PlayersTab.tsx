"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Icon } from "@iconify/react"

import { Avatar, Button } from "@/shared/components/ui"
import ConfirmDialog from "@/shared/components/ui/ConfirmDialog/ConfirmDialog"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { whenHistorySettled } from "@/shared/hooks/useBackToClose"
import { useNavigation } from "@/shared/services/navigation.service"
import { useRemoveSquadStaff, useSquadRoster } from "../../hooks/useSquads"
import { squadErrorSentence } from "../../squadErrors"
import { initialsOf, playerLine, rosterMembers } from "../../squadUtils"
import type { MemberItem, SquadDetail, StaffItem } from "../../types"
import AddStaffSheet from "../AddStaffSheet/AddStaffSheet"
import EditPlayerSheet from "../EditPlayerSheet/EditPlayerSheet"
import InviteShareCard from "../InviteShare/InviteShare"
import MoveSheet from "../MoveSheet/MoveSheet"
import PlayerActionsSheet, { type PlayerAction } from "../PlayerActionsSheet/PlayerActionsSheet"
import RemoveSheet from "../RemoveSheet/RemoveSheet"
import SquadSheet from "../SquadSheet/SquadSheet"
import styles from "./PlayersTab.module.css"

const SKELETON_ROWS = 5

function staffRoleText(staff: StaffItem): string {
  return staff.role === "other" ? staff.title || staff.role_label : staff.role_label
}

function StaffSection({
  squad,
  canManage,
  onAdd,
  onOptions,
}: {
  squad: SquadDetail
  canManage: boolean
  onAdd: () => void
  onOptions: (staff: StaffItem) => void
}) {
  const { toProfile } = useNavigation()
  if (squad.staff.length === 0 && !canManage) return null

  return (
    <section className={styles.section} aria-labelledby={`staff-${squad.id}`}>
      <div className={styles.sectionHead}>
        <h2 id={`staff-${squad.id}`} className={styles.sectionTitle}>
          Staff <span className={styles.sectionCount}>{squad.staff.length}</span>
        </h2>
        {canManage && (
          <button type="button" className={styles.headAction} onClick={onAdd}>
            <Icon icon="mdi:plus" width={18} height={18} aria-hidden="true" />
            Add staff
          </button>
        )}
      </div>

      {squad.staff.length === 0 ? (
        <p className={styles.quiet}>No staff yet.</p>
      ) : (
        <ul className={styles.list}>
          {squad.staff.map((staff) => (
            <li key={staff.id} className={styles.row}>
              <Link href={toProfile(staff.user.username, "user")} className={styles.person}>
                <Avatar
                  src={staff.user.photo || undefined}
                  initials={initialsOf(staff.user.name)}
                  size="md"
                />
                <span className={styles.personText}>
                  <span className={styles.name}>{staff.user.name}</span>
                  <span className={styles.sub}>{staffRoleText(staff)}</span>
                </span>
              </Link>
              {canManage && (
                <button
                  type="button"
                  className={styles.moreBtn}
                  onClick={() => onOptions(staff)}
                  aria-label={`Options for ${staff.user.name}`}
                >
                  <Icon icon="mdi:dots-horizontal" width={20} height={20} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function PlayerRow({
  member,
  usesNumbers,
  canReview,
  onOptions,
}: {
  member: MemberItem
  usesNumbers: boolean
  canReview: boolean
  onOptions: (member: MemberItem) => void
}) {
  const { toProfile } = useNavigation()
  const { user } = member

  return (
    <li className={`${styles.row} ${styles.playerRow}`}>
      <Link href={toProfile(user.username, "user")} className={styles.person}>
        {usesNumbers && (
          <span className={styles.jersey} aria-hidden="true">
            {member.jersey_number ?? ""}
          </span>
        )}
        <Avatar src={user.photo || undefined} initials={initialsOf(user.name)} size="md" />
        <span className={styles.personText}>
          <span className={styles.name}>
            <span className={styles.nameText}>{user.name}</span>
            {usesNumbers && member.jersey_number != null && (
              <span className="sr-only">, number {member.jersey_number}</span>
            )}
            {member.is_captain && (
              <span className={styles.captain} title="Captain">
                <span aria-hidden="true">C</span>
                <span className="sr-only">Captain</span>
              </span>
            )}
          </span>
          <span className={styles.sub}>
            {playerLine(member.position ?? member.primary_position, user.age)}
          </span>
        </span>
      </Link>
      {canReview && (
        <button
          type="button"
          className={styles.moreBtn}
          onClick={() => onOptions(member)}
          aria-label={`Options for ${user.name}`}
        >
          <Icon icon="mdi:dots-horizontal" width={20} height={20} />
        </button>
      )}
    </li>
  )
}

function SkeletonRows() {
  return (
    <ul className={styles.list} aria-hidden="true">
      {Array.from({ length: SKELETON_ROWS }).map((_, index) => (
        <li key={index} className={`${styles.row} ${styles.playerRow}`}>
          <span className={styles.skeletonAvatar} />
          <span className={styles.skeletonLines}>
            <span className={styles.skeletonLine} />
            <span className={styles.skeletonLineShort} />
          </span>
        </li>
      ))}
    </ul>
  )
}

/** The one-row menu behind a staff member's ⋯ (squads.manage). */
function StaffOptionsSheet({
  orgId,
  squad,
  staff,
  onClose,
}: {
  orgId: string
  squad: SquadDetail
  staff: StaffItem
  onClose: () => void
}) {
  const toast = useToast()
  const remove = useRemoveSquadStaff(orgId, squad.id)
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <SquadSheet title={staff.user.name} onClose={onClose}>
      {(close) => (
        <div className={styles.sheetBody}>
          <p className={styles.sheetSub}>{staffRoleText(staff)}</p>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <Button
            variant="danger"
            fullWidth
            loading={remove.isPending}
            disabled={remove.isPending}
            onClick={() => setAsking(true)}
          >
            Remove from staff
          </Button>

          <ConfirmDialog
            open={asking}
            title={`Remove ${staff.user.name} from staff?`}
            message={`They stay a member of your club. They're just no longer listed on ${squad.name}.`}
            confirmLabel="Remove"
            cancelLabel="Keep"
            tone="danger"
            onCancel={() => setAsking(false)}
            onConfirm={() => {
              setAsking(false)
              setError(null)
              remove.mutate(staff.id, {
                onSuccess: () => {
                  toast.show({
                    title: `${staff.user.name} removed from staff`,
                    variant: "success",
                    position: "top-center",
                  })
                  close()
                },
                onError: (err) => setError(squadErrorSentence(err)),
              })
            }}
          />
        </div>
      )}
    </SquadSheet>
  )
}

/**
 * The Players tab: staff first, then the roster position group by position group.
 * A squad with nobody in it shows how to fill it instead (squads.review), or one
 * quiet line for someone who can only look.
 *
 * The player sheets open one at a time: the ⋯ menu closes, and the sheet it led
 * to mounts once history has settled, so one back press never lands on a dead
 * entry left by the menu.
 */
export default function PlayersTab({
  orgId,
  squad,
  canReview,
  canManage,
  onInviteDirect,
}: {
  orgId: string
  squad: SquadDetail
  canReview: boolean
  canManage: boolean
  onInviteDirect: () => void
}) {
  const { data: roster, isLoading, isError, refetch, isRefetching } = useSquadRoster(
    orgId,
    squad.id
  )

  const [actionsFor, setActionsFor] = useState<MemberItem | null>(null)
  const [next, setNext] = useState<{ action: PlayerAction; member: MemberItem } | null>(null)
  const [addingStaff, setAddingStaff] = useState(false)
  const [staffFor, setStaffFor] = useState<StaffItem | null>(null)

  const cancelPending = useRef<(() => void) | null>(null)
  useEffect(() => () => cancelPending.current?.(), [])

  // The live row wins, so a sheet shows an edit as it lands; the snapshot keeps a
  // sheet up for a player who has just left the roster under it.
  const live = (member: MemberItem) =>
    rosterMembers(roster).find((row) => row.id === member.id) ?? member

  const usesNumbers = squad.config.uses_jersey_numbers
  const groups = (roster?.groups ?? []).filter((group) => group.members.length > 0)
  const isEmpty = squad.members_count === 0 && (!roster || roster.count === 0)

  return (
    <div className={styles.tab}>
      <StaffSection
        squad={squad}
        canManage={canManage}
        onAdd={() => setAddingStaff(true)}
        onOptions={setStaffFor}
      />

      {isEmpty ? (
        canReview && squad.invite ? (
          <InviteShareCard
            orgId={orgId}
            squad={squad}
            canManage={canManage}
            onInviteDirect={onInviteDirect}
          />
        ) : (
          <p className={styles.quietCentered}>No players yet.</p>
        )
      ) : isLoading ? (
        <SkeletonRows />
      ) : isError && !roster ? (
        <div className={styles.state}>
          <p>Couldn&apos;t load the players.</p>
          <Button variant="outline" loading={isRefetching} onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.name} className={styles.section} aria-label={group.name}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>
                {group.name} <span className={styles.sectionCount}>{group.count}</span>
              </h2>
            </div>
            <ul className={styles.list}>
              {group.members.map((member) => (
                <PlayerRow
                  key={member.id}
                  member={member}
                  usesNumbers={usesNumbers}
                  canReview={canReview}
                  onOptions={setActionsFor}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      {actionsFor && (
        <PlayerActionsSheet
          orgId={orgId}
          squad={squad}
          member={live(actionsFor)}
          onClose={() => setActionsFor(null)}
          onAction={(action) => {
            const member = live(actionsFor)
            cancelPending.current?.()
            cancelPending.current = whenHistorySettled(() => {
              cancelPending.current = null
              setNext({ action, member })
            })
          }}
        />
      )}

      {next?.action === "edit" && (
        <EditPlayerSheet
          orgId={orgId}
          squad={squad}
          member={live(next.member)}
          onClose={() => setNext(null)}
        />
      )}
      {next?.action === "move" && (
        <MoveSheet orgId={orgId} squad={squad} member={next.member} onClose={() => setNext(null)} />
      )}
      {next?.action === "remove" && (
        <RemoveSheet
          orgId={orgId}
          squad={squad}
          member={next.member}
          onClose={() => setNext(null)}
        />
      )}

      {addingStaff && (
        <AddStaffSheet orgId={orgId} squad={squad} onClose={() => setAddingStaff(false)} />
      )}
      {staffFor && (
        <StaffOptionsSheet
          orgId={orgId}
          squad={squad}
          staff={staffFor}
          onClose={() => setStaffFor(null)}
        />
      )}
    </div>
  )
}
