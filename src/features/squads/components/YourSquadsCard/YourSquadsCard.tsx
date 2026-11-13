"use client"

import { useState } from "react"
import Link from "next/link"

import { Button } from "@/shared/components/ui"
import ConfirmDialog from "@/shared/components/ui/ConfirmDialog/ConfirmDialog"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import {
  useAcceptSquadInvite,
  useDeclineSquadInvite,
  useLeaveSquad,
  useMySquads,
  useWithdrawSquadRequest,
} from "../../hooks/useMySquads"
import { squadErrorSentence } from "../../squadErrors"
import { publicSquadPath } from "../../squadUtils"
import type { MySquadItem } from "../../types"
import styles from "./YourSquadsCard.module.css"

const LABELS: Record<MySquadItem["status"], string> = {
  active: "In squad",
  invited: "Invited",
  pending: "Request sent",
}

function SquadRow({ item }: { item: MySquadItem }) {
  const toast = useToast()
  const accept = useAcceptSquadInvite()
  const decline = useDeclineSquadInvite()
  const withdraw = useWithdrawSquadRequest()
  const leave = useLeaveSquad()
  const [askingLeave, setAskingLeave] = useState(false)

  const busy = accept.isPending || decline.isPending || withdraw.isPending || leave.isPending
  const name = item.squad.name
  const fail = (err: unknown) =>
    toast.show({ title: squadErrorSentence(err), variant: "error", position: "top-center" })
  const done = (title: string) =>
    toast.show({ title, variant: "success", position: "top-center" })

  return (
    <li className={styles.row}>
      <span
        className={`${styles.dot} ${item.status === "active" ? styles.dotActive : styles.dotWaiting}`}
        aria-hidden="true"
      />
      <span className={styles.text}>
        <span className={styles.status}>{LABELS[item.status]}</span>
        <span aria-hidden="true"> · </span>
        <Link
          href={publicSquadPath(item.organization.username, item.squad.id)}
          className={styles.squadLink}
        >
          {name}
        </Link>
        {item.status === "active" && (
          <span className={styles.org}> · {item.organization.name}</span>
        )}
      </span>

      <span className={styles.actions}>
        {item.status === "active" && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setAskingLeave(true)}>
            Leave
          </Button>
        )}
        {item.status === "invited" && (
          <>
            <Button
              size="sm"
              variant="brand"
              loading={accept.isPending}
              disabled={busy}
              onClick={() =>
                accept.mutate(item.id, { onSuccess: () => done(`You're in ${name}`), onError: fail })
              }
            >
              Accept
            </Button>
            <Button
              size="sm"
              variant="ghost"
              loading={decline.isPending}
              disabled={busy}
              onClick={() => decline.mutate(item.id, { onError: fail })}
            >
              Decline
            </Button>
          </>
        )}
        {item.status === "pending" && (
          <Button
            size="sm"
            variant="ghost"
            loading={withdraw.isPending}
            disabled={busy}
            onClick={() =>
              withdraw.mutate(item.id, { onSuccess: () => done("Request withdrawn"), onError: fail })
            }
          >
            Withdraw
          </Button>
        )}
      </span>

      <ConfirmDialog
        open={askingLeave}
        title={`Leave ${name}?`}
        message={`${name} stays on your career, ending today.`}
        confirmLabel="Leave"
        cancelLabel="Stay"
        tone="danger"
        onCancel={() => setAskingLeave(false)}
        onConfirm={() => {
          setAskingLeave(false)
          leave.mutate(item.id, { onSuccess: () => done(`You left ${name}`), onError: fail })
        }}
      />
    </li>
  )
}

/**
 * "Your squads" on the player's own profile, under Career: the squads they are
 * in, the invites waiting for them, and the requests they have sent. Only the
 * owner sees it (UserProfile renders it for isMe), and it is not there at all
 * when there is nothing to show.
 */
export default function YourSquadsCard() {
  const { data: items } = useMySquads()
  if (!items || items.length === 0) return null

  return (
    <section className={styles.card} aria-labelledby="your-squads-title">
      <div className={styles.head}>
        <h2 id="your-squads-title" className={styles.title}>
          Your squads
        </h2>
        <span className={styles.private}>Only you see this</span>
      </div>
      <ul className={styles.list}>
        {items.map((item) => (
          <SquadRow key={item.id} item={item} />
        ))}
      </ul>
    </section>
  )
}
