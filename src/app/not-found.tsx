"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Icon } from "@iconify/react"
import styles from "./not-found.module.css"

const REDIRECT_SECONDS = 5

export default function NotFound() {
  const router = useRouter()
  const [countdown, setCountdown] = useState(REDIRECT_SECONDS)

  useEffect(() => {
    if (countdown <= 0) {
      router.push("/home")
      return
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown, router])

  return (
    <div className={styles.page}>
      {/* Background grid */}
      <div className={styles.grid} aria-hidden="true" />

      <div className={styles.content}>

        {/* Giant 404 */}
        <div className={styles.heroNumber} aria-hidden="true">
          <span className={styles.four}>4</span>
          <span className={styles.zero}>
            <Icon icon="mdi:soccer" width="1em" height="1em" className={styles.ballIcon} />
          </span>
          <span className={styles.four}>4</span>
        </div>

        <div className={styles.textBlock}>
          <h1 className={styles.title}>Out of Bounds</h1>
          <p className={styles.body}>
            This page doesn't exist or was moved. You'll be redirected to the home feed.
          </p>
        </div>

        {/* Countdown ring */}
        <div className={styles.countdownWrap} aria-label={`Redirecting in ${countdown} seconds`}>
          <svg className={styles.countdownSvg} viewBox="0 0 44 44">
            <circle
              className={styles.countdownTrack}
              cx="22" cy="22" r="18"
              fill="none"
              strokeWidth="2.5"
            />
            <circle
              className={styles.countdownProgress}
              cx="22" cy="22" r="18"
              fill="none"
              strokeWidth="2.5"
              strokeDasharray={`${2 * Math.PI * 18}`}
              strokeDashoffset={`${2 * Math.PI * 18 * (1 - countdown / REDIRECT_SECONDS)}`}
              strokeLinecap="round"
            />
          </svg>
          <span className={styles.countdownNumber}>{countdown}</span>
        </div>

        <p className={styles.redirectNote}>Redirecting to home in {countdown}s</p>

        {/* Actions */}
        <div className={styles.actions}>
          <button
            className={styles.btnPrimary}
            onClick={() => router.push("/home")}
            type="button"
          >
            <Icon icon="mdi:home-outline" width={17} height={17} />
            Go Home Now
          </button>
          <button
            className={styles.btnGhost}
            onClick={() => router.back()}
            type="button"
          >
            <Icon icon="mdi:arrow-left" width={17} height={17} />
            Go Back
          </button>
        </div>

      </div>
    </div>
  )
}