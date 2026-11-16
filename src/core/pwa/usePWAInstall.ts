"use client"

import { useSyncExternalStore } from "react"
import {
  getServerSnapshot,
  getSnapshot,
  promptInstall,
  subscribe,
} from "./installPrompt"

/**
 * The install prompt, for a component.
 *
 * Reads the module store in core/pwa/installPrompt.ts, which the <head> script
 * feeds from before hydration, so a prompt that fired early is not missed (the
 * old version listened only while mounted and lost it). The server snapshot
 * has no prompt.
 *
 * `promptInstall()` opens the browser's dialog and resolves to "accepted",
 * "dismissed" or "unavailable".
 */
export function usePWAInstall() {
  const { canPrompt, installedNow } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  )

  return { canPrompt, installedNow, promptInstall }
}
