"use client"

import { useState } from "react"

import { Button } from "@/shared/components/ui"
import { useAcceptInvite, useDeclineInvite, useMyInvites } from "../../hooks/useOrgMembers"
import { orgMemberErrorCode, orgMemberErrorSentence } from "../../orgMemberErrors"
import styles from "./OrgInviteActions.module.css"

type Answer = "joined" | "declined" | "gone"

const GONE_CODES = ["invite_not_pending", "not_found"]

/**
 * Accept / Decline on an org_invite notification.
 *
 * The notification is a snapshot from when it was sent, and the invite may have
 * been answered, cancelled or expired since. GET invites/mine is what knows, so an
 * invite that is not on it reads as no longer available without asking anybody to
 * tap a button that can only fail.
 */
export default function OrgInviteActions({
  inviteId,
  organizationName,
  onAnswered,
}: {
  inviteId: string
  organizationName: string
  onAnswered: () => void
}) {
  const { data: invites } = useMyInvites()
  const accept = useAcceptInvite()
  const decline = useDeclineInvite()

  const [answer, setAnswer] = useState<Answer | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refused = (err: unknown) => {
    if (GONE_CODES.includes(orgMemberErrorCode(err) ?? "")) {
      setAnswer("gone")
    } else {
      setError(orgMemberErrorSentence(err, organizationName))
    }
  }

  const answerWith = (mutation: typeof accept | typeof decline, result: Answer) => {
    setError(null)
    mutation.mutate(inviteId, {
      onSuccess: () => {
        setAnswer(result)
        onAnswered()
      },
      onError: refused,
    })
  }

  const isOpen = !invites || invites.some((invite) => invite.id === inviteId)
  const shown = answer ?? (isOpen ? null : "gone")

  if (shown === "joined") {
    return <p className={styles.state}>You joined {organizationName}</p>
  }

  if (shown === "declined") {
    return <p className={styles.state}>Declined</p>
  }

  if (shown === "gone") {
    return <p className={styles.state}>This invite is no longer available</p>
  }

  const busy = accept.isPending || decline.isPending

  return (
    <div className={styles.wrap}>
      <div className={styles.buttons}>
        <Button
          size="sm"
          variant="brand"
          loading={accept.isPending}
          disabled={busy}
          onClick={() => answerWith(accept, "joined")}
        >
          Accept
        </Button>
        <Button
          size="sm"
          variant="outline"
          loading={decline.isPending}
          disabled={busy}
          onClick={() => answerWith(decline, "declined")}
        >
          Decline
        </Button>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
