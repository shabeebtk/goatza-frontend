"use client"

import { useMemo, useState } from "react"
import { Icon } from "@iconify/react"

import { qrShape } from "@/features/profile/utils/shareCard/qr"
import { promptInstall } from "@/core/pwa/installPrompt"
import { Button } from "@/shared/components/ui"
import { DESKTOP_COPY } from "../../installCopy"
import { installDisplayUrl, installUrl } from "../../installLinks"
import HomeScreenIllustration from "../HomeScreenIllustration/HomeScreenIllustration"
import Headline from "./Headline"
import { Pitch } from "./PitchHero"
import styles from "./InstallPage.module.css"

/**
 * A computer: Goatza is a phone app, so the page hands over to the phone with
 * a QR code of this same page (which then shows that phone's own steps).
 * Chrome and Edge can also install it here; that card shows only when the
 * browser has actually offered its prompt.
 *
 * No sign-in link of its own: signed out, PublicNav above the page already
 * carries Log in and Sign up.
 */
export default function DesktopInstall({
  canPrompt,
  isMacSafari,
}: {
  canPrompt: boolean
  isMacSafari: boolean
}) {
  const url = installUrl()
  const qr = useMemo(() => qrShape(url), [url])
  const [prompting, setPrompting] = useState(false)

  const onInstall = async () => {
    if (prompting) return
    setPrompting(true)
    await promptInstall()
    setPrompting(false)
  }

  return (
    <div className={`${styles.page} ${styles.pageWide}`}>
      <div className={styles.desk}>
        <header className={styles.deskHeader}>
          <span className={styles.deskWordmark} aria-hidden="true">
            GOATZA
          </span>
        </header>

        <div className={styles.columns}>
          <div className={styles.copyCol}>
            <Headline top={DESKTOP_COPY.headlineTop} bottom={DESKTOP_COPY.headlineBottom} />
            <p className={styles.lede}>{DESKTOP_COPY.lede}</p>

            <div className={styles.qrCard}>
              <div className={styles.qrPanel}>
                <svg
                  className={styles.qr}
                  viewBox={`0 0 ${qr.size} ${qr.size}`}
                  role="img"
                  aria-label={DESKTOP_COPY.qrLabel}
                  shapeRendering="crispEdges"
                >
                  <path d={qr.d} className={styles.qrPath} />
                </svg>
              </div>
              <div className={styles.qrText}>
                <p className={styles.qrTitle}>{DESKTOP_COPY.qrTitle}</p>
                <p className={styles.qrSub}>{DESKTOP_COPY.qrSub(installDisplayUrl())}</p>
              </div>
            </div>
          </div>

          <div className={styles.artCol}>
            <div className={styles.pitchPanel} aria-hidden="true">
              <Pitch />
              <HomeScreenIllustration className={styles.heroPhone} />
            </div>
          </div>
        </div>

        {canPrompt && (
          <div className={styles.computerCard}>
            <div className={styles.computerText}>
              <p className={styles.computerTitle}>{DESKTOP_COPY.computerTitle}</p>
              <p className={styles.mutedLine}>{DESKTOP_COPY.computerText}</p>
            </div>
            <Button
              variant="brand"
              loading={prompting}
              leftIcon={<Icon icon="mdi:monitor-arrow-down" width={18} height={18} />}
              onClick={() => void onInstall()}
            >
              {DESKTOP_COPY.computerCta}
            </Button>
          </div>
        )}

        {isMacSafari && <p className={styles.mutedLine}>{DESKTOP_COPY.macSafari}</p>}
      </div>
    </div>
  )
}
