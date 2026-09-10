"use client"

/**
 * The share control on a recruitment detail page, and the small action sheet
 * behind it.
 *
 * Three ways out, in the order people reach for them:
 *   1. Send in a message → the existing ShareSheet, targeting this posting.
 *      The only one that needs an account, so the parent owns it.
 *   2. Copy link        → the canonical PUBLIC url (/r/<id>). Works logged out,
 *      which is the point: most of the group chat it lands in has no account.
 *   3. Share via…       → navigator.share, hidden entirely when unavailable.
 *      Feature-detected rather than try/caught — an option that does nothing on
 *      desktop Chrome is worse than an option that isn't there.
 *
 * The button used to open ShareSheet directly, so "share" meant exactly one
 * thing: forward it to somebody already on Goatza. A trial poster is shared
 * outward far more often than inward, and the link had no way out of the app.
 *
 * Direct sibling of ProfileShareMenu — same scrim, same Esc handling, same
 * clipboard fallback — but deliberately not a generalisation of it: that one
 * carries a share card, a CV sheet, Report and Block, none of which a
 * recruitment has, and folding the two together would mean half a dozen props
 * that are only ever set on one side.
 *
 * The TRIGGER is the host's, passed in as a class name. The detail page renders
 * this in two shapes — a 44px icon button in the action bars, a small text
 * button in the organiser's card footer — and lifting either style in here
 * would mean this component knowing about RecruitmentDetail's stylesheet.
 */

import { useEffect, useRef, useState } from "react"
import { Icon } from "@iconify/react"

import { useShareRecruitment } from "../../hooks/useShareRecruitment"
import styles from "./RecruitmentShareMenu.module.css"

interface RecruitmentShareMenuProps {
  recruitmentId: string
  /** Posting title — the OS share sheet's headline. */
  title: string
  /** Club name, for the share sheet's one-line body. */
  orgName?: string
  /**
   * Open the in-app ShareSheet. Omitted for a viewer with no session to send a
   * message from, which simply drops that row.
   */
  onSendInMessage?: () => void
  /** The host's own button styling — see the header note. */
  triggerClassName?: string
  /** Icon-only trigger, or an icon plus the word "Share". */
  variant?: "icon" | "text"
  /**
   * Which way the sheet opens. "up" for the mobile sticky bar, which sits on
   * the bottom edge of the viewport and would otherwise open off-screen.
   */
  placement?: "down" | "up"
}

export default function RecruitmentShareMenu({
  recruitmentId,
  title,
  orgName,
  onSendInMessage,
  triggerClassName,
  variant = "icon",
  placement = "down",
}: RecruitmentShareMenuProps) {
  const [open, setOpen] = useState(false)
  const { canNativeShare, copyLink, nativeShare } = useShareRecruitment(recruitmentId)

  // Focus returns to the trigger on Esc, or a keyboard user is dropped at the
  // top of the document every time they dismiss the sheet.
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener("keydown", close)
    return () => document.removeEventListener("keydown", close)
  }, [open])

  return (
    <span className={styles.wrap}>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Share recruitment"
        title="Share"
      >
        <Icon
          icon="mdi:share-variant-outline"
          width={variant === "text" ? 13 : 18}
          height={variant === "text" ? 13 : 18}
        />
        {variant === "text" && "Share"}
      </button>

      {open && (
        <>
          {/* Click-outside catcher. A plain sibling rather than a document
              listener, so a tap on the trigger itself toggles instead of
              closing-then-reopening. */}
          <span
            className={styles.scrim}
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          <div
            className={`${styles.menu} ${placement === "up" ? styles.menuUp : ""}`}
            role="menu"
          >
            {onSendInMessage && (
              <button
                type="button"
                role="menuitem"
                className={styles.item}
                onClick={() => {
                  setOpen(false)
                  onSendInMessage()
                }}
              >
                <Icon icon="mdi:send-outline" width={17} height={17} />
                Send in a message
              </button>
            )}

            <button
              type="button"
              role="menuitem"
              className={styles.item}
              onClick={() => {
                setOpen(false)
                void copyLink()
              }}
            >
              <Icon icon="mdi:link-variant" width={17} height={17} />
              Copy link
            </button>

            {canNativeShare && (
              <button
                type="button"
                role="menuitem"
                className={styles.item}
                onClick={() => {
                  setOpen(false)
                  void nativeShare({ title, orgName })
                }}
              >
                <Icon icon="mdi:export-variant" width={17} height={17} />
                Share via…
              </button>
            )}
          </div>
        </>
      )}
    </span>
  )
}
