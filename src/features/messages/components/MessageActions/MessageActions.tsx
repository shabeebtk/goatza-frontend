"use client"

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { createPortal } from "react-dom"
import { Icon } from "@iconify/react"
import styles from "./MessageActions.module.css"

/** Hold this long on touch before the menu opens. */
const LONG_PRESS_MS = 450
/** Movement past this many px is a scroll, not a press. */
const MOVE_TOLERANCE_PX = 10
/** Keep the menu this far from the viewport edges. */
const VIEWPORT_MARGIN = 8
/** Gap between the anchor point and the menu. */
const ANCHOR_GAP = 10
/** First-paint estimates, corrected by measurement before the browser paints. */
const MENU_W = 200
const MENU_H = 108

const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect

interface MessageActionsProps {
  /** Rendered message row. */
  children: React.ReactNode
  /** Own messages align their menu right, like the bubble. */
  isMine: boolean
  /** No menu at all when false (someone else's message, or still uploading). */
  canDelete: boolean
  onDelete: () => void
  /** Text to copy, when the message has a body worth copying. */
  copyText?: string
}

export default function MessageActions({
  children,
  isMine,
  canDelete,
  onDelete,
  copyText,
}: MessageActionsProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef(0)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  /** Where the menu is anchored: the finger, or the ⋯ button. */
  const pointRef = useRef<{ x: number; y: number } | null>(null)
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null)

  const hasActions = canDelete || Boolean(copyText)

  const closeMenu = useCallback(() => {
    setOpen(false)
    setConfirming(false)
    // Drop the position too — the next open must be measured afresh, never
    // flash at the previous message's coordinates.
    setAnchor(null)
    pointRef.current = null
  }, [])

  /**
   * Place the menu next to the anchor POINT, not the message row.
   *
   * Anchoring to the row can't work: rows are full-width, and a tall one (a
   * photo, a video, a shared card) leaves room neither below nor above, so the
   * menu ended up clamped to the top of the screen, nowhere near the message.
   * A point always has a good side — and the menu opens toward the middle of
   * the screen, so it never runs off an edge.
   */
  const place = useCallback(() => {
    const p = pointRef.current
    if (!p) return
    const el = menuRef.current
    // Measured once rendered; the estimates only cover the very first frame.
    const w = el?.offsetWidth || MENU_W
    const h = el?.offsetHeight || MENU_H
    const m = VIEWPORT_MARGIN

    // Open away from the nearer edge.
    let left = p.x < window.innerWidth / 2 ? p.x : p.x - w
    left = Math.max(m, Math.min(left, window.innerWidth - w - m))

    let top = p.y + ANCHOR_GAP
    if (top + h > window.innerHeight - m) top = p.y - h - ANCHOR_GAP
    top = Math.max(m, Math.min(top, window.innerHeight - h - m))

    setAnchor({ top, left })
  }, [])

  const openAt = useCallback(
    (x: number, y: number) => {
      pointRef.current = { x, y }
      setOpen(true)
    },
    []
  )

  // Re-measure before paint: on open, and whenever the menu changes height
  // (switching to the confirm step).
  useIsoLayoutEffect(() => {
    if (!open) return
    place()
  }, [open, confirming, place])

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
      timerRef.current = 0
    }
    startRef.current = null
  }, [])

  // ── Long press (touch only — a mouse uses the ⋯ button) ──────
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!hasActions || e.pointerType === "mouse") return
      const { clientX, clientY } = e
      startRef.current = { x: clientX, y: clientY }
      timerRef.current = window.setTimeout(() => {
        timerRef.current = 0
        if (navigator.vibrate) navigator.vibrate(12)
        // Anchored to the finger — the menu appears where the user is looking.
        openAt(clientX, clientY)
      }, LONG_PRESS_MS)
    },
    [hasActions, openAt]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const start = startRef.current
      if (!start || !timerRef.current) return
      if (
        Math.abs(e.clientX - start.x) > MOVE_TOLERANCE_PX ||
        Math.abs(e.clientY - start.y) > MOVE_TOLERANCE_PX
      ) {
        clearTimer()   // the user is scrolling
      }
    },
    [clearTimer]
  )

  useEffect(() => clearTimer, [clearTimer])

  // Close on Escape, and on scroll/resize (the anchor would be stale).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeMenu() }
    document.addEventListener("keydown", onKey)
    window.addEventListener("resize", closeMenu)
    window.addEventListener("scroll", closeMenu, true)
    return () => {
      document.removeEventListener("keydown", onKey)
      window.removeEventListener("resize", closeMenu)
      window.removeEventListener("scroll", closeMenu, true)
    }
  }, [open, closeMenu])

  const handleCopy = useCallback(async () => {
    if (!copyText) return
    try {
      await navigator.clipboard.writeText(copyText)
    } catch {
      /* clipboard blocked — nothing useful to say */
    }
    closeMenu()
  }, [copyText, closeMenu])

  const handleDelete = useCallback(() => {
    onDelete()
    closeMenu()
  }, [onDelete, closeMenu])

  return (
    <div
      ref={wrapRef}
      className={`${styles.wrap} ${open ? styles.wrapActive : ""}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={clearTimer}
      onPointerCancel={clearTimer}
      onContextMenu={(e) => {
        // Long press also fires the native context menu on some browsers.
        if (open) e.preventDefault()
      }}
    >
      {children}

      {hasActions && (
        <button
          type="button"
          className={`${styles.dots} ${isMine ? styles.dotsMine : styles.dotsTheirs}`}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            openAt(r.left + r.width / 2, r.bottom)
          }}
          aria-label="Message options"
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <Icon icon="mdi:dots-horizontal" width={16} height={16} />
        </button>
      )}

      {open && createPortal(
        <>
          <div className={styles.backdrop} onClick={closeMenu} />
          <div
            ref={menuRef}
            className={styles.menu}
            // Hidden for the one frame before it is measured and placed, so it
            // can never flash at the wrong spot.
            style={
              anchor
                ? { top: anchor.top, left: anchor.left }
                : { top: 0, left: 0, visibility: "hidden" }
            }
            role="menu"
          >
            {copyText && (
              <button
                type="button"
                className={styles.item}
                onClick={handleCopy}
                role="menuitem"
              >
                <Icon icon="mdi:content-copy" width={17} height={17} />
                Copy
              </button>
            )}

            {canDelete && !confirming && (
              <button
                type="button"
                className={`${styles.item} ${styles.itemDanger}`}
                onClick={() => setConfirming(true)}
                role="menuitem"
              >
                <Icon icon="mdi:delete-outline" width={17} height={17} />
                Delete
              </button>
            )}

            {canDelete && confirming && (
              <div className={styles.confirm}>
                <p className={styles.confirmText}>Delete for everyone?</p>
                <div className={styles.confirmRow}>
                  <button
                    type="button"
                    className={styles.confirmCancel}
                    onClick={closeMenu}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={styles.confirmDelete}
                    onClick={handleDelete}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        </>,
        document.body
      )}
    </div>
  )
}
