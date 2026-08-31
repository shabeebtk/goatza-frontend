"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Icon } from "@iconify/react"

import { Button } from "@/shared/components/ui"
import { useLogout } from "@/features/auth/hooks/useLogout"
import { useFocusTrap } from "@/features/onboarding/hooks/useFocusTrap"
import { getUserApi } from "@/features/auth/services/auth.api"
import { useAuthStore } from "@/store/auth.store"
import { legalHref, legalLabel } from "../../constants"
import { acceptLegalApi } from "../../services/legal.api"
import { useLegalConsentStore } from "../../store/legalConsent.store"
import styles from "./LegalConsentModal.module.css"

/**
 * "We've updated our terms" — the one modal in the app that cannot be closed.
 *
 * WHY IT IS NOT DISMISSIBLE
 *
 * Every other modal here closes on Escape or a backdrop click, and this one
 * deliberately breaks that pattern: the server has already stopped accepting
 * this user's writes (403 TERMS_ACCEPTANCE_REQUIRED), so a dismissable prompt
 * would just return them to an app where nothing works and nothing says why.
 * The choice on offer is agree or leave, and BOTH are on screen — a blocking
 * modal with only one button is a trap, which is the failure this design is
 * most concerned with avoiding.
 *
 * Reading the documents is not leaving: the links open in a new tab, so a user
 * can go read what changed and come back to a modal that is still here.
 */
export default function LegalConsentModal() {
  const pendingDocuments = useLegalConsentStore((s) => s.pendingDocuments)
  const clear = useLegalConsentStore((s) => s.clear)
  const updateUser = useAuthStore((s) => s.updateUser)
  const logout = useLogout()

  const [submitting, setSubmitting] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  useFocusTrap(containerRef, true)

  // Lock body scroll, same as the onboarding modal.
  useEffect(() => {
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = ""
    }
  }, [])

  /**
   * Swallow Escape. Captured at the window, like OnboardingModal's handler, so
   * it is stopped before any dialog underneath can act on it — otherwise
   * Escape here would close whatever modal this one opened over while leaving
   * this one up.
   */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [])

  const handleAgree = async () => {
    setError(null)
    setSubmitting(true)

    try {
      await acceptLegalApi(pendingDocuments)

      // Refetch rather than patching the store from the response: /user/details
      // recomputes `legal` server-side, so this is the app agreeing with the
      // server about what is outstanding instead of guessing it is now none.
      try {
        const user = await getUserApi()
        updateUser(user)
      } catch {
        // The acceptance is recorded — that is the part that mattered. A
        // failed refetch must not keep the user staring at a modal they have
        // already satisfied; the next /user/details will reconcile.
      }

      clear()
    } catch {
      setError("Couldn't save that. Please check your connection and try again.")
      setSubmitting(false)
    }
  }

  const handleLogout = async () => {
    setLoggingOut(true)
    // Take the modal down first: logout clears the session, and a blocking
    // dialog left mounted over the auth page would be a second trap.
    clear()
    await logout()
  }

  const busy = submitting || loggingOut

  return (
    <div
      className={styles.backdrop}
      // No onClick. A backdrop that dismissed this would drop the user back
      // into an app the server is already refusing.
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-consent-title"
      aria-describedby="legal-consent-body"
    >
      {/*
        * tabIndex -1 so the dialog itself can hold focus. useFocusTrap moves
        * focus to the first focusable child, but falls back to the container
        * when it finds none — without this that fallback silently does
        * nothing, and focus stays behind on the page underneath, which is the
        * one thing a blocking dialog must never allow.
        */}
      <div className={styles.modal} ref={containerRef} tabIndex={-1}>
        {/*
          * Announced on mount. The modal steals focus, so a screen reader
          * user's first signal is the heading — but the reason they are seeing
          * it is the body text, and assertive is right for something that has
          * interrupted them and is blocking the app.
          */}
        <div className={styles.srOnly} role="alert" aria-live="assertive">
          We have updated our terms. Your agreement is required to continue.
        </div>

        <span className={styles.icon} aria-hidden="true">
          <Icon icon="mdi:file-document-edit-outline" width={26} height={26} />
        </span>

        <h2 className={styles.title} id="legal-consent-title">
          We&rsquo;ve updated our terms
        </h2>

        <p className={styles.body} id="legal-consent-body">
          {pendingDocuments.length > 1
            ? "We've made changes to the documents below. Please review them and agree to carry on using Goatza."
            : "We've made changes to the document below. Please review it and agree to carry on using Goatza."}
        </p>

        <ul className={styles.docList}>
          {pendingDocuments.map((slug) => (
            <li key={slug}>
              <Link
                href={legalHref(slug as never)}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.docLink}
              >
                <span>{legalLabel(slug)}</span>
                {/* The new-tab affordance is stated, not just implied by an
                    icon, because leaving this page is the one thing a user
                    here is likely to be wary of. */}
                <span className={styles.docHint}>
                  Opens in a new tab
                  <Icon icon="mdi:open-in-new" width={14} height={14} />
                </span>
              </Link>
            </li>
          ))}
        </ul>

        {error && (
          <p className={styles.error} role="alert">
            <Icon icon="mdi:alert-circle-outline" width={15} height={15} />
            {error}
          </p>
        )}

        <div className={styles.actions}>
          <Button
            variant="brand"
            size="lg"
            fullWidth
            loading={submitting}
            disabled={busy}
            onClick={handleAgree}
          >
            I agree
          </Button>

          {/* The way out. Present on the first render, not behind a "having
              trouble?" disclosure — a user who does not accept must be able to
              leave without hunting for it. */}
          <button
            type="button"
            className={styles.logoutBtn}
            onClick={handleLogout}
            disabled={busy}
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  )
}
