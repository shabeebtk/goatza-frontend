"use client"

/**
 * The canonical profile URL with a Copy button, shown under the "Public
 * profile" toggle while it is on.
 *
 * Showing the URL is the point of the toggle: "anyone can view your profile"
 * is abstract until you can see — and copy — the link that proves it.
 */

import { Icon } from "@iconify/react"

import { useToast } from "@/shared/components/ui/Toast/Toast"
import styles from "./SettingsMenu.module.css"

export default function ProfileLinkRow({ url }: { url: string }) {
  const toast = useToast()

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
      // Clipboard access is permission-gated and blocked outright in some
      // in-app browsers. The URL is already on screen, so nothing is lost.
      toast.show({
        title: "Couldn't copy — select the link to copy it manually",
        variant: "warning",
        position: "top-center",
        duration: 4000,
      })
    }
  }

  return (
    <div className={styles.linkRow}>
      <span className={styles.linkText} title={url}>
        {url.replace(/^https?:\/\//, "")}
      </span>
      <button type="button" className={styles.copyBtn} onClick={handleCopy}>
        <Icon icon="mdi:content-copy" width={13} height={13} />
        Copy
      </button>
    </div>
  )
}
