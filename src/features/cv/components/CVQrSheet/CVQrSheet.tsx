"use client"

/**
 * The CV's QR code, sized for the situation it exists for: a coach at a trial,
 * holding their own phone, scanning off the player's screen across a table.
 *
 * That is why it is a full sheet rather than a chip on the page — it has to be
 * big, it has to be high contrast, and nothing else may compete with it. The
 * symbol is drawn as one SVG path from `qrShape`, the same helper the share
 * card uses, so the two encodings cannot drift.
 *
 * The white padding around the symbol is LAYOUT, not path quiet-zone — the
 * reason is in qr.ts: the viewBox stays equal to the symbol, so the drawn size
 * is the scannable size and nothing has to correct for margin twice. The panel
 * is white in both themes for the same reason a printed QR is: a dark-mode
 * inversion is a different symbol to a scanner tuned for light-on-dark.
 */

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react"
import { createPortal } from "react-dom"
import { Icon } from "@iconify/react"

import { useToast } from "@/shared/components/ui/Toast/Toast"
import { qrShape } from "@/features/profile/utils/shareCard/qr"
import styles from "./CVQrSheet.module.css"

/** Module-level so useSyncExternalStore doesn't resubscribe every render. */
const subscribeToNothing = () => () => {}

interface CVQrSheetProps {
  open: boolean
  onClose: () => void
  /** The absolute CV URL — what gets encoded, printed and copied. */
  url: string
  /** Whose CV, for the sheet's own labelling. */
  name: string
}

function CVQrSheetInner({ onClose, url, name }: Omit<CVQrSheetProps, "open">) {
  const toast = useToast()
  const titleId = useId()
  const sheetRef = useRef<HTMLDivElement>(null)

  // Pure geometry, and the URL only changes when the sheet is reopened for a
  // different profile — memoised so a re-render never re-encodes.
  const qr = useMemo(() => qrShape(url), [url])

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
      // Clipboard is permission-gated and blocked outright in some in-app
      // browsers. Show the URL so it can still be copied by hand.
      toast.show({
        title: "Couldn't copy automatically",
        message: url,
        variant: "warning",
        position: "top-center",
        duration: 5000,
      })
    }
  }

  const handleNativeShare = async () => {
    try {
      await navigator.share({ title: `${name} — Sports CV`, url })
    } catch {
      // AbortError when the sheet is dismissed. Nothing to report.
    }
  }

  // ── Modal mechanics (mirrors ShareCardSheet) ───────────────

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    sheetRef.current?.focus()
    return () => previouslyFocused?.focus?.()
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [onClose])

  return createPortal(
    <div
      className={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={sheetRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className={styles.handle} aria-hidden="true" />

        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            Scan this CV
          </h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close QR code"
          >
            <Icon icon="mdi:close" width={20} height={20} />
          </button>
        </div>

        <p className={styles.sub}>
          Point a camera at this to open {name}&apos;s CV.
        </p>

        <div className={styles.qrPanel}>
          <svg
            className={styles.qr}
            viewBox={`0 0 ${qr.size} ${qr.size}`}
            role="img"
            aria-label={`QR code for ${url}`}
            /* Crisp module edges at any size — the default smoothing turns a
               scaled-up symbol into grey fringes that some readers refuse. */
            shapeRendering="crispEdges"
          >
            <path d={qr.d} fill="#000000" />
          </svg>
        </div>

        <p className={styles.url}>{url}</p>

        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={handleCopy}>
            <Icon icon="mdi:link-variant" width={17} height={17} />
            Copy link
          </button>

          {canNativeShare && (
            <button
              type="button"
              className={styles.secondary}
              onClick={handleNativeShare}
            >
              <Icon icon="mdi:export-variant" width={17} height={17} />
              Share via…
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

export default function CVQrSheet({ open, ...rest }: CVQrSheetProps) {
  // createPortal needs `document`, so nothing may render on the server pass.
  const mounted = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false
  )

  // Gated rather than hidden, so the symbol is only encoded once the sheet is
  // actually opened.
  if (!open || !mounted) return null

  return <CVQrSheetInner {...rest} />
}
