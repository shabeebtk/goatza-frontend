"use client"

/**
 * The two share affordances that do not need an account or a network call:
 * copy the link, and hand it to the OS share sheet.
 *
 * A hook rather than two functions inside RecruitmentShareMenu because the
 * detail page reaches for them from two places — the share menu itself, and the
 * organiser's mobile "More" menu, which is already a popup and cannot contain a
 * second one. Duplicating the clipboard fallback and the `navigator.share`
 * feature detection across those two is how they drift.
 *
 * Modelled on ProfileShareMenu, including the parts that look fussy:
 *
 *   - `canNativeShare` is read through `useSyncExternalStore`, so SSR and the
 *     first client render agree on `false` and then flip. A bare
 *     `typeof navigator` check hydrate-mismatches, and an option that does
 *     nothing on desktop Chrome is worse than an option that isn't there.
 *   - The clipboard write is caught, not assumed. It is permission-gated and
 *     blocked outright in several in-app browsers, so the failure path shows
 *     the URL and lets it be copied by hand rather than silently doing nothing.
 */

import { useCallback, useSyncExternalStore } from "react"

import { useToast } from "@/shared/components/ui/Toast/Toast"
import { recruitmentUrl } from "@/shared/services/recruitmentUrl"

/** Module-level so useSyncExternalStore doesn't resubscribe every render. */
const subscribeToNothing = () => () => {}

export type ShareRecruitmentPayload = {
  /** Posting title — becomes the share sheet's headline. */
  title: string
  /** Club name, for the one-line body. */
  orgName?: string
}

export function useShareRecruitment(recruitmentId: string) {
  const toast = useToast()

  // The canonical PUBLIC url (/r/<id>), never the in-app one: this is the
  // string that ends up in a group chat, where most readers have no account.
  const url = recruitmentUrl(recruitmentId)

  const canNativeShare = useSyncExternalStore(
    subscribeToNothing,
    () =>
      typeof navigator !== "undefined" && typeof navigator.share === "function",
    () => false
  )

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url)
      toast.show({
        title: "Link copied",
        variant: "success",
        position: "top-center",
        duration: 2000,
      })
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

  const nativeShare = useCallback(
    async ({ title, orgName }: ShareRecruitmentPayload) => {
      try {
        await navigator.share({
          title: `${title} · Goatza`,
          text: orgName ? `${title} — ${orgName} on Goatza` : `${title} on Goatza`,
          url,
        })
      } catch {
        // AbortError when the user dismisses the OS sheet. Nothing to report.
      }
    },
    [url]
  )

  return { url, canNativeShare, copyLink, nativeShare }
}
