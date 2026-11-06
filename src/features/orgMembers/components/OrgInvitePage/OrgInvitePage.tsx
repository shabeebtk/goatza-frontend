"use client"

import { useCallback, useEffect, useState } from "react"
import { Icon } from "@iconify/react"

import { Avatar, Button } from "@/shared/components/ui"
import { orgRoleLabel } from "@/shared/permissions/orgPermissions"
import { authUrlWithNext } from "@/shared/services/authRedirect"
import { useAuthStore } from "@/store/auth.store"
import { useJoinedOrganization } from "../../hooks/useOrgMembers"
import { orgMemberErrorCode, orgMemberErrorSentence } from "../../orgMemberErrors"
import { acceptInviteByTokenApi, declineInviteByTokenApi } from "../../services/orgMembers.api"
import { fetchOrgInvite, type OrgInviteView } from "../../services/publicOrgInvite.api"
import styles from "./OrgInvitePage.module.css"

type LoadState =
  | { status: "loading" }
  | { status: "ready"; invite: OrgInviteView }
  | { status: "gone" }
  | { status: "failed" }

type Outcome = { kind: "joined"; organizationId: string; name: string } | { kind: "declined" }

/** The server gives one 404 for every link that does not resolve, so this is one screen. */
const GONE_SENTENCE = "This invite isn't available any more."

export default function OrgInvitePage({ token }: { token: string }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const isAuthLoading = useAuthStore((state) => state.isLoading)

  const { announce, switchTo } = useJoinedOrganization()

  const [load, setLoad] = useState<LoadState>({ status: "loading" })
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadInvite = useCallback(async () => {
    setLoad({ status: "loading" })
    try {
      const invite = await fetchOrgInvite(token)
      setLoad(invite ? { status: "ready", invite } : { status: "gone" })
    } catch {
      setLoad({ status: "failed" })
    }
  }, [token])

  useEffect(() => {
    void loadInvite()
  }, [loadInvite])

  const refused = (err: unknown, invite: OrgInviteView) => {
    const code = orgMemberErrorCode(err)

    if (code === "not_found") {
      setLoad({ status: "gone" })
    } else if (code === "email_mismatch") {
      setError(
        `This invite was sent to ${invite.email_masked}. Log in with that email to accept.`
      )
    } else {
      setError(orgMemberErrorSentence(err, invite.organization.name))
    }
  }

  const onAccept = async (invite: OrgInviteView) => {
    setBusy("accept")
    setError(null)
    try {
      const organization = await acceptInviteByTokenApi(token)
      await announce(organization)
      setOutcome({ kind: "joined", organizationId: organization.id, name: organization.name })
    } catch (err) {
      refused(err, invite)
    } finally {
      setBusy(null)
    }
  }

  const onDecline = async (invite: OrgInviteView) => {
    setBusy("decline")
    setError(null)
    try {
      await declineInviteByTokenApi(token)
      setOutcome({ kind: "declined" })
    } catch (err) {
      refused(err, invite)
    } finally {
      setBusy(null)
    }
  }

  if (outcome?.kind === "joined") {
    return (
      <Shell>
        <Icon icon="mdi:check-circle" width={40} height={40} className={styles.doneIcon} />
        <h1 className={styles.title}>You joined {outcome.name}</h1>
        <div className={styles.actions}>
          <Button variant="brand" fullWidth onClick={() => switchTo(outcome.organizationId)}>
            Switch to {outcome.name}
          </Button>
          <Button variant="ghost" fullWidth href="/home">
            Not now
          </Button>
        </div>
      </Shell>
    )
  }

  if (outcome?.kind === "declined") {
    return (
      <Shell>
        <h1 className={styles.title}>Invite declined</h1>
        <p className={styles.body}>We&apos;ll let them know you said no.</p>
      </Shell>
    )
  }

  if (load.status === "loading") {
    return (
      <Shell>
        <p className={styles.body}>Loading…</p>
      </Shell>
    )
  }

  if (load.status === "gone") {
    return (
      <Shell>
        <p className={styles.gone}>{GONE_SENTENCE}</p>
      </Shell>
    )
  }

  if (load.status === "failed") {
    return (
      <Shell>
        <p className={styles.body}>We couldn&apos;t open this invite right now.</p>
        <div className={styles.actions}>
          <Button variant="outline" fullWidth onClick={() => void loadInvite()}>
            Try again
          </Button>
        </div>
      </Shell>
    )
  }

  const { invite } = load
  const { organization } = invite
  const inviter = invite.invited_by_name || "Someone"
  const next = `/org-invite/${token}`

  return (
    <Shell>
      <Avatar
        src={organization.logo || undefined}
        initials={organization.name?.slice(0, 2).toUpperCase() || "OR"}
        size="xl"
      />
      <h1 className={styles.title}>
        {inviter} invited you to join {organization.name} on Goatza as{" "}
        {orgRoleLabel(invite.role)}
      </h1>

      {isAuthLoading ? null : isAuthenticated ? (
        <div className={styles.actions}>
          <Button
            variant="brand"
            fullWidth
            loading={busy === "accept"}
            disabled={!!busy}
            onClick={() => void onAccept(invite)}
          >
            Accept
          </Button>
          <Button
            variant="outline"
            fullWidth
            loading={busy === "decline"}
            disabled={!!busy}
            onClick={() => void onDecline(invite)}
          >
            Decline
          </Button>
        </div>
      ) : (
        <div className={styles.actions}>
          <Button variant="brand" fullWidth href={authUrlWithNext(next, "signup")}>
            Sign up
          </Button>
          <Button variant="outline" fullWidth href={authUrlWithNext(next, "login")}>
            Log in
          </Button>
        </div>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.page}>
      <div className={styles.card}>{children}</div>
    </div>
  )
}
