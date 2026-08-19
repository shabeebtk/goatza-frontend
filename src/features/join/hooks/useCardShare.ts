"use client"

/**
 * Getting the card off this screen and into somebody's story.
 *
 * The success screen has three ways to do that and they are not equivalent:
 *
 *   1. NATIVE SHARE, where the phone supports sharing FILES. One tap puts the
 *      image and the caption into Instagram, WhatsApp or wherever else, with no
 *      download, no gallery detour and nothing left for the player to type.
 *      This is the path most phones will take, so it is the primary button
 *      wherever it exists.
 *
 *   2. DOWNLOAD, everywhere. A plain <a download> in the component — it is not
 *      in this hook because it needs no JavaScript at all, and the version that
 *      needs none is the version that cannot fail.
 *
 *   3. COPY THE CAPTION, everywhere. A downloaded image still leaves somebody
 *      staring at an empty caption box, which is where most of them give up and
 *      post nothing.
 *
 * EVERY PATH HAS A FALLBACK, because all three of these APIs are permission-
 * gated, vendor-dependent, or both:
 *
 *   * `navigator.share` may be missing, may not accept files, may throw, and
 *     rejects with AbortError when somebody simply changes their mind — which
 *     is not an error and must not be reported as one.
 *   * `navigator.clipboard` is unavailable on insecure origins and older mobile
 *     browsers, and can be refused outright by permission policy. So the write
 *     falls back to `document.execCommand("copy")`, and when THAT fails too the
 *     caption is shown in a selectable block. A copy button that silently does
 *     nothing is worse than no copy button.
 */

import { useCallback, useMemo, useState } from "react"
import { toast } from "sonner"

import { buildJoinCardUrl, joinCardFileName } from "../utils/joinCard/cardUrl"
import { shareCaption } from "../types"

/**
 * Can this browser share FILES, not just links?
 *
 * `navigator.share` alone is not enough — several browsers implement it for
 * text and URLs and reject a payload containing files. The only reliable test
 * is to ask `canShare` about an actual File, which is why an empty one is built
 * here purely to be asked about.
 *
 * Read once, lazily, when the hook first runs. This screen only ever renders
 * after a form submission, so there is no server pass to disagree with and no
 * hydration mismatch to cause.
 */
function detectFileShare(): boolean {
  if (typeof navigator === "undefined" || typeof File === "undefined") {
    return false
  }

  if (typeof navigator.share !== "function") return false
  if (typeof navigator.canShare !== "function") return false

  try {
    const probe = new File([], "probe.png", { type: "image/png" })
    return navigator.canShare({ files: [probe] })
  } catch {
    return false
  }
}

/** Somebody opened the share sheet and closed it again. Not a failure. */
function isCancellation(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
}

/**
 * The pre-clipboard-API copy: a throwaway textarea, selected, copied, removed.
 *
 * `position: fixed` and a zero opacity rather than `display: none` — a hidden
 * element cannot be selected, and an unselected one cannot be copied. The
 * explicit `setSelectionRange` is for iOS, where `select()` alone does not
 * always take.
 */
function copyWithExecCommand(text: string): boolean {
  if (typeof document === "undefined") return false

  const area = document.createElement("textarea")
  area.value = text
  area.setAttribute("readonly", "")
  area.style.position = "fixed"
  area.style.top = "0"
  area.style.left = "0"
  area.style.opacity = "0"

  document.body.appendChild(area)

  try {
    area.focus()
    area.select()
    area.setSelectionRange(0, text.length)
    return document.execCommand("copy")
  } catch {
    return false
  } finally {
    document.body.removeChild(area)
  }
}

export function useCardShare({
  refCode,
  isFounding,
}: {
  refCode: string
  isFounding: boolean
}) {
  const caption = useMemo(() => shareCaption(isFounding), [isFounding])
  const cardUrl = buildJoinCardUrl(refCode)
  const fileName = joinCardFileName(refCode)

  // Lazy, so the capability probe runs once rather than on every render.
  const [canShareFiles, setCanShareFiles] = useState(detectFileShare)
  const [isSharing, setIsSharing] = useState(false)

  // Set only when BOTH clipboard routes failed. The component renders the
  // caption in a selectable block instead of pretending something happened.
  const [showCaption, setShowCaption] = useState(false)

  const share = useCallback(async () => {
    setIsSharing(true)

    try {
      // Same-origin route handler, so no CORS and no credentials to think
      // about. It is a PNG the CDN has almost certainly already cached.
      const response = await fetch(cardUrl)
      if (!response.ok) throw new Error(`card ${response.status}`)

      const blob = await response.blob()
      const file = new File([blob], fileName, {
        type: blob.type || "image/png",
      })

      // Asked AGAIN, with the real file: the probe above proves the browser
      // accepts files in principle, not that it accepts this one.
      if (!navigator.canShare?.({ files: [file] })) {
        throw new Error("files not shareable")
      }

      await navigator.share({ files: [file], text: caption })
    } catch (error) {
      if (isCancellation(error)) return

      // Whatever went wrong, the two manual paths still work — so stop
      // offering the one that does not and let the component show them.
      setCanShareFiles(false)
      toast.error("Couldn't open the share sheet.", {
        description: "Download the card and copy the caption instead.",
      })
    } finally {
      setIsSharing(false)
    }
  }, [cardUrl, fileName, caption])

  const copyCaption = useCallback(async () => {
    setShowCaption(false)

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(caption)
        toast.success("Caption copied", {
          description: "Paste it with your story card.",
        })
        return
      }
    } catch {
      // Denied by permission policy, or an insecure origin. Fall through.
    }

    if (copyWithExecCommand(caption)) {
      toast.success("Caption copied", {
        description: "Paste it with your story card.",
      })
      return
    }

    // Both routes refused. Show the words instead of failing quietly.
    setShowCaption(true)
    toast.error("Your browser wouldn't let us copy that.", {
      description: "Select the caption below and copy it by hand.",
    })
  }, [caption])

  return {
    caption,
    cardUrl,
    fileName,
    canShareFiles,
    isSharing,
    showCaption,
    share,
    copyCaption,
  }
}
