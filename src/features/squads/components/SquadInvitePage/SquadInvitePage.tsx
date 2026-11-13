"use client"

import { useState, type ReactNode } from "react"
import Link from "next/link"
import { Icon } from "@iconify/react"

import { Button } from "@/shared/components/ui"
import ConfirmDialog from "@/shared/components/ui/ConfirmDialog/ConfirmDialog"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { authUrlWithNext } from "@/shared/services/authRedirect"
import { profilePath } from "@/shared/services/profileUrl"
import { useAuthStore } from "@/store/auth.store"
import {
  useAcceptSquadInvite,
  useDeclineSquadInvite,
  useJoinSquad,
  useSquadInvite,
  useWithdrawSquadRequest,
} from "../../hooks/useMySquads"
import { SquadInviteReadError } from "../../services/publicSquadInvite.api"
import { squadErrorCode, squadErrorSentence } from "../../squadErrors"
import { countLabel, publicSquadPath, squadInvitePath } from "../../squadUtils"
import type { SquadInviteMe, SquadInviteView } from "../../types"
import styles from "./SquadInvitePage.module.css"

export const GONE_SENTENCE = "This invite link isn't valid any more. Ask the club for a new one."
const THROTTLED_SENTENCE = "Too many tries. Try again later."

/** A link that stopped resolving between the read and the tap. */
const GONE_CODES = new Set(["not_found", "invite_closed"])

function isThrottled(err: unknown): boolean {
  return (
    (err instanceof SquadInviteReadError && err.code === "throttled") ||
    squadErrorCode(err) === "throttled" ||
    (err as { response?: { status?: number } } | null)?.response?.status === 429
  )
}

/** The dark frame every state of the page stands in. */
function Frame({ children }: { children: ReactNode }) {
  return <div className={styles.page}>{children}</div>
}

function Wordmark() {
  return (
    <span className={styles.wordmark} aria-hidden="true">
      GOATZA
    </span>
  )
}

function Hero({ view }: { view: SquadInviteView }) {
  const { squad } = view
  return (
    <div className={styles.hero}>
      {squad.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={squad.photo_url} alt="" className={styles.heroPhoto} />
      ) : (
        <div className={styles.pitch} aria-hidden="true">
          <span className={styles.pitchHalfway} />
          <span className={styles.pitchCircle} />
          <span className={styles.pitchBoxTop} />
          <span className={styles.pitchBoxBottom} />
        </div>
      )}
      <span className={styles.heroScrim} aria-hidden="true" />
      <Wordmark />
    </div>
  )
}

function Header({ view }: { view: SquadInviteView }) {
  const { squad, organization, head_coach } = view
  const chips = [
    squad.sport.name,
    squad.level_label,
    squad.age_group,
    squad.season,
    countLabel(squad.members_count, "player", "players"),
  ].filter(Boolean)

  return (
    <div className={styles.header}>
      <div className={styles.club}>
        <span className={styles.logoRing}>
          {organization.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={organization.logo} alt="" className={styles.logo} />
          ) : (
            <span className={styles.logoInitials} aria-hidden="true">
              {organization.name.slice(0, 2).toUpperCase()}
            </span>
          )}
        </span>
        <span className={styles.clubText}>
          <span className={styles.invitedBy}>You&apos;re invited by</span>
          <span className={styles.clubName}>
            {organization.name}
            {organization.is_verified && (
              <Icon
                icon="mdi:check-decagram"
                width={18}
                height={18}
                className={styles.verified}
                aria-label="Verified"
              />
            )}
          </span>
        </span>
      </div>

      <h1 className={styles.squadName}>{squad.name}</h1>

      <ul className={styles.chips} aria-label="About this squad">
        {chips.map((chip) => (
          <li key={chip} className={styles.chip}>
            {chip}
          </li>
        ))}
      </ul>

      {head_coach && (
        <p className={styles.coach}>
          <Icon icon="mdi:whistle-outline" width={16} height={16} aria-hidden="true" />
          Head coach {head_coach.name}
        </p>
      )}
    </div>
  )
}

