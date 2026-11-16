"use client"

import { ReactNode, useEffect } from "react"
import QueryProvider from "@/core/react-query/QueryProvider"
import { initAuth } from "@/core/auth/initAuth"
import { installPlaybackGuard } from "@/shared/media/playback"
import { initInstallPrompt } from "@/core/pwa/installPrompt"
import { trackOpenedOncePerDay } from "@/core/pwa/appEvents"

export default function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    initAuth()
    // Here rather than with the feed: chat, CV and lightbox videos have none.
    installPlaybackGuard()
    // Adopts a prompt the <head> script caught before hydration.
    initInstallPrompt()

    // Counts a day the installed app was opened. On return to the screen as
    // well as on load: a home-screen app is usually resumed, not reloaded, so
    // mount alone would miss most days. Once a day either way.
    trackOpenedOncePerDay()
    const onVisible = () => {
      if (document.visibilityState === "visible") trackOpenedOncePerDay()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [])

  return <QueryProvider>{children}</QueryProvider>
}
