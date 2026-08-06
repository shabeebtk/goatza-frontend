"use client"

/**
 * The share button in a profile header, and the little action sheet behind it.
 *
 * Three ways out, in the order people reach for them:
 *   1. Send in a message → the existing ShareSheet, targeting this profile.
 *   2. Copy link        → the canonical absolute URL. Works logged out.
 *   3. Share via…       → navigator.share, hidden entirely when unavailable.
 *      Feature-detected rather than try/caught: an option that does nothing on
 *      desktop Chrome is worse than an option that isn't there.
 *
 * For an anonymous visitor, 2 and 3 work as-is — a link is a link — and only
 * "Send in a message" hits the login wall, because that one genuinely needs an
 * account.
 */

import { useEffect, useState, useSyncExternalStore } from "react"
import { Icon } from "@iconify/react"

import Button from "@/shared/components/ui/Button/Button"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import ShareSheet from "@/features/messages/components/ShareSheet/ShareSheet"
import type { ShareTarget } from "@/features/messages/services/conversations.api"
import ProfileSharePreview from "@/features/profile/components/ProfileSharePreview/ProfileSharePreview"
import { usePublicProfile } from "@/features/profile/context/PublicProfileContext"
import { profileUrl } from "@/shared/services/profileUrl"
import styles from "./ProfileShareMenu.module.css"

/** Module-level so useSyncExternalStore doesn't resubscribe every render. */
const subscribeToNothing = () => () => {}

interface ProfileShareMenuProps {
  target: ShareTarget
  username: string
  name: string
  avatarUrl?: string
  subtitle?: string
  isVerified?: boolean
}

export default function ProfileShareMenu({
  target,
  username,
  name,
  avatarUrl,
  subtitle,
  isVerified,
}: ProfileShareMenuProps) {
  const toast = useToast()
  const publicView = usePublicProfile()

  const [menuOpen, setMenuOpen] = useState(false)
  const [shareSheetOpen, setShareSheetOpen] = useState(false)

  // navigator.share exists on mobile Safari/Chrome and almost nowhere else.
  // Read through useSyncExternalStore so SSR and the first client render agree
  // (false), then flip — a bare `typeof navigator` check would hydrate-mismatch.
  const canNativeShare = useSyncExternalStore(
    subscribeToNothing,
    () => typeof navigator !== "undefined" && typeof navigator.share === "function",
    () => false
  )

  const url = profileUrl(
    username,
    target.type === "organization" ? "organization" : "user"
  )

  useEffect(() => {
    if (!menuOpen) return
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false)
    }
    document.addEventListener("keydown", close)
    return () => document.removeEventListener("keydown", close)
  }, [menuOpen])

  const handleSendInMessage = () => {
    setMenuOpen(false)
    if (publicView) {
      publicView.openLoginWall("send a profile to")
      return
    }
    setShareSheetOpen(true)
  }

  const handleCopyLink = async () => {
    setMenuOpen(false)
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
    setMenuOpen(false)
    try {
      await navigator.share({
        title: `${name} on Goatza`,
        text: subtitle ? `${name} — ${subtitle}` : `${name} on Goatza`,
        url,
      })
    } catch {
      // AbortError when the user dismisses the OS sheet. Nothing to report.
    }
  }

  return (
    <>
      <span className={styles.wrap}>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          aria-label={`Share ${name}'s profile`}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <Icon icon="mdi:share-variant-outline" width={18} height={18} />
        </Button>

        {menuOpen && (
          <>
            {/* Click-outside catcher. A plain sibling rather than a document
                listener, so a tap on the trigger itself toggles instead of
                closing-then-reopening. */}
            <span
              className={styles.scrim}
              onClick={() => setMenuOpen(false)}
              aria-hidden="true"
            />

            <div className={styles.menu} role="menu">
              <button
                type="button"
                role="menuitem"
                className={styles.item}
                onClick={handleSendInMessage}
              >
                <Icon icon="mdi:send-outline" width={17} height={17} />
                Send in a message
              </button>

              <button
                type="button"
                role="menuitem"
                className={styles.item}
                onClick={handleCopyLink}
              >
                <Icon icon="mdi:link-variant" width={17} height={17} />
                Copy link
              </button>

              {canNativeShare && (
                <button
                  type="button"
                  role="menuitem"
                  className={styles.item}
                  onClick={handleNativeShare}
                >
                  <Icon icon="mdi:export-variant" width={17} height={17} />
                  Share via…
                </button>
              )}
            </div>
          </>
        )}
      </span>

      <ShareSheet
        open={shareSheetOpen}
        onClose={() => setShareSheetOpen(false)}
        target={target}
        previewNode={
          <ProfileSharePreview
            name={name}
            username={username}
            avatarUrl={avatarUrl}
            subtitle={subtitle}
            kind={target.type === "organization" ? "organization" : "user"}
            isVerified={isVerified}
          />
        }
      />
    </>
  )
}
