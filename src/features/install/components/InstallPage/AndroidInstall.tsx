"use client"

import { useState } from "react"

import { Button } from "@/shared/components/ui"
import { promptInstall } from "@/core/pwa/installPrompt"
import { ANDROID_COPY } from "../../installCopy"
import AndroidMenuSheet from "../AndroidMenuSheet/AndroidMenuSheet"
import BenefitsList from "../BenefitsList/BenefitsList"
import Headline from "./Headline"
import PitchHero from "./PitchHero"
import styles from "./InstallPage.module.css"

/**
 * Android: one tap when Chrome has offered its prompt, the menu steps when it
 * has not. The same button does both, so when the prompt arrives while the page
 * is open the button simply becomes one-tap. An accepted install flips the
 * whole page to the Installed panel (the store's installedNow), not this.
 */
export default function AndroidInstall({ canPrompt }: { canPrompt: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [prompting, setPrompting] = useState(false)

  const onInstall = async () => {
    if (prompting) return
    if (!canPrompt) {
      setMenuOpen(true)
      return
    }
    setPrompting(true)
    const outcome = await promptInstall()
    setPrompting(false)
    if (outcome === "dismissed") setDismissed(true)
    else if (outcome === "unavailable") setMenuOpen(true)
  }

  return (
    <div className={styles.page}>
      <PitchHero />
      <div className={styles.body}>
        <Headline top={ANDROID_COPY.headlineTop} bottom={ANDROID_COPY.headlineBottom} />
        <p className={styles.lede}>{ANDROID_COPY.lede}</p>
        <BenefitsList />
      </div>
      <div className={styles.actions}>
        <Button variant="brand" fullWidth loading={prompting} onClick={() => void onInstall()}>
          {ANDROID_COPY.cta}
        </Button>
        <p className={styles.ctaNote}>{ANDROID_COPY.ctaNote}</p>
        {dismissed && (
          <p className={styles.mutedLine} role="status">
            {ANDROID_COPY.dismissed}
          </p>
        )}
      </div>
      {menuOpen && <AndroidMenuSheet onClose={() => setMenuOpen(false)} />}
    </div>
  )
}
