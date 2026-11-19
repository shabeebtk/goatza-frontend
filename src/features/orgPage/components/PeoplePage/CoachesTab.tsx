"use client"

import { useState } from "react"
import { Icon } from "@iconify/react"

import Avatar from "@/shared/components/ui/Avatar/Avatar"
import Button from "@/shared/components/ui/Button/Button"
import { MAX_COACHES, useCoaches, useReorderCoaches, useUpdateCoach } from "../../hooks/usePeople"
import { moveId } from "../../hooks/reorder"
import type { Coach } from "../../types"
import PageSwitch from "../PageSwitch/PageSwitch"
import ReorderButtons from "../ReorderButtons/ReorderButtons"
import AddMemberCoachSheet from "./AddMemberCoachSheet"
import CoachFormSheet from "./CoachFormSheet"
import EditCoachSheet from "./EditCoachSheet"
import { coachLine, initialsOf } from "./coachFields"
import styles from "./PeoplePage.module.css"

// The coach is kept as it was opened: the sheet stays up (and closes itself, consuming
// its history entry) even when a write takes the coach off the list underneath it.
type Open = { kind: "add-member" } | { kind: "add-other" } | { kind: "edit"; coach: Coach } | null

/**
 * Who appears under Coaches: the page's members or coaches who aren't on Goatza,
 * in the club's order, each with its own visibility switch.
 */
export default function CoachesTab({ orgId }: { orgId: string }) {
  const { data, isLoading, isError, refetch, isRefetching } = useCoaches(orgId)
  const reorder = useReorderCoaches(orgId)
  const update = useUpdateCoach(orgId)
  const [open, setOpen] = useState<Open>(null)

  const coaches = data?.coaches ?? []
  const candidates = data?.candidates ?? []
  const full = coaches.length >= MAX_COACHES
  const editing =
    open?.kind === "edit" ? (coaches.find((coach) => coach.id === open.coach.id) ?? open.coach) : undefined

  const move = (coach: Coach, delta: -1 | 1) => {
    const ids = moveId(
      coaches.map((item) => item.id),
      coach.id,
      delta
    )
    if (ids) reorder.mutate(ids)
  }

  const addButtons = (
    <div className={styles.addRow}>
      <Button
        variant="outline"
        disabled={full}
        leftIcon={<Icon icon="mdi:account-plus-outline" width={18} height={18} />}
        onClick={() => setOpen({ kind: "add-member" })}
      >
        Add from members
      </Button>
      <Button
        variant="outline"
        disabled={full}
        leftIcon={<Icon icon="mdi:plus" width={18} height={18} />}
        onClick={() => setOpen({ kind: "add-other" })}
      >
        Add a coach who isn&apos;t on Goatza
      </Button>
    </div>
  )

  if (isLoading) {
    return (
      <div className={styles.skeleton} aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <span key={index} style={{ height: 76 }} />
        ))}
      </div>
    )
  }

  if (isError && !data) {
    return (
      <div className={styles.state} role="alert">
        <p>Couldn&apos;t load your coaches.</p>
        <Button variant="outline" loading={isRefetching} onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    )
  }

  return (
    <div className={styles.tab}>
      <p className={styles.intro}>
        Pick who appears under Coaches. Add people from your page&apos;s members, or a coach who isn&apos;t
        on Goatza.
      </p>

      {coaches.length === 0 ? (
        <div className={styles.empty}>
          <p>No coaches on your page yet.</p>
          {addButtons}
        </div>
      ) : (
        <>
          <ul className={styles.rows}>
            {coaches.map((coach, index) => (
              <li key={coach.id} className={`${styles.row} ${coach.is_visible ? "" : styles.rowHidden}`}>
                <button
                  type="button"
                  className={styles.rowMain}
                  onClick={() => setOpen({ kind: "edit", coach })}
                  aria-label={`Edit ${coach.name}`}
                >
                  <Avatar src={coach.photo || undefined} initials={initialsOf(coach.name)} size="md" />
                  <span className={styles.rowText}>
                    <span className={styles.rowName}>{coach.name}</span>
                    <span className={styles.rowLine}>{coachLine(coach)}</span>
                    {!coach.is_visible && <span className={styles.hiddenTag}>Hidden</span>}
                  </span>
                </button>
                <span className={styles.rowControls}>
                  <PageSwitch
                    label={`Show ${coach.name}`}
                    checked={coach.is_visible}
                    onChange={(next) => update.mutate({ coachId: coach.id, payload: { is_visible: next } })}
                  />
                  <ReorderButtons
                    name={coach.name}
                    isFirst={index === 0}
                    isLast={index === coaches.length - 1}
                    disabled={reorder.isPending}
                    onMove={(delta) => move(coach, delta)}
                  />
                </span>
              </li>
            ))}
          </ul>
          {full ? <p className={styles.hint}>You can add up to {MAX_COACHES} coaches.</p> : addButtons}
        </>
      )}

      {open?.kind === "add-member" && (
        <AddMemberCoachSheet orgId={orgId} candidates={candidates} onClose={() => setOpen(null)} />
      )}
      {open?.kind === "add-other" && <CoachFormSheet orgId={orgId} onClose={() => setOpen(null)} />}
      {open?.kind === "edit" && editing && (
        <EditCoachSheet orgId={orgId} coach={editing} onClose={() => setOpen(null)} />
      )}
    </div>
  )
}
