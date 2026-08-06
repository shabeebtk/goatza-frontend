"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import AuthCard from "@/features/auth/components/AuthCard/AuthCard"
import styles from "./AuthPage.module.css"
import { LOGO_URL } from "@/constants"
import { postAuthPath } from "@/shared/services/authRedirect"
import { useAuthStore } from "@/store/auth.store"

export default function AuthPageLayout() {
  const { isAuthenticated, isLoading } = useAuthStore()
  const router = useRouter()
  const searchParams = useSearchParams()

  // Already signed in (incl. a session recovered late by initAuth's retry) —
  // never leave the user staring at a login form they don't need. Honours
  // ?next= so someone who arrived from a login wall on a public profile and
  // turns out to already have a session lands back on that profile.
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace(postAuthPath(searchParams))
    }
  }, [isAuthenticated, isLoading, router, searchParams])

  if (isLoading) return null        // brief blank beats a login-form flash
  if (isAuthenticated) return null  // redirecting

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

        <p className={styles.legalText}>
          By continuing you agree to Goatza's{" "}
          <Link href="/legal/terms" className={styles.legalLink}>Terms</Link>
          {" & "}
          <Link href="/legal/privacy" className={styles.legalLink}>Privacy Policy</Link>.
        </p>

      </div>
    </div>
  )
}