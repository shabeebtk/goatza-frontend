"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import api from "@/core/api/axios"
import { initFCM } from "@/core/firebase/fcm"
import { onForegroundMessage } from "@/core/firebase/messaging"
import { handleNotificationToast } from "@/core/firebase/notificationMapper"
import { useToast } from "@/shared/components/ui/Toast/Toast"

/**
 * Web push wiring: register the device token, then toast anything that arrives
 * while the app is in the foreground.
 *
 * Lives in a hook rather than in AppShell because BOTH shells need it. OrgShell
 * ran neither half, so an org admin got no foreground toast at all — and the
 * push they did get in the background was the only notification channel that
 * reached them.
 *
 * Safe to mount twice in one session (switching to an org swaps AppShell for
 * OrgShell): the token is compared against the saved copy before the save call,
 * and the foreground listener is torn down on unmount.
 */

const getDeviceInfo = () => {
  if (typeof window === "undefined") {
    return { device_type: "web", device_name: "Web" }
  }

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

export function useFcmNotifications() {
  const toast = useToast()
  const router = useRouter()

  useEffect(() => {
    // Setup FCM (token + save)
    const setupFCM = async () => {
      try {
        const token = await initFCM()

        if (!token) return

        // Prevent duplicate API calls
        const savedToken = localStorage.getItem("fcm_token")

        if (savedToken === token) return

        const { device_type, device_name } = getDeviceInfo()

        await api.post("/notifications/save/user/fcm/token", {
          token,
          device_type,
          device_name,
        })

        localStorage.setItem("fcm_token", token)

      } catch (err) {
        console.error("FCM setup failed:", err)
      }
    }

    setupFCM()

    // Foreground listener (async safe)
    let unsubscribe: (() => void) | null = null
    let cancelled = false

    const setupListener = async () => {
      const teardown = await onForegroundMessage((payload) => {
        const data = payload.data || {}

        // router.push, not window.location: a full reload on every toast click
        // throws away the React Query cache and drops the chat websocket.
        handleNotificationToast(data, toast, (href) => router.push(href))
      })

      // The subscription can resolve after the effect has already been cleaned
      // up — drop it immediately rather than leaking a listener into the next
      // shell.
      if (cancelled) {
        teardown?.()
        return
      }

      unsubscribe = teardown
    }

    setupListener()

    return () => {
      cancelled = true
      if (unsubscribe) unsubscribe()
    }
  }, [toast, router])
}
