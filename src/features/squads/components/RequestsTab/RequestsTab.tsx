"use client"

import { useMemo, useState } from "react"
import { Icon } from "@iconify/react"
import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"

import { Avatar, Button } from "@/shared/components/ui"
import ConfirmDialog from "@/shared/components/ui/ConfirmDialog/ConfirmDialog"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import {
  useApproveSquadRequests,
  useCancelSquadInvite,
  useDeclineSquadRequests,
  useSquadRequests,
} from "../../hooks/useSquads"
import { squadErrorSentence, squadFailureSentence } from "../../squadErrors"
import { countLabel, initialsOf, playerLine } from "../../squadUtils"
import type { InviteItem, RequestItem, SquadDetail } from "../../types"
import ApproveSheet from "../ApproveSheet/ApproveSheet"
import styles from "./RequestsTab.module.css"

dayjs.extend(relativeTime)

/** "expires in 12 days" / "expires today". */
function expiresIn(expiresAt: string): string {
  const days = Math.max(dayjs(expiresAt).diff(dayjs(), "day"), 0)
  if (days === 0) return "expires today"
  return days === 1 ? "expires in 1 day" : `expires in ${days} days`
}

/** What the club offered with the invite: "Striker · #9". */
function offered(invite: InviteItem): string {
  return [invite.position?.name, invite.jersey_number != null ? `#${invite.jersey_number}` : null]
    .filter(Boolean)
    .join(" · ")
}

function RequestCard({
  request,
  selected,
  onToggle,
  onOpen,
}: {
  request: RequestItem
  selected: boolean
  onToggle: () => void
  onOpen: () => void
}) {
  const { user } = request
  const checkboxId = `request-${request.id}`

  return (
    <li className={`${styles.card} ${selected ? styles.cardSelected : ""}`}>
      <label className={styles.cardMain} htmlFor={checkboxId}>
        <input
          id={checkboxId}
          type="checkbox"
          className={styles.checkbox}
          checked={selected}
          onChange={onToggle}
        />
        <Avatar src={user.photo || undefined} initials={initialsOf(user.name)} size="md" />
        <span className={styles.cardText}>
          <span className={styles.cardName}>{user.name}</span>
          <span className={styles.cardSub}>{playerLine(request.primary_position, user.age)}</span>
          <span className={styles.timeChip}>{dayjs(request.requested_at).fromNow()}</span>
        </span>
      </label>
      <button
        type="button"
        className={styles.openBtn}
        onClick={onOpen}
        aria-label={`Review ${user.name}'s request`}
      >
        <Icon icon="mdi:chevron-right" width={22} height={22} />
      </button>
    </li>
  )
}

function InvitesList({
  orgId,
  squad,
  invites,
}: {
  orgId: string
  squad: SquadDetail
  invites: InviteItem[]
}) {
  const toast = useToast()
  const cancel = useCancelSquadInvite(orgId, squad.id)
  const [open, setOpen] = useState(false)
  const [cancelling, setCancelling] = useState<InviteItem | null>(null)

  return (
    <section className={styles.invites}>
      <button
        type="button"
        className={styles.invitesToggle}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>
          {countLabel(invites.length, "player", "players")} you invited{" "}
          {invites.length === 1 ? "hasn't" : "haven't"} answered yet
        </span>
        <span className={styles.invitesSee}>
          {open ? "Hide" : "See"}
          <Icon icon={open ? "mdi:chevron-up" : "mdi:chevron-down"} width={18} height={18} aria-hidden="true" />
        </span>
      </button>

      {open && (
        <ul className={styles.inviteList}>
          {invites.map((invite) => {
            const offer = offered(invite)
            const cancellingThis = cancel.isPending && cancel.variables === invite.id
            return (
              <li key={invite.id} className={styles.inviteRow}>
                <Avatar
                  src={invite.user.photo || undefined}
                  initials={initialsOf(invite.user.name)}
                  size="md"
                />
                <span className={styles.cardText}>
                  <span className={styles.cardName}>{invite.user.name}</span>
                  <span className={styles.cardSub}>
                    Invited {dayjs(invite.requested_at).fromNow()} · {expiresIn(invite.expires_at)}
                  </span>
                  {offer && <span className={styles.cardSub}>{offer}</span>}
                  {invite.recruitment && (
                    <span className={styles.cardSub}>From {invite.recruitment.title}</span>
                  )}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={cancellingThis}
                  disabled={cancel.isPending}
                  onClick={() => setCancelling(invite)}
                >
                  Cancel
                </Button>
              </li>
            )
          })}
        </ul>
      )}

      <ConfirmDialog
        open={!!cancelling}
        title="Cancel this invite?"
        message={`${cancelling?.user.name ?? "They"} won't be able to join with it.`}
        confirmLabel="Cancel invite"
        cancelLabel="Keep"
        tone="danger"
        onCancel={() => setCancelling(null)}
        onConfirm={() => {
          const invite = cancelling
          setCancelling(null)
          if (!invite) return
          cancel.mutate(invite.id, {
            onSuccess: () =>
              toast.show({ title: "Invite cancelled", variant: "success", position: "top-center" }),
            onError: (err) =>
              toast.show({ title: squadErrorSentence(err), variant: "error", position: "top-center" }),
          })
        }}
      />
    </section>
  )
}

/**
 * The Requests tab (squads.review): people who asked to join through the invite
 * link. Nothing is selected to begin with — approving puts someone on their
 * profile as verified, which should be a choice and not a default. A batch can
 * half-land: whoever the server refused stays selected, and a toast says why.
 */
