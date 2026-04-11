"use client"

import { useEffect, useState } from "react"

let deferredPrompt: any = null

export const usePWAInstall = () => {
  const [isInstallable, setIsInstallable] = useState(false)

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault()
      deferredPrompt = e
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