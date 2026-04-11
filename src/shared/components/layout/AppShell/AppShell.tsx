"use client"

import { useEffect } from "react"
import AppNav from "@/shared/components/layout/AppNav/AppNav"
import styles from "./AppShell.module.css"

import { initFCM } from "@/core/firebase/fcm"
import { onForegroundMessage } from "@/core/firebase/messaging"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { handleNotificationToast } from "@/core/firebase/notificationMapper"
import api from "@/core/api/axios"

interface AppShellProps {
  children: React.ReactNode
}

// device detection
const getDeviceInfo = () => {
  const ua = navigator.userAgent

  let device_type = "web"
  let device_name = "Web"

  if (/Android/i.test(ua)) {
    device_type = "android"
    device_name = "Android"
  } else if (/iPhone|iPad|iPod/i.test(ua)) {
    device_type = "ios"
    device_name = "iOS"
  } else if (/Chrome/i.test(ua)) {
    device_name = "Chrome"
  } else if (/Safari/i.test(ua)) {
    device_name = "Safari"
  }

  return { device_type, device_name }
}

export default function AppShell({ children }: AppShellProps) {
  const toast = useToast()

  useEffect(() => {
    const setupFCM = async () => {
      try {
        const token = await initFCM()

        if (!token) return

        // Prevent duplicate API calls
        const savedToken = localStorage.getItem("fcm_token")

        if (savedToken === token) {
          return
        }

        const { device_type, device_name } = getDeviceInfo()

        await api.post("/notifications/save/user/fcm/token", {
          token,
          device_type,
          device_name,
        })

        localStorage.setItem("fcm_token", token)

      } catch (err) {
        console.error("❌ FCM setup failed:", err)
      }
    }

    setupFCM()

    // 🔥 Foreground listener
    const unsubscribe = onForegroundMessage((payload) => {
      console.log("🔥 FCM Foreground:", payload)

      const data = payload.data || {}

      handleNotificationToast(data, toast)
    })

    return () => {
      unsubscribe()
    }
  }, [toast])

  return (
    <div className={styles.shell}>
      <AppNav />
      <main className={styles.content}>{children}</main>
    </div>
  )
}