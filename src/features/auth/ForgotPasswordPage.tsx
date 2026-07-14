"use client"

import Link from "next/link"
import ForgotPasswordCard from "@/features/auth/components/ForgotPasswordCard/ForgotPasswordCard"
import styles from "./AuthPage.module.css"
import { LOGO_URL } from "@/constants"

export default function ForgotPasswordPageLayout() {
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

      {/* ── RIGHT PANEL — reset card ── */}
      <div className={styles.rightPanel}>

        {/* Logo / back home */}
        <Link href="/" className={styles.logoLink} aria-label="Goatza home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={LOGO_URL}
            alt=""
            aria-hidden="true"
            className={styles.logoImg}
            onError={(e) => {
              e.currentTarget.style.display = "none"
            }}
          />
        </Link>

        {/* Card wrapper */}
        <div className={styles.cardWrapper}>
          <ForgotPasswordCard />
        </div>

        <p className={styles.legalText}>
          By continuing you agree to Goatza&apos;s{" "}
          <Link href="/legal/terms" className={styles.legalLink}>Terms</Link>
          {" & "}
          <Link href="/legal/privacy" className={styles.legalLink}>Privacy Policy</Link>.
        </p>

      </div>
    </div>
  )
}