function Skeleton() {
  return (
    <Frame>
      <div className={styles.hero} aria-hidden="true">
        <div className={styles.pitch} />
        <Wordmark />
      </div>
      <div className={styles.header} aria-hidden="true">
        <div className={styles.club}>
          <span className={`${styles.logoRing} ${styles.skeleton}`} />
          <span className={styles.clubText}>
            <span className={`${styles.skeletonLine} ${styles.skeleton}`} />
            <span className={`${styles.skeletonLineWide} ${styles.skeleton}`} />
          </span>
        </div>
        <span className={`${styles.skeletonTitle} ${styles.skeleton}`} />
        <span className={`${styles.skeletonLineWide} ${styles.skeleton}`} />
      </div>
      <p className="sr-only" role="status">
        Loading the invite…
      </p>
    </Frame>
  )
}

function Message({
  children,
  action,
}: {
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <Frame>
      <div className={styles.message}>
        <Wordmark />
        <p className={styles.messageText}>{children}</p>
        {action}
      </div>
    </Frame>
  )
}

/** "Request sent": the same panel right after asking and on a return visit. */
function RequestSentPanel({ orgName }: { orgName: string }) {
  const username = useAuthStore((state) => state.user?.username)
  return (
    <div className={styles.donePanel}>
      <span className={styles.doneCheck} aria-hidden="true">
        <Icon icon="mdi:check" width={28} height={28} />
      </span>
      <p className={styles.doneTitle}>Request sent</p>
      <p className={styles.doneText}>We&apos;ll let you know when {orgName} approves you.</p>
      {username && (
        <Button
          variant="outline"
          fullWidth
          className={styles.darkOutline}
          href={profilePath(username, "user")}
        >
          Go to my profile
        </Button>
      )}
    </div>
  )
}

/**
 * The squad's invite link, as a player opens it from the club's group chat:
 * always dark, the squad's photo, the club that sent it, and one clear next step
 * for whoever is looking. Anonymous it reads with no session at all; signed in
 * it asks AS THE PERSON, so `me` is about them even while they act as a club.
 * Every link that does not resolve is the same one screen.
 */
