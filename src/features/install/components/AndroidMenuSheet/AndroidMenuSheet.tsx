"use client"

import { Icon } from "@iconify/react"

import { Button } from "@/shared/components/ui"
import { ANDROID_MENU_COPY } from "../../installCopy"
import InstallSheet from "../InstallSheet/InstallSheet"
import styles from "./AndroidMenuSheet.module.css"

/**
 * Installing from Chrome's own menu, for when there is no one-tap prompt yet
 * (Chrome holds it back until the person has been on the page a while) or the
 * prompt went away. Mount it only while open.
 */
export default function AndroidMenuSheet({ onClose }: { onClose: () => void }) {
  const [first, second, third] = ANDROID_MENU_COPY.steps

  return (
    <InstallSheet
      title={ANDROID_MENU_COPY.title}
      onClose={onClose}
      footer={(close) => (
        <Button variant="primary" fullWidth onClick={close}>
          {ANDROID_MENU_COPY.gotIt}
        </Button>
      )}
    >
      {() => (
        <div className={styles.content}>
          <p className={styles.intro}>{ANDROID_MENU_COPY.intro}</p>

          <ol className={styles.steps}>
            <li className={styles.step}>
              <span className={styles.number} aria-hidden="true">1</span>
              <span className={styles.stepText}>{first}</span>
              <span className={styles.key} aria-hidden="true">
                <Icon icon="mdi:dots-vertical" width={22} height={22} />
              </span>
            </li>
            <li className={styles.step}>
              <span className={styles.number} aria-hidden="true">2</span>
              <span className={styles.stepText}>{second}</span>
            </li>
            <li className={styles.step}>
              <span className={styles.number} aria-hidden="true">3</span>
              <span className={styles.stepText}>{third}</span>
            </li>
          </ol>

          <p className={styles.note}>
            {ANDROID_MENU_COPY.otherBrowsers}
            <br />
            {ANDROID_MENU_COPY.inAppTab}
          </p>
        </div>
      )}
    </InstallSheet>
  )
}
