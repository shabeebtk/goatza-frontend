"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { Avatar, Button } from "@/shared/components/ui"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { keepFocusProps } from "@/shared/hooks/keepFocus"
import { navigateAwayFromOverlays } from "@/shared/hooks/useBackToClose"
import { useNavigation } from "@/shared/services/navigation.service"
import { settleViewport } from "@/shared/utils/settleViewport"
import { useOrgName } from "../../hooks/useSquadPermissions"
import {
  useApproveSquadRequests,
  useDeclineSquadRequests,
  useSquadRoster,
} from "../../hooks/useSquads"
import { squadErrorSentence, squadFailureSentence } from "../../squadErrors"
import { captainOf, initialsOf, playerLine } from "../../squadUtils"
import type { RequestItem, SquadDetail } from "../../types"
import parts from "../sheetParts.module.css"
import SquadPlacementFields, {
  initialPlacement,
  placementBody,
  type PlacementValue,
} from "../SquadPlacementFields/SquadPlacementFields"
import SquadSheet from "../SquadSheet/SquadSheet"
import SquadSwitch from "../SquadSwitch/SquadSwitch"

/**
 * One request, answered with care: where they play, their number, whether they
 * captain. Approving puts them straight in the squad and on their profile as a
 * verified stint, which the note says before the button does it.
 */
export default function ApproveSheet({
  orgId,
  squad,
  request,
  onClose,
}: {
  orgId: string
  squad: SquadDetail
  request: RequestItem
  onClose: () => void
}) {
  const toast = useToast()
  const router = useRouter()
  const { toProfile } = useNavigation()
  const orgName = useOrgName(orgId)
  const { data: roster } = useSquadRoster(orgId, squad.id)
  const approve = useApproveSquadRequests(orgId, squad.id)
  const decline = useDeclineSquadRequests(orgId, squad.id)

  const { user } = request
  const [placement, setPlacement] = useState<PlacementValue>(() =>
    initialPlacement(squad.config, request.primary_position?.id)
  )
  const [isCaptain, setIsCaptain] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [jerseyError, setJerseyError] = useState<string | undefined>()

  const nouns = {
    memberNoun: squad.config.member_noun,
    memberNounPlural: squad.config.member_noun_plural,
  }
  const busy = approve.isPending || decline.isPending
  const captain = captainOf(squad.captain_member_id, roster)
  const captainHint = captain
    ? `Now: ${captain.user.name}${captain.jersey_number != null ? ` (#${captain.jersey_number})` : ""}`
    : undefined

  const submit = (close: () => void) => {
    if (busy) return
    const body = placementBody(squad.config, placement)
    if (body.invalid) {
      setJerseyError("Shirt numbers go from 0 to 99.")
      return
    }
    setError(null)
    setJerseyError(undefined)

    approve.mutate([{ member_id: request.id, ...body.fields, is_captain: isCaptain }], {
      onSuccess: (result) => {
        const failure = result.failed[0]
        if (failure) {
          const sentence = squadFailureSentence(failure, nouns)
          if (failure.code === "jersey_taken" || failure.code === "invalid_jersey") {
            setJerseyError(sentence)
          } else {
            setError(sentence)
          }
          return
        }
        toast.show({ title: `${user.name} added`, variant: "success", position: "top-center" })
        void settleViewport()
        close()
      },
      onError: (err) => setError(squadErrorSentence(err, nouns)),
    })
  }

  const refuse = (close: () => void) => {
    if (busy) return
    setError(null)
    decline.mutate([request.id], {
      onSuccess: (result) => {
        const failure = result.failed[0]
        if (failure) {
          setError(squadFailureSentence(failure, nouns))
          return
        }
        toast.show({ title: "Request declined", variant: "success", position: "top-center" })
        void settleViewport()
        close()
      },
      onError: (err) => setError(squadErrorSentence(err, nouns)),
    })
  }

  const profileHref = toProfile(user.username, "user")

  return (
    <SquadSheet
      title={`Add to ${squad.name}`}
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
            loading={approve.isPending}
            disabled={busy}
            onClick={() => submit(close)}
            {...keepFocusProps}
          >
            Approve
          </Button>
          <button
            type="button"
            className={`${parts.textButton} ${parts.dangerText}`}
            disabled={busy}
            onClick={() => refuse(close)}
          >
            {decline.isPending ? "Declining…" : "Decline request"}
          </button>
        </div>
      )}
    >
      {() => (
        <div className={parts.content}>
          <div className={parts.person}>
            <Avatar src={user.photo || undefined} initials={initialsOf(user.name)} size="lg" />
            <span className={parts.personText}>
              <span className={parts.personName}>{user.name}</span>
              <span className={parts.personSub}>
                {playerLine(request.primary_position, user.age)}
              </span>
            </span>
            <Link
              href={profileHref}
              className={parts.profileLink}
              // Leaving the page: take this sheet's history entry with it.
              onClick={(event) => {
                event.preventDefault()
                navigateAwayFromOverlays(profileHref, router)
              }}
            >
              Profile
            </Link>
          </div>

          <SquadPlacementFields
            config={squad.config}
            roster={roster}
            value={placement}
            onChange={(next) => {
              setPlacement(next)
              if (jerseyError) setJerseyError(undefined)
            }}
            profilePositionId={request.primary_position?.id}
            jerseyError={jerseyError}
            disabled={busy}
          />

          <SquadSwitch
            label="Make captain"
            hint={captainHint}
            checked={isCaptain}
            onChange={setIsCaptain}
            disabled={busy}
          />

          <p className={parts.note}>
            Their profile will show {orgName} · {squad.name} as verified.
          </p>
        </div>
      )}
    </SquadSheet>
  )
}
