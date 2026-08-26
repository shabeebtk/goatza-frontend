"use client"

/**
 * The share button in a profile header, and the little action sheet behind it.
 *
 * Four ways out, in the order people reach for them:
 *   1. Share card       → the generated image of this profile. First, because
 *      it is the one that ends up on an Instagram Story, which is the reason
 *      anyone opens this menu on a player. Individual profiles only —
 *      organizations have no card.
 *   2. Send in a message → the existing ShareSheet, targeting this profile.
 *   3. Copy link        → the canonical absolute URL. Works logged out.
 *   4. Share via…       → navigator.share, hidden entirely when unavailable.
 *      Feature-detected rather than try/caught: an option that does nothing on
 *      desktop Chrome is worse than an option that isn't there.
 *
 * For an anonymous visitor, 1, 3 and 4 work as-is — a card and a link are both
 * public artifacts — and only "Send in a message" hits the login wall, because
 * that one genuinely needs an account.
 */

import { useEffect, useState, useSyncExternalStore } from "react"
import { Icon } from "@iconify/react"

import Button from "@/shared/components/ui/Button/Button"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import CVQrSheet from "@/features/cv/components/CVQrSheet/CVQrSheet"
import { useCVSettings } from "@/features/cv/hooks/useCVSettings"
import { cvUrl } from "@/features/cv/services/cv.api"
import ShareSheet from "@/features/messages/components/ShareSheet/ShareSheet"
import type { ShareTarget } from "@/features/messages/services/conversations.api"
import ProfileSharePreview from "@/features/profile/components/ProfileSharePreview/ProfileSharePreview"
import BlockConfirmSheet from "@/features/moderation/components/BlockConfirmSheet/BlockConfirmSheet"
import ShareCardSheet from "@/features/profile/components/ShareCardSheet/ShareCardSheet"
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
  /**
   * Whether the viewer owns this profile. Only the owner gets the slot picker
   * (§5.3): a scout can forward a player's card, but nobody else gets to decide
   * which of that player's measurables it emphasises.
   */
  isOwnProfile?: boolean
  /**
   * Identity id — required to offer Block. Absent (an anonymous visitor, or a
   * caller that has not wired it) simply hides the row.
   */
  targetId?: string
  /** Already blocked by this viewer — the profile banner owns Unblock instead. */
  isBlockedByMe?: boolean
}

export default function ProfileShareMenu({
  target,
  username,
  name,
  avatarUrl,
  subtitle,
  isVerified,
  isOwnProfile = false,
  targetId,
  isBlockedByMe = false,
}: ProfileShareMenuProps) {
  const toast = useToast()
  const publicView = usePublicProfile()

  const [menuOpen, setMenuOpen] = useState(false)
  const [shareSheetOpen, setShareSheetOpen] = useState(false)
  const [cardSheetOpen, setCardSheetOpen] = useState(false)
  const [cvSheetOpen, setCvSheetOpen] = useState(false)
  const [blockSheetOpen, setBlockSheetOpen] = useState(false)

  // Block is offered only to a signed-in visitor looking at SOMEONE ELSE who
  // they have not already blocked. `publicView` is the logged-out rendering —
  // there is no actor to block on behalf of.
  const canBlock =
    !publicView && !isOwnProfile && !isBlockedByMe && Boolean(targetId)

  // Organizations have no generated card — a different composition and a
  // deliberately later build — so the entry simply is not offered for one.
  const hasCard = target.type === "user"

  // "Share CV" is the OWNER's action and nobody else's: a CV is a document its
  // subject chose to publish, and offering a scout a "share their CV" button
  // would put us in the business of forwarding it for them.
  //
  // Queried only once the menu is open, and never for an anonymous visitor.
  // The GET get-or-creates the settings row server-side, so firing it on every
  // profile render would write a row for anyone who merely looked at a share
  // button. A non-player's 403 lands in `error` and simply leaves the entry
  // hidden, which is the correct outcome.
  const canOwnCV = isOwnProfile && !publicView && target.type === "user"
  const { data: cvSettings } = useCVSettings(canOwnCV && menuOpen)
  const hasCV = canOwnCV && Boolean(cvSettings?.is_enabled)

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
          aria-label={`More options for ${name}`}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={() => setMenuOpen((v) => !v)}
        >
          {/* An overflow glyph, not a share glyph: this menu stopped being
              share-only when Block joined it, and a share icon that opens a
              destructive action is a mislabelled control. */}
          <Icon icon="mdi:dots-horizontal" width={18} height={18} />
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
              {hasCard && (
                <button
                  type="button"
                  role="menuitem"
                  className={styles.item}
                  onClick={() => {
                    setMenuOpen(false)
                    setCardSheetOpen(true)
                  }}
                >
                  <Icon icon="mdi:card-account-details-outline" width={17} height={17} />
                  Share card
                </button>
              )}

              {hasCV && (
                <button
                  type="button"
                  role="menuitem"
                  className={styles.item}
                  onClick={() => {
                    setMenuOpen(false)
                    setCvSheetOpen(true)
                  }}
                >
                  <Icon icon="mdi:file-account-outline" width={17} height={17} />
                  Share CV
                </button>
              )}

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

              {/* LAST, and the only destructive row — same placement rule the
                  post options sheet uses for Delete/Report. */}
              {canBlock && (
                <button
                  type="button"
                  role="menuitem"
                  className={`${styles.item} ${styles.itemDanger}`}
                  onClick={() => {
                    setMenuOpen(false)
                    setBlockSheetOpen(true)
                  }}
                >
                  <Icon icon="mdi:account-cancel-outline" width={17} height={17} />
                  Block @{username}
                </button>
              )}
            </div>
          </>
        )}
      </span>

      {blockSheetOpen && targetId && (
        <BlockConfirmSheet
          targetType={target.type === "organization" ? "organization" : "user"}
          targetId={targetId}
          username={username}
          name={name}
          onClose={() => setBlockSheetOpen(false)}
        />
      )}

      {hasCard && (
        <ShareCardSheet
          open={cardSheetOpen}
          onClose={() => setCardSheetOpen(false)}
          username={username}
          name={name}
          canCustomise={isOwnProfile}
        />
      )}

      {/* The QR sheet carries its own copy-link and navigator.share (feature
          detected there, hidden where unavailable), so "Share CV" is one
          entry rather than three. */}
      {hasCV && (
        <CVQrSheet
          open={cvSheetOpen}
          onClose={() => setCvSheetOpen(false)}
          url={cvUrl(username)}
          name={name}
        />
      )}

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
