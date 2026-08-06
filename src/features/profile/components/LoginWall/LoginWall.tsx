"use client"

/**
 * The login wall.
 *
 * Small, dismissible, and it names the person — "Join Goatza to follow Riya"
 * converts where "Sign in to continue" does not. Both buttons carry
 * `?next=<this profile>`, so the click that opened the wall is honoured
 * instead of dumping the visitor on a home feed they have no context for.
 */

import { useEffect, useId, useRef, useSyncExternalStore } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { Icon } from "@iconify/react"

import { authUrlWithNext } from "@/shared/services/authRedirect"
import styles from "./LoginWall.module.css"

/** Module-level so useSyncExternalStore doesn't resubscribe every render. */
const subscribeToNothing = () => () => {}

interface LoginWallProps {
  /** Whose profile this is — the wall's headline names them. */
  displayName: string
  /** Verb phrase for what was attempted: "follow", "message", "like this". */
  action: string
  /** Where to return after signing in. */
  nextPath: string
  onClose: () => void
}

function LoginWallInner({
  displayName,
  action,
  nextPath,
  onClose,
}: LoginWallProps) {
  const titleId = useId()
  const backdropRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Esc closes. Deliberately no focus trap: this is a two-button prompt over a
  // page the visitor is allowed to keep reading, and trapping them in it would
  // be worse than the alternative.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [onClose])

  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  const headline = `Join Goatza to ${action} ${displayName}`

  return createPortal(
    <div
      ref={backdropRef}
      className={styles.backdrop}
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <button
          type="button"
          className={styles.closeBtn}
          onClick={onClose}
          aria-label="Close"
        >
          <Icon icon="mdi:close" width={18} height={18} />
        </button>

        <span className={styles.mark} aria-hidden="true">
          <Icon icon="mdi:soccer" width={26} height={26} />
        </span>

        <h2 id={titleId} className={styles.title}>
          {headline}
        </h2>
        <p className={styles.subtitle}>
          Create a free account to follow athletes and clubs, message them, and
          get discovered yourself.
        </p>

        <div className={styles.actions}>
          <Link
            href={authUrlWithNext(nextPath, "signup")}
            className={styles.primaryBtn}
          >
            Sign up
          </Link>
          <Link
            href={authUrlWithNext(nextPath, "login")}
            className={styles.secondaryBtn}
          >
            Log in
          </Link>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default function LoginWall(props: LoginWallProps) {
  // createPortal needs `document`, so nothing may render on the server pass.
  // useSyncExternalStore (rather than a mounted flag in an effect) gets there
  // without a cascading render — same pattern ShareSheet uses.
  const mounted = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false
  )

  if (!mounted) return null

  return <LoginWallInner {...props} />
}
