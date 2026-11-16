"use client"

import { Button } from "@/shared/components/ui"
import { IOS_SHEET_COPY } from "../../installCopy"
import { INSTALL_PATH } from "../../installLinks"
import { iosStepsFor, type IosGuideKind } from "../../iosSteps"
import InstallSheet from "../InstallSheet/InstallSheet"
import IosStepsGuide from "../IosStepsGuide/IosStepsGuide"
import styles from "./IosStepsSheet.module.css"

/**
 * The iPhone steps as a compact sheet, opened from the feed banner and the
 * landing page. "Got it" tells the caller (the banner hides for a few days);
 * "Full guide" leaves for /install. On Safari 26+ a pointer says the •••
 * button is just under the sheet. Mount it only while open.
 */
export default function IosStepsSheet({
  kind,
  onClose,
  onGotIt,
}: {
  kind: IosGuideKind
  onClose: () => void
  onGotIt?: () => void
}) {
  return (
    <InstallSheet
      title={IOS_SHEET_COPY.title}
      onClose={onClose}
      footer={(close, navigateAway) => (
        <div className={styles.footer}>
          <Button
            variant="primary"
            fullWidth
            onClick={() => {
              onGotIt?.()
              close()
            }}
          >
            {IOS_SHEET_COPY.gotIt}
          </Button>
          <button
            type="button"
            className={styles.fullGuide}
            onClick={() => navigateAway(INSTALL_PATH)}
          >
            {IOS_SHEET_COPY.fullGuide}
          </button>
          {kind === "modern" && (
            <p className={styles.belowHint} aria-hidden="true">
              {IOS_SHEET_COPY.belowHint}
            </p>
          )}
        </div>
      )}
    >
      {() => <IosStepsGuide steps={iosStepsFor(kind)} variant="list" />}
    </InstallSheet>
  )
}
