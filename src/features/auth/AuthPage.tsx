"use client"

import Link from "next/link"
import AuthCard from "@/features/auth/components/AuthCard/AuthCard"
import styles from "./AuthPage.module.css" 
import { LOGO_URL } from "@/constants"

export default function AuthPageLayout() {
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

        {/* Decorative stat lines */}
        <ul className={styles.statLines}>
          <li className={styles.statLine}>
            <span className={styles.statNum}>2.4K+</span>
            <span className={styles.statLabel}>Athletes Discovered</span>
          </li>
          <li className={styles.statLine}>
            <span className={styles.statNum}>180+</span>
            <span className={styles.statLabel}>Clubs & Academies</span>
          </li>
          <li className={styles.statLine}>
            <span className={styles.statNum}>34</span>
            <span className={styles.statLabel}>Countries</span>
          </li>
        </ul>

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

        {/* Logo / back home */}
        <Link href="/" className={styles.logoLink}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={LOGO_URL}
            alt="Goatza"
            className={styles.logoImg}
            onError={(e) => {
              // fallback to text wordmark if image fails
              const el = e.currentTarget
              el.style.display = "none"
              el.nextElementSibling?.removeAttribute("hidden")
            }}
          />
          <span className={styles.logoFallback} hidden>GOATZA</span>
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