"use client"

import { useRef } from "react"
import { Icon } from "@iconify/react"

import type { PwaOs } from "@/core/pwa/platform"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { copyText } from "../../copyText"
import { IN_APP_COPY, type BrowserName } from "../../installCopy"
import { chromeIntentHref, installDisplayUrl, installUrl } from "../../installLinks"
import Headline from "./Headline"
import { Wordmark } from "./PitchHero"
import styles from "./InstallPage.module.css"

/** The link to paste into the right browser, and a Copy button that works in-app. */
function CopyLink({ browser }: { browser: BrowserName }) {
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement>(null)

  const onCopy = async () => {
    const url = installUrl()
    if (await copyText(url)) {
      toast.show({ title: IN_APP_COPY.copied, variant: "success", position: "top-center", duration: 2000 })
      return
    }
    // Leave it selected so a long-press copies it by hand.
    inputRef.current?.select()
    toast.show({
      title: IN_APP_COPY.copyFailed,
      message: url,
      variant: "warning",
      position: "top-center",
      duration: 5000,
    })
  }

  return (
    <div className={styles.copyBlock}>
      <p className={styles.mutedLine}>{IN_APP_COPY.copyPrompt(browser)}</p>
      <div className={styles.copyField}>
        <input
          ref={inputRef}
          className={styles.copyInput}
          value={installDisplayUrl()}
          readOnly
          aria-label={IN_APP_COPY.linkLabel}
          onFocus={(event) => event.currentTarget.select()}
        />
        <button type="button" className={styles.copyButton} onClick={() => void onCopy()}>
          <Icon icon="mdi:content-copy" width={18} height={18} aria-hidden="true" />
          {IN_APP_COPY.copyLink}
        </button>
      </div>
    </div>
  )
}

/**
 * An in-app browser (Instagram, Facebook, a WebView), or the wrong browser on
 * an iPhone (Firefox, Edge, Opera): nothing can be installed from here, so the
 * page gets the person into Safari or Chrome. Android has a direct way (an
 * intent that opens Chrome); an iPhone app only has its own menu.
 *
 * The main action is what stays on screen on a phone (the sticky actions
 * area): "Open in Chrome" on Android, with the copy link after it, and the
 * copy link itself on an iPhone.
 */
export default function InAppInstall({
  os,
  appName,
  kind,
}: {
  os: PwaOs
  appName: string | null
  kind: "in-app" | "ios-other"
}) {
  const browser: BrowserName = os === "ios" ? "Safari" : "Chrome"
  const android = os === "android"

  return (
    <div className={styles.page}>
      <Wordmark />
      <div className={`${styles.body} ${styles.bodyTop}`}>
        <span className={styles.compass} aria-hidden="true">
          <Icon icon="mdi:compass-outline" width={30} height={30} />
        </span>
        <Headline top={IN_APP_COPY.headlineTop(browser)} bottom={IN_APP_COPY.headlineBottom} />
        <p className={styles.lede}>
          {kind === "in-app"
            ? IN_APP_COPY.inside(appName, browser)
            : IN_APP_COPY.otherBrowser(browser)}
        </p>

        {os === "ios" && kind === "in-app" && (
          <ol className={styles.numbered}>
            {IN_APP_COPY.iosSteps.map((step, index) => (
              <li key={step} className={styles.numberedRow}>
                <span className={styles.number} aria-hidden="true">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        )}

      </div>

      <div className={styles.actions}>
        {android ? (
          <>
            <a className={styles.brandLink} href={chromeIntentHref()}>
              <Icon icon="mdi:google-chrome" width={20} height={20} aria-hidden="true" />
              {IN_APP_COPY.openInChrome}
            </a>
            <p className={styles.ctaNote}>{IN_APP_COPY.thenTapInstall}</p>
          </>
        ) : (
          <CopyLink browser={browser} />
        )}
      </div>

      {android && (
        <div className={styles.afterActions}>
          <CopyLink browser={browser} />
        </div>
      )}
    </div>
  )
}
