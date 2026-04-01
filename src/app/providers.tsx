"use client"

import { ReactNode, useEffect } from "react"
import QueryProvider from "@/core/react-query/QueryProvider"
import { initAuth } from "@/core/auth/initAuth"

export default function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    initAuth()
  }, [])

  return <QueryProvider>{children}</QueryProvider>
}