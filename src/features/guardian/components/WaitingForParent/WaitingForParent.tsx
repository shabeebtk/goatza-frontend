"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Icon } from "@iconify/react"

import { Button } from "@/shared/components/ui"

import { resendGuardianLinkApi } from "../../services/guardian.api"
import { useGuardianStore } from "../../store/guardian.store"
import styles from "./WaitingForParent.module.css"

/**
 * The link is out; the child is waiting.
 *
 * Reached when POST /guardian/details comes back `link_sent` — the parent has
 * their own address, an email went to it, and nothing more can happen on this
 * device until they open it.
 *
 * A ROUTE, not a step inside AuthCard, and that is the point: this is the one
 * state that can last days. It has to survive the tab being closed and reopened
 * and be somewhere a child can get back to, which a step rendered inside a form
 * component is not. The masked address it names comes from the server — either
 * from the /guardian/details reply that got them here, or from the `guardian`
 * block on /user/details when they come back to a cold tab — so it reads the
 * same on both.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: poll. A screen that quietly checks every
 * few seconds for an answer that typically arrives hours later spends a
 * teenager's mobile data to tell them nothing, and the moment it does arrive
 * they are not looking at this screen anyway. The server is what knows; opening
 * the app is what asks it.
 *
 * TWO ESCAPE HATCHES, because they fix different things. "Send it again" is for
 * a mail that vanished, and goes to /guardian/resend, which cannot change the
 * address. "Wrong address?" is for a typo, and goes back to the details form.
 * One mistyped character would otherwise strand a child here permanently.
 */
export default function WaitingForParent() {
  const router = useRouter()
  const maskedContact = useGuardianStore((s) => s.maskedContact)

  const [resendState, setResendState] = useState<
    "idle" | "sending" | "sent" | "failed"
  >("idle")
  const [resendError, setResendError] = useState<string | null>(null)

  const startOver = () => {
    // Keeps `required` true and drops the mode, which is exactly the state the
    // flow starts in — AuthCard reads that as "ask for the details again".
    useGuardianStore.setState({ mode: null, maskedContact: null })
    router.push("/auth")
  }

  const resend = async () => {
    setResendState("sending")
    setResendError(null)

    try {
      const { masked_contact } = await resendGuardianLinkApi()
      // The server may mask it differently than we stored it; take its answer.
      useGuardianStore.getState().setMode("link_sent", masked_contact)
      setResendState("sent")
    } catch (err) {
      // The throttle is the expected failure here, and it has a real message
      // worth showing — "you did this a minute ago" is useful, "try again" is
      // not.
      const message = (
        err as { response?: { data?: { message?: string } } }
      )?.response?.data?.message

      setResendError(message || "That didn't go through. Please try again.")
      setResendState("failed")
    }
  }

  /*
    A FULL page load, not a client-side push, and not <Link>. The session
    bootstrap (initAuth) runs on boot and is the thing that re-reads the
    guardian block and finds out whether the gate has lifted; a soft navigation
    carries the same stale session across with it and would land the child
    straight back here.
  */
  const continueToApp = () => {
    window.location.href = "/home"
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <Icon
          icon="mdi:email-fast-outline"
          className={styles.icon}
          width={40}
          height={40}
          aria-hidden="true"
        />

        <h1 className={styles.title}>Waiting for your parent or guardian</h1>

        <p className={styles.body}>
          {maskedContact ? (
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
            onClick={continueToApp}
          >
            I&apos;ve been approved — continue
          </Button>

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

        <p className={styles.help}>
          Stuck?{" "}
          <Link href="/report-problem" className={styles.helpLink}>
            Tell us
          </Link>
        </p>
      </div>
    </main>
  )
}
