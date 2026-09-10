"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import AuthCard from "@/features/auth/components/AuthCard/AuthCard"
import styles from "./AuthPage.module.css"
import { LOGO_URL } from "@/constants"
import { postAuthPath } from "@/shared/services/authRedirect"
import { useGuardianStore } from "@/features/guardian/store/guardian.store"
import { useAuthStore } from "@/store/auth.store"

export default function AuthPageLayout() {
  const { isAuthenticated, isLoading } = useAuthStore()
  const router = useRouter()
  const searchParams = useSearchParams()

  /*
    A minor mid-guardian-flow IS authenticated — the OTP or the Google callback
    handed back a real token — and without this they would be bounced into the
    app by the redirect below the instant the step they are supposed to complete
    rendered. This is the one authenticated state that belongs on this page.

    It is not the gate. The server is what keeps a pending account out of
    everything else; this only keeps the client from navigating away from the
    screen that resolves it.
  */
  const guardianRequired = useGuardianStore((s) => s.required)

  // Already signed in (incl. a session recovered late by initAuth's retry) —
  // never leave the user staring at a login form they don't need. Honours
  // ?next= so someone who arrived from a login wall on a public profile and
  // turns out to already have a session lands back on that profile.
  useEffect(() => {
    if (!isLoading && isAuthenticated && !guardianRequired) {
      router.replace(postAuthPath(searchParams))
    }
  }, [isAuthenticated, isLoading, guardianRequired, router, searchParams])

  if (isLoading) return null        // brief blank beats a login-form flash
  // Redirecting — unless the guardian step is why they are here.
  if (isAuthenticated && !guardianRequired) return null

  return (
    <div className={styles.authPage}>

      {/* ── LEFT PANEL — visual / brand ── */}
      <div className={styles.leftPanel} aria-hidden="true">

        {/* Background layers */}
        <div className={styles.leftBg} />
        <div className={styles.leftGrid} />
        <div className={styles.leftVignette} />

        {/* Rotated watermark wordmark */}
        <span className={styles.watermark}>GOATZA</span>

        

        {/* Bottom tag */}
        <div className={styles.leftTagline}>
          <span className={styles.taglinePre}>WHERE THE</span>
          <span className={styles.taglineHero}>GREATEST</span>
          <span className={styles.taglinePost}>GET DISCOVERED</span>
        </div>

        {/* Pitch lines decoration */}
        <div className={styles.pitchLines}>
          <div className={styles.pitchLine} />
          <div className={styles.pitchLine} />
          <div className={styles.pitchCircle} />
        </div>

      </div>

      {/* ── RIGHT PANEL — auth card ── */}
      <div className={styles.rightPanel}>

        {/* Logo / back home — centered lockup: mark above, wordmark below */}
        <Link href="/" className={styles.logoLink} aria-label="Goatza home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={LOGO_URL}
            alt=""
            aria-hidden="true"
            className={styles.logoImg}
            onError={(e) => {
              // if the mark fails, the wordmark below still carries the brand
              e.currentTarget.style.display = "none"
            }}
          />
        </Link>

        {/* Card wrapper */}
        <div className={styles.cardWrapper}>
          <AuthCard />
        </div>

        {/*
          * Reference links, NOT a consent notice. The old copy here read "By
          * continuing you agree to…", which is exactly the implied-consent
          * wording this flow no longer relies on — agreement is the checkbox
          * on the form now, and a second sentence claiming it happens merely
          * by continuing would contradict it.
          *
          * The hrefs were also dead: they pointed at /legal/terms, which has
          * never been a route. The pages live at /terms and /privacy.
          */}
        <p className={styles.legalText}>
          <Link href="/terms" className={styles.legalLink}>Terms of Service</Link>
          {" · "}
          <Link href="/privacy" className={styles.legalLink}>Privacy Policy</Link>
        </p>

        {/* The way OUT of a broken login. Quiet and secondary — it is not what
            most people came for — but present, because a public report form
            nobody can find from the screen that failed them is the same as not
            having built it. */}
        <p className={styles.helpText}>
          Can&apos;t log in?{" "}
          <Link href="/report-problem" className={styles.helpLink}>
            Report a problem
          </Link>
        </p>

      </div>
    </div>
  )
}