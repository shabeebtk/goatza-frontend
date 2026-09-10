"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Icon } from "@iconify/react"

import { Button } from "@/shared/components/ui"

import {
  approveGuardianConsent,
  declineGuardianConsent,
  fetchGuardianConsent,
  withdrawGuardianConsent,
} from "../../services/publicConsent.api"
import type { GuardianApprovalPayload, GuardianConsentView } from "../../types"
import GuardianDataList from "../GuardianDataList/GuardianDataList"
import ParentApprovalForm from "../ParentApprovalForm/ParentApprovalForm"
import styles from "./PublicConsentPage.module.css"

/**
 * The page a parent opens from an email. No login, no account, no app.
 *
 * WHO IS READING THIS. Somebody who did not ask for it, on a phone, probably
 * standing up, who has never heard of us and was sent here by a fourteen-year-
 * old. They are not going to install anything, create anything, or read two
 * screens before finding the button. So: one column, one card, three facts, two
 * buttons, and no path anywhere else on the site except the report link at the
 * bottom.
 *
 * WHAT AN EXPIRED OR INVALID TOKEN SHOWS. Nothing. Not the child's username,
 * not that a child exists, not whether the link ever did — one sentence that
 * reads identically for a typo, a used link and an expired one. A link that is
 * forwarded, guessed or found in a browser history months later must not be a
 * way to learn that a particular young person has an account here. The server
 * enforces this by sending no child data with those states; this page could not
 * leak it if it tried, and that is deliberate belt and braces.
 *
 * THE APPROVED STATE IS NOT A DEAD END. The same link is how permission comes
 * back off, so an approved token still renders something to do — and the
 * approve success screen says so, because this email is the only door back in.
 */

type Outcome = "approved" | "declined" | "withdrawn"

type LoadState =
  | { status: "loading" }
  | { status: "ready"; view: GuardianConsentView }
  | { status: "failed"; message: string }

