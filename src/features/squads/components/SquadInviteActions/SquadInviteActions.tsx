"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/shared/components/ui"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import {
  useAcceptSquadInvite,
  useDeclineSquadInvite,
  useMySquads,
} from "../../hooks/useMySquads"
import { squadErrorCode, squadErrorSentence } from "../../squadErrors"
import { publicSquadPath } from "../../squadUtils"
import styles from "./SquadInviteActions.module.css"

type Answer = "joined" | "declined" | "gone"

const GONE_CODES = new Set(["not_found", "invite_closed", "not_pending"])

/** "#9 · Striker": what the club offered with the invite, when it said. */
export function invitationOffer(jerseyNumber?: number | null, positionName?: string): string {
  return [jerseyNumber != null ? `#${jerseyNumber}` : null, positionName || null]
    .filter(Boolean)
    .join(" · ")
}

/**
 * Accept / Decline on a squad_invite notification, like OrgInviteActions.
 *
 * The notification is a snapshot from when it was sent; the invite may have been
 * answered, cancelled or expired since. GET /squads/mine is what knows, so an
 * invite that is not open on it reads as no longer available, with nothing to
 * tap that can only fail.
 */
export default function SquadInviteActions({
  memberId,
  squadId,
  squadName,
  orgUsername,
  jerseyNumber,
  positionName,
  recruitmentTitle,
  onAnswered,
}: {
  memberId: string
  squadId?: string
  squadName: string
  orgUsername?: string
  jerseyNumber?: number | null
  positionName?: string
  recruitmentTitle?: string
  onAnswered: () => void
}) {
  const router = useRouter()
  const toast = useToast()
  const { data: mine } = useMySquads()
  const accept = useAcceptSquadInvite()
  const decline = useDeclineSquadInvite()

  const [answer, setAnswer] = useState<Answer | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refused = (err: unknown) => {
    if (GONE_CODES.has(squadErrorCode(err) ?? "")) setAnswer("gone")
    else setError(squadErrorSentence(err))
  }

  const onAccept = () => {
    setError(null)
    accept.mutate(memberId, {
      onSuccess: () => {
        setAnswer("joined")
        onAnswered()
        toast.show({
          title: `You're in ${squadName}`,
          variant: "success",
          position: "top-center",
          ...(orgUsername && squadId
            ? {
                action: {
                  label: "View squad",
                  onClick: () => router.push(publicSquadPath(orgUsername, squadId)),
                },
              }
            : {}),
        })
      },
      onError: refused,
    })
  }

  const onDecline = () => {
    setError(null)
    decline.mutate(memberId, {
      onSuccess: () => {
        setAnswer("declined")
        onAnswered()
      },
      onError: refused,
    })
  }

  // Unknown until /squads/mine answers: the buttons show, and the server is the
  // backstop if the invite closed in between.
  // Open only while /squads/mine still lists it as an invite. Accepted somewhere
  // else (the invite page, another device), declined, cancelled or expired: this
  // card is no longer the place to answer it, whichever it was.
  const isOpen =
    !mine || mine.some((item) => item.id === memberId && item.status === "invited")
  const shown = answer ?? (isOpen ? null : "gone")

  if (shown === "joined") return <p className={styles.state}>You&apos;re in {squadName}</p>
  if (shown === "declined") return <p className={styles.state}>Declined</p>
  if (shown === "gone") {
    return <p className={styles.state}>This invite isn&apos;t available any more.</p>
  }

  const offer = invitationOffer(jerseyNumber, positionName)
  const busy = accept.isPending || decline.isPending

  return (
    <div className={styles.wrap}>
      {(offer || recruitmentTitle) && (
        <p className={styles.offer}>
          {offer && <span>{offer}</span>}
          {recruitmentTitle && <span>After your trial · {recruitmentTitle}</span>}
        </p>
      )}
      <div className={styles.buttons}>
        <Button size="sm" variant="brand" loading={accept.isPending} disabled={busy} onClick={onAccept}>
          Accept
        </Button>
        <Button
          size="sm"
          variant="outline"
          loading={decline.isPending}
          disabled={busy}
          onClick={onDecline}
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