export default function SquadInvitePage({ token }: { token: string }) {
  const toast = useToast()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const isAuthLoading = useAuthStore((state) => state.isLoading)

  const invite = useSquadInvite(token, isAuthenticated, !isAuthLoading)
  const join = useJoinSquad(token)
  const accept = useAcceptSquadInvite()
  const decline = useDeclineSquadInvite()
  const withdraw = useWithdrawSquadRequest()

  // What the last answer here made of `me`, until the refetch it triggered says so too.
  const [meOverride, setMeOverride] = useState<SquadInviteMe | null>(null)
  const [declined, setDeclined] = useState(false)
  const [gone, setGone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [askingWithdraw, setAskingWithdraw] = useState(false)

  const busy = join.isPending || accept.isPending || decline.isPending || withdraw.isPending
  const path = squadInvitePath(token)

  if (isAuthLoading || invite.isLoading) return <Skeleton />

  if (gone || (invite.isSuccess && invite.data === null)) {
    return (
      <Message
        action={
          <Button variant="brand" fullWidth href={isAuthenticated ? "/home" : "/"}>
            Go to Goatza
          </Button>
        }
      >
        {GONE_SENTENCE}
      </Message>
    )
  }

  if (invite.isError || !invite.data) {
    return (
      <Message
        action={
          <Button
            variant="outline"
            fullWidth
            className={styles.darkOutline}
            loading={invite.isFetching}
            onClick={() => invite.refetch()}
          >
            Try again
          </Button>
        }
      >
        {isThrottled(invite.error) ? THROTTLED_SENTENCE : "We couldn't open this invite right now."}
      </Message>
    )
  }

  const view = invite.data
  const me = meOverride ?? view.me
  const { squad, organization } = view

  const refused = (err: unknown) => {
    const code = squadErrorCode(err)
    if (code && GONE_CODES.has(code)) setGone(true)
    else if (code === "already_member") void invite.refetch()
    else setError(isThrottled(err) ? THROTTLED_SENTENCE : squadErrorSentence(err))
  }

  const youreIn = () =>
    toast.show({ title: `You're in ${squad.name}`, variant: "success", position: "top-center" })

  const onJoin = () => {
    if (busy) return
    setError(null)
    join.mutate(undefined, {
      onSuccess: (result) => {
        setDeclined(false)
        setMeOverride({ state: result.state, member_id: result.member_id, can_join: false, reason: null })
        if (result.state === "active") youreIn()
      },
      onError: refused,
    })
  }

  const onAccept = (memberId: string) => {
    if (busy) return
    setError(null)
    accept.mutate(memberId, {
      onSuccess: () => {
        setMeOverride({ state: "active", member_id: memberId, can_join: false, reason: null })
        youreIn()
      },
      onError: refused,
    })
  }

  const onDecline = (memberId: string) => {
    if (busy) return
    setError(null)
    decline.mutate(memberId, {
      onSuccess: () => {
        setDeclined(true)
        setMeOverride({ state: "none", member_id: null, can_join: true, reason: null })
      },
      onError: refused,
    })
  }

  const onWithdraw = (memberId: string) => {
    setError(null)
    withdraw.mutate(memberId, {
      onSuccess: () =>
        setMeOverride({ state: "none", member_id: null, can_join: true, reason: null }),
      onError: refused,
    })
  }

  let actions: ReactNode
  if (!me) {
    actions = (
      <>
        <p className={styles.lede}>
          The club approves every request. Once you&apos;re in, {squad.name} shows on your
          profile as verified.
        </p>
        <Button variant="brand" fullWidth href={authUrlWithNext(path, "signup")}>
          Sign up to join
        </Button>
        <Link className={styles.textAction} href={authUrlWithNext(path, "login")}>
          I have an account
        </Link>
      </>
    )
  } else if (me.reason === "not_a_player") {
    actions = <p className={styles.neutral}>Only player accounts can join squads.</p>
  } else if (me.state === "active") {
    actions = (
      <div className={styles.donePanel}>
        <span className={styles.doneCheck} aria-hidden="true">
          <Icon icon="mdi:shield-check" width={28} height={28} />
        </span>
        <p className={styles.doneTitle}>You&apos;re in this squad</p>
        <Button variant="brand" fullWidth href={publicSquadPath(organization.username, squad.id)}>
          View squad
        </Button>
      </div>
    )
  } else if (me.state === "pending" && me.member_id) {
    const memberId = me.member_id
    actions = (
      <>
        <RequestSentPanel orgName={organization.name} />
        <button
          type="button"
          className={styles.textAction}
          disabled={busy}
          onClick={() => setAskingWithdraw(true)}
        >
          {withdraw.isPending ? "Withdrawing…" : "Withdraw request"}
        </button>
        <ConfirmDialog
          open={askingWithdraw}
          title="Withdraw your request?"
          message={`${organization.name} won't see it any more. You can ask again with the same link.`}
          confirmLabel="Withdraw"
          cancelLabel="Keep"
          tone="danger"
          onCancel={() => setAskingWithdraw(false)}
          onConfirm={() => {
            setAskingWithdraw(false)
            onWithdraw(memberId)
          }}
        />
      </>
    )
  } else if (me.state === "invited" && me.member_id) {
    const memberId = me.member_id
    actions = (
      <>
        <p className={styles.lede}>{organization.name} invited you</p>
        <Button
          variant="brand"
          fullWidth
          loading={accept.isPending}
          disabled={busy}
          onClick={() => onAccept(memberId)}
        >
          Accept invite
        </Button>
        <button
          type="button"
          className={styles.textAction}
          disabled={busy}
          onClick={() => onDecline(memberId)}
        >
          {decline.isPending ? "Declining…" : "Decline"}
        </button>
      </>
    )
  } else if (me.state === "none" && me.can_join) {
    actions = (
      <>
        {declined && <p className={styles.neutral}>Invite declined.</p>}
        <p className={styles.lede}>
          The club approves every request. Once you&apos;re in, {squad.name} shows on your
          profile as verified.
        </p>
        <Button
          variant="brand"
          fullWidth
          loading={join.isPending}
          disabled={busy}
          onClick={onJoin}
        >
          Ask to join
        </Button>
      </>
    )
  } else if (me.reason === "switch_to_personal") {
    actions = <p className={styles.neutral}>Switch to your personal account to join this squad.</p>
  } else {
    actions = <p className={styles.neutral}>You can&apos;t join this squad right now.</p>
  }

  return (
    <Frame>
      <Hero view={view} />
      <Header view={view} />
      <div className={styles.actions}>
        {actions}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>
    </Frame>
  )
}
