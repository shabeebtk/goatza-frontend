"use client"

import { useCallback, useSyncExternalStore } from "react"

import { useToast } from "@/shared/components/ui/Toast/Toast"

const subscribeToNothing = () => () => {}

/**
 * Share a page, or copy its link: the OS share sheet where there is one, the
 * clipboard otherwise and whenever the share sheet refuses for a reason other
 * than being dismissed. A clipboard that is blocked shows the link instead.
 * The same rules as useShareRecruitment and useSquadInviteShare.
 */
export function useShareLink() {
  const toast = useToast()

  const canNativeShare = useSyncExternalStore(
    subscribeToNothing,
    () => typeof navigator !== "undefined" && typeof navigator.share === "function",
    () => false
  )

  const copyLink = useCallback(
    async (url: string) => {
      try {
        await navigator.clipboard.writeText(url)
        toast.show({ title: "Link copied", variant: "success", position: "top-center", duration: 2000 })
      } catch {
        toast.show({
          title: "Couldn't copy automatically",
          message: url,
          variant: "warning",
          position: "top-center",
          duration: 5000,
        })
      }
    },
    [toast]
  )

  const share = useCallback(
    async ({ title, text, url }: { title: string; text: string; url: string }) => {
      if (!canNativeShare) {
        await copyLink(url)
        return
      }
      try {
        await navigator.share({ title, text, url })
      } catch (err) {
        if ((err as { name?: string } | null)?.name !== "AbortError") await copyLink(url)
      }
    },
    [canNativeShare, copyLink]
  )

  return { canNativeShare, copyLink, share }
}
