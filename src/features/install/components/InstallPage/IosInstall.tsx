"use client"

import { useState } from "react"

import type { IosSteps } from "@/core/pwa/useInstallTarget"
import { IOS_COPY } from "../../installCopy"
import { iosStepsFor } from "../../iosSteps"
import IosStepsGuide from "../IosStepsGuide/IosStepsGuide"
import Headline from "./Headline"
import { Wordmark } from "./PitchHero"
import styles from "./InstallPage.module.css"

/**
 * iPhone and iPad: no install API exists, so the page walks the three taps.
 * Safari's steps depend on the version (iOS 26 hid Share behind •••); when the
 * version could not be read the modern steps are shown with a line for older
 * phones. Chrome's share icon is at the top, so it gets no toolbar arrow.
 */
export default function IosInstall({
  browser,
  iosSteps = "modern",
  safariMajorKnown = true,
}: {
  browser: "safari" | "chrome"
  iosSteps?: IosSteps
  safariMajorKnown?: boolean
}) {
  const [done, setDone] = useState(false)

  const steps = iosStepsFor(browser === "chrome" ? "chrome" : iosSteps)

  return (
    <div className={styles.page}>
      <Wordmark />
      <div className={`${styles.body} ${styles.bodyTop} ${styles.bodyLast}`}>
        <Headline top={IOS_COPY.headlineTop} bottom={IOS_COPY.headlineBottom} />
        <p className={styles.lede}>{IOS_COPY.lede(browser === "chrome" ? "Chrome" : "Safari")}</p>
        <IosStepsGuide
          steps={steps}
          arrow={browser === "chrome" ? null : iosSteps}
          onDone={() => setDone(true)}
        />
        {browser === "safari" && !safariMajorKnown && (
          <p className={styles.mutedLine}>{IOS_COPY.olderIphone}</p>
        )}
        {done && (
          <p className={styles.mutedLine} role="status">
            {IOS_COPY.doneNote}
          </p>
        )}
      </div>
    </div>
  )
}
