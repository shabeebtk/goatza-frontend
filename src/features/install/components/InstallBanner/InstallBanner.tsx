"use client"

import { useEffect, useRef, useState } from "react"
import { Icon } from "@iconify/react"

import { promptInstall } from "@/core/pwa/installPrompt"
import { usePWAInstall } from "@/core/pwa/usePWAInstall"
import { useInstallTarget, type InstallTarget } from "@/core/pwa/useInstallTarget"
import { Button } from "@/shared/components/ui"
import {
  dismissBanner,
  isBannerHidden,
  markBannerInstalled,
  readBannerPrefs,
  snoozeBanner,
} from "../../bannerPrefs"
import { BANNER_COPY } from "../../installCopy"
import { INSTALL_PATH } from "../../installLinks"
import { iosGuideKind } from "../../iosSteps"
import AndroidMenuSheet from "../AndroidMenuSheet/AndroidMenuSheet"
import GoatzaTile from "../GoatzaTile/GoatzaTile"
import IosStepsSheet from "../IosStepsSheet/IosStepsSheet"
import styles from "./InstallBanner.module.css"

/** How long "Installed. Open Goatza from your home screen." stays up. */
export const INSTALLED_MESSAGE_MS = 4000

/**
 * What the card offers:
 *   android      one tap (or Chrome's menu steps);
 *   ios-sheet    Safari / Chrome on iPhone: the steps in a sheet;
 *   ios-link     the wrong iPhone browser or an in-app one: /install;
 *   android-link an Android in-app browser: /install (it opens Chrome).
 */
type BannerKind = "android" | "ios-sheet" | "ios-link" | "android-link"

function bannerKind(target: InstallTarget): BannerKind | null {
  switch (target.mode) {
    case "android-prompt":
    case "android-menu":
      return "android"
    case "ios-safari":
    case "ios-chrome":
      return "ios-sheet"
    case "ios-other":
      return "ios-link"
    case "in-app":
      if (target.os === "ios") return "ios-link"
      if (target.os === "android") return "android-link"
      return null
    default:
      // unknown, installed, desktop: never.
      return null
  }
}

/**
 * The feed's "get the app" card. Phones and tablets only, never once
 * installed, and polite about it: "Not now" hides it for 3 days and the third
 * one is final; "Got it" in the iPhone sheet hides it for 3 days without
 * counting (see bannerPrefs). Always dark, like /install.
 */
export default function InstallBanner() {
  const target = useInstallTarget()
  const { installedNow } = usePWAInstall()

  // Server and hydration render nothing (the target is "unknown" there), so
  // reading storage here cannot change the hydrated markup.
  const [prefs, setPrefs] = useState(readBannerPrefs)
  const [sheet, setSheet] = useState<"android" | "ios" | null>(null)
  const [prompting, setPrompting] = useState(false)
  const [justInstalled, setJustInstalled] = useState(false)
  const [finished, setFinished] = useState(false)
  // "Got it" is applied when the sheet has CLOSED (its history entry
  // consumed), not while it is closing: hiding the banner unmounts the sheet.
  const gotIt = useRef(false)

  // Installed anywhere (our prompt or the browser's menu): never again here.
  useEffect(() => {
    if (installedNow) markBannerInstalled()
  }, [installedNow])

  useEffect(() => {
    if (!justInstalled) return
    const timer = setTimeout(() => {
      setJustInstalled(false)
      setFinished(true)
    }, INSTALLED_MESSAGE_MS)
    return () => clearTimeout(timer)
  }, [justInstalled])

  const accepted = justInstalled || (prompting && target.mode === "installed")

  if (finished) return null

  if (accepted) {
    return (
      <section className={styles.banner} aria-label={BANNER_COPY.androidTitle}>
        <GoatzaTile size={48} />
        <p className={styles.installed} role="status">
          <Icon icon="mdi:check-circle" width={20} height={20} aria-hidden="true" />
          {BANNER_COPY.installed}
        </p>
      </section>
    )
  }

  const kind = bannerKind(target)
  if (!kind || isBannerHidden(prefs)) return null

  const onNotNow = () => setPrefs(dismissBanner())

  const onAndroidInstall = async () => {
    if (prompting) return
    if (target.mode !== "android-prompt") {
      setSheet("android")
      return
    }
    setPrompting(true)
    const outcome = await promptInstall()
    setPrompting(false)
    if (outcome === "accepted") {
      markBannerInstalled()
      setJustInstalled(true)
    } else if (outcome === "unavailable") {
      setSheet("android")
    }
  }

  const android = kind === "android" || kind === "android-link"
  const iosKind = iosGuideKind(target)

  let cta
  if (kind === "android") {
    cta = (
      <Button variant="brand" size="sm" loading={prompting} onClick={() => void onAndroidInstall()}>
        {BANNER_COPY.androidCta}
      </Button>
    )
  } else if (kind === "android-link") {
    cta = (
      <Button variant="brand" size="sm" href={INSTALL_PATH}>
        {BANNER_COPY.androidCta}
      </Button>
    )
  } else if (kind === "ios-sheet") {
    cta = (
      <>
        <Button variant="brand" size="sm" onClick={() => setSheet("ios")}>
          {BANNER_COPY.iosCta}
        </Button>
        <span className={styles.note}>{BANNER_COPY.iosCtaNote}</span>
      </>
    )
  } else {
    cta = (
      <Button variant="brand" size="sm" href={INSTALL_PATH}>
        {BANNER_COPY.iosCta}
      </Button>
    )
  }

  const title = android ? BANNER_COPY.androidTitle : BANNER_COPY.iosTitle

  return (
    <section className={styles.banner} aria-label={title}>
      <button
        type="button"
        className={styles.notNow}
        onClick={onNotNow}
        aria-label={BANNER_COPY.notNow}
      >
        <Icon icon="mdi:close" width={18} height={18} aria-hidden="true" />
      </button>

      <GoatzaTile size={48} />

      <div className={styles.copy}>
        <p className={styles.title}>{title}</p>
        <p className={styles.text}>{android ? BANNER_COPY.androidText : BANNER_COPY.iosText}</p>
        <div className={styles.ctaRow}>{cta}</div>
      </div>

      {sheet === "android" && <AndroidMenuSheet onClose={() => setSheet(null)} />}
      {sheet === "ios" && iosKind && (
        <IosStepsSheet
          kind={iosKind}
          onGotIt={() => {
            gotIt.current = true
          }}
          onClose={() => {
            setSheet(null)
            if (gotIt.current) {
              gotIt.current = false
              setPrefs(snoozeBanner())
            }
          }}
        />
      )}
    </section>
  )
}
