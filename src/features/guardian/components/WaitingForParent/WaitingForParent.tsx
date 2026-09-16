"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Icon } from "@iconify/react"

import { Button } from "@/shared/components/ui"
import { getUserApi } from "@/features/auth/services/auth.api"

import {
  DECLINED_HEADING,
  DECLINED_SUBHEADING,
  EXPIRED_HEADING,
  EXPIRED_SUBHEADING,
  NOT_APPROVED_YET,
  SAME_EMAIL_WAITING_ACTION,
  SAME_EMAIL_WAITING_NOTE,
} from "../../guardianCopy"
import { resendGuardianLinkApi } from "../../services/guardian.api"
import {
  syncGuardianFromServer,
  useGuardianStore,
} from "../../store/guardian.store"
import type { GuardianStatusBlock } from "../../types"
import styles from "./WaitingForParent.module.css"

/**
 * The link is out; the child is waiting.
 *
 * Reached when POST /guardian/details answers — an email went to the address
 * given, the child's own sign-up address included, and nothing more can
 * happen on this device until somebody opens it.
 *
 * A ROUTE, not a step inside AuthCard, and that is the point: this is the one
 * state that can last days. It has to survive the tab being closed and reopened
 * and be somewhere a child can get back to, which a step rendered inside a form
 * component is not. Everything it says comes from the server — either from the
 * /guardian/details reply that got them here, or from the `guardian` block on
 * /user/details when they come back to a cold tab — so it reads the same on
 * both.
 *
 * HOW IT FINDS OUT THE PARENT ANSWERED. It re-reads /user/details when the tab
 * comes back into view or the window regains focus — which is what a child
 * does after handing the phone over or after their parent texts "done" — and
 * when they tap continue. Throttled to once every ten seconds so a flurry of
 * focus events is one request. It deliberately does NOT poll: a screen that
 * quietly checks every few seconds for an answer that typically arrives hours
 * later spends a teenager's mobile data to tell them nothing, and the moment
 * it does arrive they are not looking at this screen anyway.
 *
 * THREE SHAPES, from `request_state`. Waiting is the normal one. Declined means
 * the parent said no on the link, so the only way forward is a fresh request —
 * "send it again" is hidden, because re-mailing a person who already answered
 * is not a way forward. Expired means the link lapsed unopened, and a new email
 * is the fix, so that becomes the primary action. Without these the child
 * tapped continue, silently bounced back here, and had no idea why.
 *
 * TWO ESCAPE HATCHES, because they fix different things. "Send it again" is for
 * a mail that vanished or expired, and goes to /guardian/resend, which cannot
 * change the address. "Wrong address?" is for a typo, and goes back to the
 * details form. One mistyped character would otherwise strand a child here
 * permanently.
 */

/** How often the focus/visibility re-check may actually hit the server. */
const RECHECK_INTERVAL_MS = 10_000

type CheckOutcome = "idle" | "still_pending" | "failed"

type ResendState = "idle" | "sending" | "sent" | "failed"

/** The machine-readable half of a 400 from the guardian endpoints. */
function errorCode(err: unknown): string | undefined {
  return (err as { response?: { data?: { data?: { code?: string } } } })
    ?.response?.data?.data?.code
}

function errorMessage(err: unknown): string | undefined {
  return (err as { response?: { data?: { message?: string } } })?.response
    ?.data?.message
}

