"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import type { InstallTarget } from "@/core/pwa/useInstallTarget"
import { qrShape } from "@/features/profile/utils/shareCard/qr"
import BenefitsList from "@/features/install/components/BenefitsList/BenefitsList"
import HomeScreenIllustration from "@/features/install/components/HomeScreenIllustration/HomeScreenIllustration"
import IosStepsSheet from "@/features/install/components/IosStepsSheet/IosStepsSheet"
import { useInstallAction } from "@/features/install/hooks/useInstallAction"
import { LANDING_COPY } from "@/features/install/installCopy"
import { INSTALL_PATH, installDisplayUrl, installUrl } from "@/features/install/installLinks"
import { iosGuideKind } from "@/features/install/iosSteps"
import { Button } from "@/shared/components/ui"
import landing from "../LandingPage.module.css"
import styles from "./LandingInstall.module.css"

/** The QR of /install. Client only: the origin is not known on the server. */
function InstallQr() {
  const url = installUrl()
  const qr = useMemo(() => qrShape(url), [url])
  return (
    <svg
      className={styles.qr}
      viewBox={`0 0 ${qr.size} ${qr.size}`}
      role="img"
      aria-label={LANDING_COPY.qrLabel}
      shapeRendering="crispEdges"
    >
      <path d={qr.d} className={styles.qrPath} />
    </svg>
  )
}

function isAndroidish(target: InstallTarget): boolean {
  return (
    target.mode === "android-prompt" ||
    target.mode === "android-menu" ||
    (target.mode === "in-app" && target.os === "android")
  )
}

function isIosish(target: InstallTarget): boolean {
  return (
    target.mode === "ios-safari" ||
    target.mode === "ios-chrome" ||
    target.mode === "ios-other" ||
    (target.mode === "in-app" && target.os === "ios")
  )
}

/**
 * "Goatza in your pocket": the app, before the final call to action. On a
 * phone, one full-width button that does the right thing for that phone; from
 * 1024px, a QR code to hand over to the phone (and, where the browser offers
 * it, an install on this computer). Gone inside the installed app.
 */
export default function AppSection() {
  const router = useRouter()
  const { target, prompting, promptNow } = useInstallAction()
  const [sheetOpen, setSheetOpen] = useState(false)

  if (target.mode === "installed") return null

  const iosKind = iosGuideKind(target)
  const androidish = isAndroidish(target)
  const iosish = isIosish(target)

  let cta
  if (target.mode === "android-prompt") {
    cta = (
      <Button
        variant="brand"
        size="lg"
        fullWidth
        loading={prompting}
        onClick={async () => {
          if ((await promptNow()) === "unavailable") router.push(INSTALL_PATH)
        }}
      >
        {LANDING_COPY.ctaAndroid}
      </Button>
    )
  } else if (iosKind) {
    cta = (
      <Button variant="brand" size="lg" fullWidth onClick={() => setSheetOpen(true)}>
        {LANDING_COPY.ctaIos}
      </Button>
    )
  } else {
    cta = (
      <Button variant="brand" size="lg" fullWidth href={INSTALL_PATH}>
        {androidish
          ? LANDING_COPY.ctaAndroid
          : iosish
            ? LANDING_COPY.ctaIos
            : LANDING_COPY.heroNeutral}
      </Button>
    )
  }

  const note =
    target.mode === "android-prompt" || target.mode === "android-menu"
      ? LANDING_COPY.noteAndroid
      : iosKind
        ? LANDING_COPY.noteIos(iosKind === "chrome" ? "Chrome" : "Safari")
        : null

  const canPromptHere = target.mode === "desktop" && target.canPrompt

  return (
    <section
      id="app"
      className={`${landing.section} ${styles.appSection}`}
      aria-labelledby="app-title"
    >
      <div className={`container ${styles.appInner}`}>
        <div className={styles.appCopy}>
          <div className="reveal">
            <div className={landing.sectionLabel}>
              <span className={landing.sectionLabelLine} />
              {LANDING_COPY.sectionLabel}
            </div>
            <h2 id="app-title" className={landing.sectionTitle}>
              {LANDING_COPY.headlineTop}
              <br />
              {LANDING_COPY.headlineBottomPlain}{" "}
              <span className={styles.accent}>{LANDING_COPY.headlineBottomAccent}</span>
            </h2>
            <p className={styles.lede}>{LANDING_COPY.lede}</p>
          </div>

          <BenefitsList items={LANDING_COPY.benefits} tone="theme" className={styles.benefits} />

          <div className={styles.phoneCta}>
            {cta}
            {note && <p className={styles.note}>{note}</p>}
          </div>

          <div className={styles.deskCta}>
            <div className={styles.qrCard}>
              <div className={styles.qrPanel}>
                {target.mode === "unknown" ? (
                  <span className={styles.qrPlaceholder} aria-hidden="true" />
                ) : (
                  <InstallQr />
                )}
              </div>
              <div className={styles.qrText}>
                <p className={styles.qrTitle}>{LANDING_COPY.qrTitle}</p>
                <p className={styles.qrSub}>
                  {LANDING_COPY.qrSub(target.mode === "unknown" ? "goatza.com/install" : installDisplayUrl())}
                </p>
              </div>
            </div>
            {canPromptHere && (
              <button
                type="button"
                className={styles.computerLink}
                disabled={prompting}
                onClick={() => void promptNow()}
              >
                {LANDING_COPY.computerLink}
              </button>
            )}
          </div>
        </div>

        <div className={styles.appArt} aria-hidden="true">
          <div className={styles.pitchPanel}>
            <span className={styles.pitchCircle} />
            <HomeScreenIllustration />
          </div>
        </div>
      </div>

      {sheetOpen && iosKind && <IosStepsSheet kind={iosKind} onClose={() => setSheetOpen(false)} />}
    </section>
  )
}
