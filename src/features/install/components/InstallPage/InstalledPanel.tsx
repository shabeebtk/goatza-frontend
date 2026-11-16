"use client"

import { useEffect, useRef } from "react"
import { Icon } from "@iconify/react"

import { Button } from "@/shared/components/ui"
import { useAuthStore } from "@/store/auth.store"
import { INSTALLED_COPY } from "../../installCopy"
import HomeScreenIllustration from "../HomeScreenIllustration/HomeScreenIllustration"
import Headline from "./Headline"
import styles from "./InstallPage.module.css"

/**
 * Shown in this tab after an install that happened here (the prompt accepted,
 * `appinstalled` from the browser's menu, or the desktop card). The app itself
 * opens from the home screen; this tab is just the browser.
 *
 * It replaces a page the person had scrolled down to reach the button, so it
 * starts at the top and moves focus to its heading: the check, "GOATZA IS
 * INSTALLED" and the line under it are what is seen and announced.
 */
export default function InstalledPanel() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    window.scrollTo(0, 0)
    headingRef.current?.focus({ preventScroll: true })
  }, [])

  return (
    <div className={styles.page}>
      <div className={styles.installed}>
        <span className={styles.doneCheck} aria-hidden="true">
          <Icon icon="mdi:check" width={34} height={34} />
        </span>
        <Headline
          top={INSTALLED_COPY.headlineTop}
          bottom={INSTALLED_COPY.headlineBottom}
          headingRef={headingRef}
          focusable
        />
        <p className={styles.lede} role="status">
          {INSTALLED_COPY.text}
        </p>
        <HomeScreenIllustration className={styles.installedPhone} />
        <p className={styles.tipCard}>
          <Icon
            icon="mdi:bell-ring-outline"
            width={20}
            height={20}
            className={styles.tipIcon}
            aria-hidden="true"
          />
          {INSTALLED_COPY.tip}
        </p>
      </div>
      <div className={styles.actions}>
        <Button
          variant="outline"
          fullWidth
          className={styles.darkOutline}
          href={isAuthenticated ? "/home" : "/"}
        >
          {INSTALLED_COPY.keepUsing}
        </Button>
      </div>
    </div>
  )
}
