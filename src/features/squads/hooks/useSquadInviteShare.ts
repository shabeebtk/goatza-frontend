"use client"

import { useCallback, useSyncExternalStore } from "react"

import { useToast } from "@/shared/components/ui/Toast/Toast"

/** Module-level so useSyncExternalStore doesn't resubscribe every render. */
const subscribeToNothing = () => () => {}

/**
 * Copy the squad's invite link, or hand it to the OS share sheet. The same shape
 * as useShareRecruitment: `canNativeShare` through useSyncExternalStore so the
 * server and the first client render agree, and a clipboard write that is caught
 * (it is blocked outright in some in-app browsers) shows the link instead.
 *
 * Share falls back to copying wherever there is no share sheet (most desktops),
 * and when the share sheet refuses for any reason other than being dismissed.
 */
export function useSquadInviteShare({
  url,
  squadName,
  orgName,
}: {
  url: string
  squadName: string
  orgName: string
}) {
  const toast = useToast()

  const canNativeShare = useSyncExternalStore(
    subscribeToNothing,
    () => typeof navigator !== "undefined" && typeof navigator.share === "function",
    () => false
  )

  const copyLink = useCallback(async () => {
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
  }, [toast, url])

  const shareLink = useCallback(async () => {
    if (!canNativeShare) {
      await copyLink()
      return
    }
    try {
      await navigator.share({
        title: `Join ${squadName} on Goatza`,
        text: `${orgName} invites you to ask to join ${squadName} on Goatza.`,
        url,
      })
    } catch (err) {
      // Dismissing the OS sheet is an AbortError: nothing to do. Anything else
      // (an in-app browser that refuses) still gets the link onto the clipboard.
      if ((err as { name?: string } | null)?.name !== "AbortError") await copyLink()
    }
  }, [canNativeShare, copyLink, orgName, squadName, url])

  return { canNativeShare, copyLink, shareLink }
}