export default function WaitingForParent() {
  const router = useRouter()
  const maskedContact = useGuardianStore((s) => s.maskedContact)
  const sameAsLoginContact = useGuardianStore((s) => s.sameAsLoginContact)
  const requestState = useGuardianStore((s) => s.requestState)

  const [checking, setChecking] = useState(false)
  const [checkOutcome, setCheckOutcome] = useState<CheckOutcome>("idle")

  const [resendState, setResendState] = useState<ResendState>("idle")
  const [resendError, setResendError] = useState<string | null>(null)

  // Refs, not state: neither should re-render anything, and the listeners
  // below must see the latest values without being re-bound.
  const lastCheckedAt = useRef(0)
  const inFlight = useRef(false)

  /**
   * Ask the server where things stand, and act on the answer.
   *
   * `force` is the continue button — a deliberate tap always asks, and always
   * gets a visible answer. The automatic triggers are throttled and quiet.
   */
  const checkStatus = useCallback(
    async (force = false) => {
      const now = Date.now()

      if (inFlight.current) return
      if (!force && now - lastCheckedAt.current < RECHECK_INTERVAL_MS) return

      inFlight.current = true
      lastCheckedAt.current = now
      if (force) setChecking(true)
      setCheckOutcome("idle")

      try {
        const user = await getUserApi()
        const block: GuardianStatusBlock | undefined = user?.guardian

        // The block is the authority. Syncing it is what flips this screen
        // to declined / expired, and what the gate reads everywhere else.
        syncGuardianFromServer(block)

        if (block?.status === "withdrawn") {
          // A different screen entirely — the details step wears the
          // "permission was removed" wording. `replace`: this page is over.
          router.replace("/auth")
          return
        }

        if (block?.status === "pending") {
          setCheckOutcome("still_pending")
          return
        }

        /*
          Approved (or no longer needed). A FULL page load, not a client-side
          push, and not <Link>. The session bootstrap (initAuth) runs on boot
          and is the thing that re-reads the guardian block with a clean
          slate; a soft navigation carries the same session across and would
          leave stale query caches and gate state behind it.
        */
        window.location.href = "/home"
      } catch {
        setCheckOutcome("failed")
      } finally {
        inFlight.current = false
        if (force) setChecking(false)
      }
    },
    [router],
  )

  // The tab coming back, or the window regaining focus, is the moment a
  // parent's answer is most likely to have landed. Both fire together on a
  // tab switch; the throttle turns the pair into one request.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void checkStatus()
    }
    const onFocus = () => void checkStatus()

    document.addEventListener("visibilitychange", onVisibilityChange)
    window.addEventListener("focus", onFocus)

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange)
      window.removeEventListener("focus", onFocus)
    }
  }, [checkStatus])

  const startOver = () => {
    // Keeps `required` true and drops everything about the request, which is
    // exactly the state the flow starts in — AuthCard reads that as "ask for
    // the details again".
    useGuardianStore.setState({
      mode: null,
      maskedContact: null,
      sameAsLoginContact: false,
      requestState: null,
    })
    router.push("/auth")
  }

  const resend = async () => {
    setResendState("sending")
    setResendError(null)

    try {
      const { masked_contact, same_as_login_contact } =
        await resendGuardianLinkApi()
      // The server may mask it differently than we stored it; take its
      // answer. This also puts the screen back to waiting after an expiry.
      useGuardianStore
        .getState()
        .setMode("link_sent", masked_contact, same_as_login_contact === true)
      setResendState("sent")
    } catch (err) {
      // A stale tab: the parent declined since this screen last synced. The
      // server has said so; show the declined screen rather than an error.
      if (errorCode(err) === "consent_declined") {
        useGuardianStore.setState({ requestState: "declined" })
        setResendState("idle")
        return
      }

      // The throttle is the expected failure here, and it has a real message
      // worth showing — "you did this a minute ago" is useful, "try again" is
      // not.
      setResendError(
        errorMessage(err) || "That didn't go through. Please try again.",
      )
      setResendState("failed")
    }
  }

  // ── Declined ─────────────────────────────────────────────

  if (requestState === "declined") {
    return (
      <Shell>
        <Icon
          icon="mdi:email-remove-outline"
          className={styles.icon}
          width={40}
          height={40}
          aria-hidden="true"
        />

        <h1 className={styles.title}>{DECLINED_HEADING}</h1>

        <p className={styles.body}>{DECLINED_SUBHEADING}</p>

        <div className={styles.actions}>
          <Button
            variant="brand"
            size="lg"
            fullWidth
            type="button"
            onClick={startOver}
          >
            Ask again or ask someone else
          </Button>
        </div>

        <HelpLine />
      </Shell>
    )
  }

  // ── Expired ──────────────────────────────────────────────

  if (requestState === "expired") {
    return (
      <Shell>
        <Icon
          icon="mdi:email-alert-outline"
          className={styles.icon}
          width={40}
          height={40}
          aria-hidden="true"
        />

        <h1 className={styles.title}>{EXPIRED_HEADING}</h1>

        <p className={styles.body}>{EXPIRED_SUBHEADING}</p>

        <div className={styles.actions}>
          <Button
            variant="brand"
            size="lg"
            fullWidth
            type="button"
            loading={resendState === "sending"}
            onClick={() => void resend()}
          >
            Send a new email
          </Button>

          {resendError && (
            <p className={styles.resendError} role="alert">
              {resendError}
            </p>
          )}

          <button type="button" className={styles.textBtn} onClick={startOver}>
            Wrong address? Start again
          </button>
        </div>

        <HelpLine />
      </Shell>
    )
  }

  // ── Waiting ──────────────────────────────────────────────

  return (
    <Shell>
      <Icon
        icon="mdi:email-fast-outline"
        className={styles.icon}
        width={40}
        height={40}
        aria-hidden="true"
      />

      <h1 className={styles.title}>Waiting for your parent or guardian</h1>

      <p className={styles.body}>
        {sameAsLoginContact ? (
          <>
            {SAME_EMAIL_WAITING_NOTE}
            {maskedContact && (
              <>
                {" "}
                (<strong className={styles.contact}>{maskedContact}</strong>)
              </>
            )}
            . {SAME_EMAIL_WAITING_ACTION}
          </>
        ) : maskedContact ? (
          <>
            We sent an email to{" "}
            <strong className={styles.contact}>{maskedContact}</strong>. When
            they say yes, you can start.
          </>
        ) : (
          "We sent them an email. When they say yes, you can start."
        )}
      </p>

      <ul className={styles.steps}>
        <li className={styles.step}>Ask them to open the email from Goatza.</li>
        <li className={styles.step}>They tap Approve.</li>
        <li className={styles.step}>You come back here and tap continue.</li>
      </ul>

      <p className={styles.note}>
        Nothing yet? Ask them to check the spam folder.
      </p>

      <div className={styles.actions}>
        <Button
          variant="brand"
          size="lg"
          fullWidth
          type="button"
          loading={checking}
          onClick={() => void checkStatus(true)}
        >
          I&apos;ve been approved — continue
        </Button>

        {checkOutcome === "still_pending" && (
          <p className={styles.statusNote} role="status">
            {NOT_APPROVED_YET}
          </p>
        )}

        {checkOutcome === "failed" && (
          <p className={styles.resendError} role="alert">
            We couldn&apos;t check just now. Try again in a moment.
          </p>
        )}

        {resendState === "sent" ? (
          <p className={styles.resendDone} role="status">
            <Icon icon="mdi:check-circle-outline" width={16} height={16} />
            Sent again. Ask them to check their email.
          </p>
        ) : (
          <button
            type="button"
            className={styles.textBtn}
            onClick={() => void resend()}
            disabled={resendState === "sending"}
          >
            {resendState === "sending" ? "Sending…" : "Send the email again"}
          </button>
        )}

        {resendError && (
          <p className={styles.resendError} role="alert">
            {resendError}
          </p>
        )}

        <button type="button" className={styles.textBtn} onClick={startOver}>
          Wrong address? Start again
        </button>
      </div>

      <HelpLine />
    </Shell>
  )
}

/* ── Pieces ─────────────────────────────────────────────── */

/** The one card every shape renders into, so the page never jumps. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className={styles.page}>
      <div className={styles.card}>{children}</div>
    </main>
  )
}

function HelpLine() {
  return (
    <p className={styles.help}>
      Stuck?{" "}
      <Link href="/report-problem" className={styles.helpLink}>
        Tell us
      </Link>
    </p>
  )
}