export default function RequestsTab({
  orgId,
  squad,
  onShareLink,
}: {
  orgId: string
  squad: SquadDetail
  onShareLink: () => void
}) {
  const toast = useToast()
  const { data, isLoading, isError, refetch, isRefetching } = useSquadRequests(orgId, squad.id)
  const approve = useApproveSquadRequests(orgId, squad.id)
  const decline = useDeclineSquadRequests(orgId, squad.id)

  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [reviewing, setReviewing] = useState<RequestItem | null>(null)
  const [askingDecline, setAskingDecline] = useState(false)

  const requests = useMemo(() => data?.requests ?? [], [data])
  const invites = useMemo(() => data?.invites ?? [], [data])

  // Only what is still on screen counts: a request answered elsewhere drops out
  // of the selection with its row.
  const chosen = useMemo(
    () => requests.filter((request) => selected.has(request.id)).map((request) => request.id),
    [requests, selected]
  )
  const allSelected = requests.length > 0 && chosen.length === requests.length
  const busy = approve.isPending || decline.isPending
  const nouns = {
    memberNoun: squad.config.member_noun,
    memberNounPlural: squad.config.member_noun_plural,
  }

  const toggle = (id: string) =>
    setSelected((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const approveSelected = () => {
    if (busy || chosen.length === 0) return
    approve.mutate(
      chosen.map((member_id) => ({ member_id })),
      {
        onSuccess: (result) => {
          if (result.approved.length > 0) {
            toast.show({
              title: `${countLabel(result.approved.length, "player", "players")} added`,
              variant: "success",
              position: "top-center",
            })
          }
          const failed = result.failed
          setSelected(new Set(failed.map((failure) => failure.member_id)))
          if (failed[0]) {
            toast.show({
              title:
                failed.length === 1
                  ? "1 request couldn't be approved"
                  : `${failed.length} requests couldn't be approved`,
              message: squadFailureSentence(failed[0], nouns),
              variant: "warning",
              position: "top-center",
            })
          }
        },
        onError: (err) =>
          toast.show({ title: squadErrorSentence(err, nouns), variant: "error", position: "top-center" }),
      }
    )
  }

  const declineSelected = () => {
    if (busy || chosen.length === 0) return
    decline.mutate(chosen, {
      onSuccess: (result) => {
        if (result.declined.length > 0) {
          toast.show({
            title:
              result.declined.length === 1
                ? "1 request declined"
                : `${result.declined.length} requests declined`,
            variant: "success",
            position: "top-center",
          })
        }
        setSelected(new Set(result.failed.map((failure) => failure.member_id)))
        if (result.failed[0]) {
          toast.show({
            title: squadFailureSentence(result.failed[0], nouns),
            variant: "warning",
            position: "top-center",
          })
        }
      },
      onError: (err) =>
        toast.show({ title: squadErrorSentence(err, nouns), variant: "error", position: "top-center" }),
    })
  }

  if (isLoading) {
    return (
      <ul className={styles.list} aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <li key={index} className={styles.skeletonCard} />
        ))}
      </ul>
    )
  }

  if (isError && !data) {
    return (
      <div className={styles.state}>
        <p>Couldn&apos;t load requests.</p>
        <Button variant="outline" loading={isRefetching} onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    )
  }

  const reviewingLive = reviewing && requests.find((request) => request.id === reviewing.id)

  return (
    <div className={styles.tab}>
      {requests.length === 0 && invites.length === 0 ? (
        <div className={styles.empty}>
          <p>No requests right now.</p>
          {squad.invite && (
            <button type="button" className={styles.textAction} onClick={onShareLink}>
              Share invite link
            </button>
          )}
        </div>
      ) : null}

      {requests.length > 0 && (
        <>
          <label className={styles.selectAll}>
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={allSelected}
              ref={(input) => {
                if (input) input.indeterminate = chosen.length > 0 && !allSelected
              }}
              onChange={() =>
                setSelected(allSelected ? new Set() : new Set(requests.map((request) => request.id)))
              }
              disabled={busy}
            />
            <span className={styles.cardText}>
              <span className={styles.cardName}>Select all</span>
              <span className={styles.cardSub}>Asked through your invite link</span>
            </span>
          </label>

          <ul className={styles.list}>
            {requests.map((request) => (
              <RequestCard
                key={request.id}
                request={request}
                selected={selected.has(request.id)}
                onToggle={() => toggle(request.id)}
                onOpen={() => setReviewing(request)}
              />
            ))}
          </ul>
        </>
      )}

      {invites.length > 0 && <InvitesList orgId={orgId} squad={squad} invites={invites} />}

      {requests.length > 0 && (
        <div className={styles.footer}>
          <p className={styles.footerHint}>
            Positions come from their profiles. Add shirt numbers after.
          </p>
          <div className={styles.footerActions}>
            <Button
              variant="outline"
              disabled={chosen.length === 0 || busy}
              loading={decline.isPending}
              onClick={() => setAskingDecline(true)}
            >
              Decline
            </Button>
            <Button
              variant="brand"
              className={styles.approveBtn}
              disabled={chosen.length === 0 || busy}
              loading={approve.isPending}
              onClick={approveSelected}
            >
              {chosen.length > 0 ? `Approve ${chosen.length}` : "Approve"}
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={askingDecline}
        title={chosen.length === 1 ? "Decline 1 request?" : `Decline ${chosen.length} requests?`}
        message="They won't be told why."
        confirmLabel="Decline"
        cancelLabel="Keep"
        tone="danger"
        onCancel={() => setAskingDecline(false)}
        onConfirm={() => {
          setAskingDecline(false)
          declineSelected()
        }}
      />

      {reviewing && (
        <ApproveSheet
          orgId={orgId}
          squad={squad}
          request={reviewingLive ?? reviewing}
          // An answered request leaves the list, and `chosen` only counts rows
          // still in it, so nothing needs unselecting here.
          onClose={() => setReviewing(null)}
        />
      )}
    </div>
  )
}