export default function PublicConsentPage({ token }: { token: string }) {
  const [load, setLoad] = useState<LoadState>({ status: "loading" })
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  // The withdraw confirmation. Its own state rather than a window.confirm:
  // that dialog cannot say what it is about, is styled by the browser, and on
  // some mobile browsers can be suppressed entirely.
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const loadConsent = useCallback(async () => {
    setLoad({ status: "loading" })

    try {
      const view = await fetchGuardianConsent(token)
      setLoad({ status: "ready", view })
    } catch (err) {
      setLoad({
        status: "failed",
        message:
          err instanceof Error && err.message === "network"
            ? "We could not reach Goatza. Check your connection and try again."
            : "We could not open this link right now. Please try again.",
      })
    }
  }, [token])

  useEffect(() => {
    void loadConsent()
  }, [loadConsent])

  // ── Actions ──────────────────────────────────────────────

  const handleApprove = async (payload: GuardianApprovalPayload) => {
    // Thrown errors are caught and shown by ParentApprovalForm, which keeps
    // everything typed in place — so nothing is swallowed here.
    await approveGuardianConsent(token, payload)
    setOutcome("approved")
  }

  const runSimpleAction = async (
    action: () => Promise<void>,
    result: Outcome,
  ) => {
    setActionBusy(true)
    setActionError(null)

    try {
      await action()
      setOutcome(result)
    } catch (err) {
      setActionError(
        err instanceof Error && err.message === "network"
          ? "You seem to be offline. Check your connection and try again."
          : err instanceof Error
            ? err.message
            : "That didn't go through. Please try again.",
      )
    } finally {
      setActionBusy(false)
    }
  }

  const handleDecline = () =>
    runSimpleAction(() => declineGuardianConsent(token), "declined")

  const handleWithdraw = () =>
    runSimpleAction(() => withdrawGuardianConsent(token), "withdrawn")

  // ── Screens ──────────────────────────────────────────────

  if (outcome) {
    return <OutcomeScreen outcome={outcome} />
  }

  if (load.status === "loading") {
    return (
      <Shell>
        <p className={styles.loading}>Loading…</p>
      </Shell>
    )
  }

  if (load.status === "failed") {
    return (
      <Shell>
        <Icon
          icon="mdi:wifi-off"
          className={styles.stateIcon}
          width={36}
          height={36}
          aria-hidden="true"
        />
        <h1 className={styles.title}>Something went wrong</h1>
        <p className={styles.body}>{load.message}</p>
        <Button
          variant="brand"
          size="lg"
          fullWidth
          type="button"
          onClick={() => void loadConsent()}
        >
          Try again
        </Button>
      </Shell>
    )
  }

  const { view } = load

  /*
    Expired and invalid share ONE screen and one sentence. Two different
    messages would be a way to tell a used link from a made-up one, and that
    difference is exactly the thing worth not saying.
  */
  if (view.state === "expired" || view.state === "invalid") {
    return (
      <Shell>
        <Icon
          icon="mdi:link-variant-off"
          className={styles.stateIcon}
          width={36}
          height={36}
          aria-hidden="true"
        />
        <h1 className={styles.title}>This link is not active</h1>
        <p className={styles.body}>
          Links stop working after a while, or once they&apos;ve been used. If
          you still need to approve something, ask for a new email.
        </p>
        <ReportLine />
      </Shell>
    )
  }

  if (view.state === "approved") {
    return (
      <Shell>
        <div className={styles.statusRow}>
          <Icon
            icon="mdi:check-circle"
            className={styles.statusIcon}
            width={22}
            height={22}
            aria-hidden="true"
          />
          <span className={styles.statusText}>You approved this</span>
        </div>

        <h1 className={styles.title}>
          {view.child_username
            ? `${view.child_username} can use Goatza`
            : "Approved"}
        </h1>

        <p className={styles.body}>
          You can remove your permission at any time. If you do, they
          won&apos;t be able to use Goatza.
        </p>

        <div className={styles.dataWrap}>
          <GuardianDataList items={view.processed_data} />
        </div>

        {actionError && (
          <p className={styles.apiError} role="alert">
            <Icon icon="mdi:alert-circle-outline" width={15} height={15} />
            {actionError}
          </p>
        )}

        <div className={styles.removeWrap}>
          <Button
            variant="outline"
            size="lg"
            fullWidth
            type="button"
            disabled={actionBusy}
            onClick={() => {
              setActionError(null)
              setConfirmingWithdraw(true)
            }}
          >
            Remove permission
          </Button>
        </div>

        <NoticeVersion version={view.notice_version} />
        <ReportLine />

        {confirmingWithdraw && (
          <ConfirmWithdrawDialog
            childUsername={view.child_username}
            busy={actionBusy}
            onCancel={() => setConfirmingWithdraw(false)}
            onConfirm={() => void handleWithdraw()}
          />
        )}
      </Shell>
    )
  }

  // ── pending ──────────────────────────────────────────────

  const siblings = view.siblings ?? []

  return (
    <Shell>
      <h1 className={styles.title}>Your approval is needed</h1>

      <p className={styles.body}>
        {view.child_username ? (
          <>
            <strong className={styles.childName}>{view.child_username}</strong>{" "}
            wants to use Goatza. You need to be their parent or guardian to
            approve this.
          </>
        ) : (
          "Someone in your family wants to use Goatza."
        )}
      </p>

      {siblings.length > 0 && (
        <p className={styles.siblingLine}>
          <Icon
            icon="mdi:information-outline"
            width={16}
            height={16}
            aria-hidden="true"
          />
          {/* Plain list, no Oxford-comma logic — two names is the realistic
              maximum and "A and B" reads better than "A, B". */}
          <span>You already approved for {siblings.join(" and ")}.</span>
        </p>
      )}

      <div className={styles.dataWrap}>
        <GuardianDataList items={view.processed_data} />
      </div>

      {actionError && (
        <p className={styles.apiError} role="alert">
          <Icon icon="mdi:alert-circle-outline" width={15} height={15} />
          {actionError}
        </p>
      )}

      <ParentApprovalForm
        onApprove={handleApprove}
        submitLabel="Approve"
        busy={actionBusy}
        secondaryAction={
          <Button
            variant="ghost"
            size="lg"
            fullWidth
            type="button"
            loading={actionBusy}
            onClick={() => void handleDecline()}
          >
            Decline
          </Button>
        }
      />

      <NoticeVersion version={view.notice_version} />
      <ReportLine />
    </Shell>
  )
}

