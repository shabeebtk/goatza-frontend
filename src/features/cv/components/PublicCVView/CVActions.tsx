"use client"

/**
 * The CV's action row — the only interactive part of an otherwise static page,
 * kept in its own client island so the CV itself stays a server component.
 *
 * Three actions, in the order they get used at a trial:
 *   1. Save as PDF   → `window.print()`. There is no server-rendered PDF and
 *      that is deliberate (spec §2.6, v2): the browser's own print dialog
 *      already produces a correct, selectable, correctly-paginated PDF from the
 *      print stylesheet, on every platform, with nothing to maintain.
 *   2. QR            → the sheet a coach scans.
 *   3. Copy link     → the absolute CV URL.
 *   4. Share via…    → navigator.share, hidden entirely when unavailable.
 *      Feature-detected rather than try/caught, like ProfileShareMenu: a button
 *      that does nothing on desktop Chrome is worse than a button that is not
 *      there.
 *
 * The whole row is hidden in print — see the `@media print` block in
 * PublicCVView.module.css.
 */

import { useState, useSyncExternalStore } from "react"
import { Icon } from "@iconify/react"

import { useToast } from "@/shared/components/ui/Toast/Toast"
import CVQrSheet from "../CVQrSheet/CVQrSheet"
import styles from "./PublicCVView.module.css"

/** Module-level so useSyncExternalStore doesn't resubscribe every render. */
const subscribeToNothing = () => () => {}

export default function CVActions({
  url,
  name,
}: {
  url: string
  name: string
}) {
  const toast = useToast()
  const [qrOpen, setQrOpen] = useState(false)

  const canNativeShare = useSyncExternalStore(
    subscribeToNothing,
    () =>
      typeof navigator !== "undefined" && typeof navigator.share === "function",
    () => false
  )

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      toast.show({
        title: "Link copied",
        variant: "success",
        position: "top-center",
        duration: 2000,
      })
    } catch {
      toast.show({
        title: "Couldn't copy automatically",
        message: url,
        variant: "warning",
        position: "top-center",
        duration: 5000,
      })
    }
  }

  const handleShare = async () => {
    try {
      await navigator.share({ title: `${name} — Sports CV`, url })
    } catch {
      // AbortError when the OS sheet is dismissed. Nothing to report.
    }
  }

  return (
    <>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.actionPrimary}
          onClick={() => window.print()}
        >
          <Icon icon="mdi:file-download-outline" width={17} height={17} />
          Save as PDF
        </button>

        <button
          type="button"
          className={styles.action}
          onClick={() => setQrOpen(true)}
        >
          <Icon icon="mdi:qrcode" width={17} height={17} />
          QR code
        </button>

        <button type="button" className={styles.action} onClick={handleCopy}>
          <Icon icon="mdi:link-variant" width={17} height={17} />
          Copy link
        </button>

        {canNativeShare && (
          <button type="button" className={styles.action} onClick={handleShare}>
            <Icon icon="mdi:export-variant" width={17} height={17} />
            Share via…
          </button>
        )}
      </div>

      <CVQrSheet
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        url={url}
        name={name}
      />
    </>
  )
}
