"use client"

import { ReactNode, useEffect } from "react"
import QueryProvider from "@/core/react-query/QueryProvider"
import { initAuth } from "@/core/auth/initAuth"
import { installPlaybackGuard } from "@/shared/media/playback"

export default function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    initAuth()
    // Here rather than with the feed: chat, CV and lightbox videos have none.
    installPlaybackGuard()
  }, [])

  return <QueryProvider>{children}</QueryProvider>
}