/* ── Pieces ─────────────────────────────────────────────── */

/** The one card every state renders into. Keeps the page shape constant. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.page}>
      <div className={styles.card}>{children}</div>
    </div>
  )
}

/**
 * What the parent agreed to, as a version string.
 *
 * Small and last, because it means nothing to the reader and everything to the
 * record. Left off entirely when the server does not send one rather than
 * printing an empty label.
 */
function NoticeVersion({ version }: { version?: string }) {
  if (!version) return null
  return <p className={styles.notice}>Notice {version}</p>
}

/** The only link off this page. */
function ReportLine() {
  return (
    <p className={styles.help}>
      Not expecting this?{" "}
      <Link href="/report-problem" className={styles.helpLink}>
        Tell us
      </Link>
    </p>
  )
}

/**
 * The confirm step before permission comes off.
 *
 * Withdrawing is not undoable from this screen — the link may well be spent
 * afterwards — so it gets a real stop rather than a button that acts on the
 * first tap. Cancel is the plain one and comes first; the destructive action is
 * the red one, so a mis-tap lands on the harmless side.
 */
function ConfirmWithdrawDialog({
  childUsername,
  busy,
  onCancel,
  onConfirm,
}: {
  childUsername?: string
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  // Escape closes it. A modal a phone keyboard can cover and a desktop user
  // cannot dismiss is a trap.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onCancel])

  return (
    <div className={styles.dialogBackdrop} role="presentation">
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="withdraw-title"
      >
        <h2 id="withdraw-title" className={styles.dialogTitle}>
          Remove permission?
        </h2>

        <p className={styles.dialogBody}>
          {childUsername
            ? `${childUsername} won't be able to use Goatza.`
            : "They won't be able to use Goatza."}{" "}
          You can approve again later if you change your mind.
        </p>

        <div className={styles.dialogActions}>
          <Button
            variant="outline"
            size="lg"
            fullWidth
            type="button"
            disabled={busy}
            onClick={onCancel}
          >
            Keep it
          </Button>
          <Button
            variant="danger"
            size="lg"
            fullWidth
            type="button"
            loading={busy}
            onClick={onConfirm}
          >
            Remove
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Approve, decline and withdraw all end here. */
function OutcomeScreen({ outcome }: { outcome: Outcome }) {
  const content = {
    approved: {
      icon: "mdi:check-circle-outline",
      title: "All done — thank you",
      body: "They can start using Goatza now.",
      // The ONE thing this screen has to get across. This email is the only
      // way back to the remove button; a parent who deletes it has no account
      // to log into instead.
      extra:
        "Keep this email. You can open the same link again any time to remove your permission.",
    },
    declined: {
      icon: "mdi:close-circle-outline",
      title: "Thanks for telling us",
      body: "They won't be able to use Goatza.",
      extra: null as string | null,
    },
    withdrawn: {
      icon: "mdi:shield-off-outline",
      title: "Permission removed",
      body: "They can no longer use Goatza.",
      extra: "If you change your mind, ask them to send a new email.",
    },
  }[outcome]

  return (
    <Shell>
      <Icon
        icon={content.icon}
        className={styles.stateIcon}
        width={36}
        height={36}
        aria-hidden="true"
      />
      <h1 className={styles.title}>{content.title}</h1>
      <p className={styles.body}>{content.body}</p>
      {content.extra && <p className={styles.extra}>{content.extra}</p>}
      <ReportLine />
    </Shell>
  )
}
