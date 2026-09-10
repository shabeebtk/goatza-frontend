"use client"

import { useEffect, useState } from "react"

/**
 * `beforeinstallprompt` is Chromium-only and is NOT in TypeScript's DOM lib, so
 * there is nothing to import — this declares the two members we actually touch.
 * Deliberately minimal: a fuller copy of the spec would be a second source of
 * truth for an event we only ever `preventDefault()` and re-fire.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>
}

let deferredPrompt: BeforeInstallPromptEvent | null = null

export const usePWAInstall = () => {
  const [isInstallable, setIsInstallable] = useState(false)

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      deferredPrompt = e as BeforeInstallPromptEvent
      setIsInstallable(true)
    }

    window.addEventListener("beforeinstallprompt", handler)

    return () => {
      window.removeEventListener("beforeinstallprompt", handler)
    }
  }, [])

  const installApp = async () => {
    if (!deferredPrompt) return

    deferredPrompt.prompt()

    const choice = await deferredPrompt.userChoice

    if (choice.outcome === "accepted") {
      console.log("PWA installed")
    }

    deferredPrompt = null
    setIsInstallable(false)
  }

  return { isInstallable, installApp }
}