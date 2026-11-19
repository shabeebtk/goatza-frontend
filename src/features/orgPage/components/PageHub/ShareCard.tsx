"use client"

import { forwardRef, useState } from "react"
import { Icon } from "@iconify/react"

import { saveBlob, squadQrPng } from "@/features/squads/services/squadQr"
import { useShareLink } from "@/features/squads/hooks/useShareLink"
import Button from "@/shared/components/ui/Button/Button"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { pageShareText, pageShareUrl } from "../../format"
import type { PosterInput } from "../../services/pagePoster"
import PosterSheet from "../PosterSheet/PosterSheet"
import styles from "./PageHub.module.css"

export type ShareCardPoster = Omit<PosterInput, "primarySport" | "primaryCity" | "username" | "orgName">

/**
 * The page's short link (goatza.com/<username>), with Copy and Share, the QR
 * poster and the plain QR. The ref is what the readiness card's "Share it"
 * scrolls to.
 */
const ShareCard = forwardRef<
  HTMLElement,
  { orgId: string; username: string | undefined; orgName: string; poster: ShareCardPoster }
>(function ShareCard({ orgId, username, orgName, poster }, ref) {
  const toast = useToast()
  const { copyLink, share } = useShareLink()
  const [posterOpen, setPosterOpen] = useState(false)
  const [savingQr, setSavingQr] = useState(false)
  const url = username ? pageShareUrl(username) : ""

  const downloadQr = async () => {
    if (!username) return
    setSavingQr(true)
    try {
      // Black on white, 1024 px, with the quiet zone: the same code squads print.
      saveBlob(await squadQrPng(url), `${username}-qr.png`)
    } catch (err) {
      toast.show({
        title: err instanceof Error ? err.message : "Couldn't make the QR image.",
        variant: "error",
        position: "top-center",
      })
    } finally {
      setSavingQr(false)
    }
  }

  return (
    <section
      ref={ref}
      id="share"
      tabIndex={-1}
      className={`${styles.card} ${styles.shareCard}`}
      aria-labelledby="page-hub-share"
    >
      <div className={styles.cardHeader}>
        <h2 id="page-hub-share" className={styles.cardTitle}>
          Share your page
        </h2>
      </div>
      <p className={styles.cardIntro}>
        Put it in your WhatsApp groups, your bio and on posters. It opens your page.
      </p>

      {username ? (
        <>
          <div className={styles.shareLink}>
            <Icon icon="mdi:link-variant" width={18} height={18} aria-hidden="true" />
            <span className={styles.shareLinkText}>{pageShareText(username)}</span>
          </div>
          <div className={styles.shareActions}>
            <Button
              variant="outline"
              leftIcon={<Icon icon="mdi:content-copy" width={18} height={18} />}
              onClick={() => void copyLink(url)}
            >
              Copy
            </Button>
            <Button
              variant="brand"
              leftIcon={<Icon icon="mdi:share-variant-outline" width={18} height={18} />}
              onClick={() => void share({ title: orgName, text: `${orgName} on Goatza`, url })}
            >
              Share
            </Button>
          </div>
          {/* Short words on the buttons, the full ones for screen readers: "Download
              QR poster" did not fit half of a 360px row. Below 480px they stack. */}
          <div className={`${styles.shareActions} ${styles.shareDownloads}`}>
            <Button
              variant="outline"
              aria-label="Download QR poster"
              leftIcon={<Icon icon="mdi:file-image-outline" width={18} height={18} />}
              onClick={() => setPosterOpen(true)}
            >
              QR poster
            </Button>
            <Button
              variant="ghost"
              loading={savingQr}
              aria-label="Download QR code"
              leftIcon={<Icon icon="mdi:qrcode" width={18} height={18} />}
              onClick={() => void downloadQr()}
            >
              QR code
            </Button>
          </div>
        </>
      ) : (
        <p className={styles.muted}>Your page&apos;s link appears once it has a username.</p>
      )}

      {posterOpen && username && (
        <PosterSheet
          orgId={orgId}
          input={{ ...poster, orgName, username }}
          onClose={() => setPosterOpen(false)}
        />
      )}
    </section>
  )
})

export default ShareCard
