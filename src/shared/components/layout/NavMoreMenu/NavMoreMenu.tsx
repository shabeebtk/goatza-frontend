"use client"

/**
 * NavMoreMenu — the desktop top bar's overflow panel.
 *
 * The bar holds the destinations worth a permanent place; everything else
 * lives behind "More". Both shells use this one component: AppNav fills it
 * from getDesktopMore(), OrgNav from its own inline list.
 *
 * Why portalled rather than absolutely positioned inside the bar, like the
 * avatar dropdown next to it: the bar is a fixed, overflow-managed strip and
 * the panel is wider than the trigger, so a panel positioned inside it is at
 * the mercy of the bar's own clipping and stacking. Rendered into <body> and
 * placed from the trigger's rect, it is clipped by nothing and clamped to the
 * viewport instead.
 *
 * Closing follows the avatar dropdown's rules exactly — outside pointerdown,
 * Escape, and useCloseOnScroll, because once the trigger has scrolled away
 * the panel is hanging next to nothing.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { Icon } from "@iconify/react"
import { useCloseOnScroll } from "@/shared/hooks/useCloseOnScroll"
import useIsMounted from "@/shared/hooks/useIsMounted"
import { returnFocus } from "@/shared/services/focusReturn"
import styles from "./NavMoreMenu.module.css"

/**
 * A destination. `disabled` renders it dimmed and unclickable — the panel is
 * destinations only, so there is no action row type: switching account and
 * logging out belong to the avatar dropdown at the other end of the cluster.
 */
export type MoreMenuRow = {
  kind: "link"
  id: string
  label: string
  href: string
  icon: string
  active?: boolean
  disabled?: boolean
  comingSoon?: boolean
}

export interface NavMoreMenuProps {
  open: boolean
  onClose: () => void
  /** The button the panel hangs off. */
  anchorRef: React.RefObject<HTMLElement | null>
  /** Destinations, in order. */
  rows: readonly MoreMenuRow[]
  label?: string
}

const PANEL_WIDTH = 248
/** Gap between the trigger and the panel, and from the viewport edge. */
const OFFSET = 8
const EDGE = 12

export default function NavMoreMenu({
  open,
  onClose,
  anchorRef,
  rows,
  label = "More",
}: NavMoreMenuProps) {
  const mounted = useIsMounted()
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

  const place = useCallback(() => {
    const anchor = anchorRef.current
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    setPosition({
      top: rect.bottom + OFFSET,
      // Under the trigger, but never past the right edge of the window.
      left: Math.max(EDGE, Math.min(rect.left, window.innerWidth - PANEL_WIDTH - EDGE)),
    })
  }, [anchorRef])

  // Placed in an effect rather than a layout effect: useLayoutEffect warns
  // when a client component is server-rendered, and nothing is painted at the
  // wrong place anyway — the panel renders null until it has a position.
  useEffect(() => {
    if (!open) return
    place()
    window.addEventListener("resize", place)
    return () => window.removeEventListener("resize", place)
  }, [open, place])

  useCloseOnScroll(open, onClose)

  // Outside pointerdown and Escape, the same two the avatar dropdown uses.
  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (panelRef.current?.contains(target)) return
      if (anchorRef.current?.contains(target)) return // its own toggle handles it
      onClose()
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.stopPropagation()
      onClose()
    }

    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open, onClose, anchorRef])

  // Focus the first row on open and hand it back to the trigger on close, so
  // the panel is reachable without a mouse.
  useEffect(() => {
    if (!open) return
    const trigger = anchorRef.current
    const first = panelRef.current?.querySelector<HTMLElement>("[data-more-row]")
    first?.focus({ preventScroll: true })
    return () => returnFocus(trigger)
  }, [open, anchorRef])

  if (!mounted || !open || !position) return null

  const renderRow = (row: MoreMenuRow) => {
    // Nowhere to go yet: a span, so it is never focusable and never a dead
    // link, with the chip saying why.
    if (row.disabled) {
      return (
        <span
          key={row.id}
          className={`${styles.row} ${styles.rowDisabled}`}
          aria-disabled="true"
        >
          <span className={styles.rowIcon} aria-hidden="true">
            <Icon icon={row.icon} width={18} height={18} />
          </span>
          {row.label}
          {row.comingSoon && <span className={styles.soon}>Soon</span>}
        </span>
      )
    }

    return (
      <Link
        key={row.id}
        href={row.href}
        data-more-row=""
        role="menuitem"
        className={`${styles.row} ${row.active ? styles.rowActive : ""}`}
        aria-current={row.active ? "page" : undefined}
        onClick={onClose}
      >
        <span className={styles.rowIcon} aria-hidden="true">
          <Icon icon={row.icon} width={18} height={18} />
        </span>
        {row.label}
      </Link>
    )
  }

  return createPortal(
    <div
      ref={panelRef}
      className={styles.panel}
      style={{ top: position.top, left: position.left, width: PANEL_WIDTH }}
      role="menu"
      aria-label={label}
    >
      {rows.map(renderRow)}
    </div>,
    document.body
  )
}
