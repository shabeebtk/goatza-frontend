"use client"

import Link from "next/link"
import { Icon } from "@iconify/react"

import { useInstallTarget } from "@/core/pwa/useInstallTarget"
import { LANDING_COPY } from "@/features/install/installCopy"
import { INSTALL_PATH } from "@/features/install/installLinks"
import styles from "./LandingInstall.module.css"

/** The header's small "Get app" pill. Gone inside the installed app. */
export default function GetAppPill({ overHero = false }: { overHero?: boolean }) {
  const { mode } = useInstallTarget()
  if (mode === "installed") return null

  return (
    <Link href={INSTALL_PATH} className={`${styles.pill} ${overHero ? styles.pillOverHero : ""}`}>
      <Icon icon="mdi:download" width={16} height={16} aria-hidden="true" />
      <span className={styles.pillLabel}>{LANDING_COPY.headerPill}</span>
    </Link>
  )
}
