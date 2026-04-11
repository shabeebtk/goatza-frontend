"use client"

import { useState, useEffect, useCallback } from "react"
import { Icon } from "@iconify/react"
import { initFCM } from "@/core/firebase/fcm"
import api from "@/core/api/axios"
import styles from "./NotificationBell.module.css"

// ── Device detection (same as AppShell) ──────────────────────
const getDeviceInfo = () => {
  const ua = navigator.userAgent
  let device_type = "web"
  let device_name = "Web"
  if (/Android/i.test(ua)) { device_type = "android"; device_name = "Android" }
  else if (/iPhone|iPad|iPod/i.test(ua)) { device_type = "ios"; device_name = "iOS" }
  else if (/Chrome/i.test(ua)) { device_name = "Chrome" }
  else if (/Safari/i.test(ua)) { device_name = "Safari" }
  return { device_type, device_name }
}

const STORAGE_KEY = "fcm_token"
const STORAGE_ENABLED_KEY = "notif_enabled"

// ── State types ───────────────────────────────────────────────
type BellState = "enabled" | "disabled" | "unsupported" | "loading" | "denied"

// ── Component ─────────────────────────────────────────────────
interface NotificationBellProps {
  /** Show a label next to the icon */
  showLabel?: boolean
  className?: string
}

export default function NotificationBell({ showLabel = false, className }: NotificationBellProps) {
  const [state, setState] = useState<BellState>("loading")
  const [tooltip, setTooltip] = useState("")

  // ── Init: read persisted preference + browser permission ─────
  useEffect(() => {
    if (typeof window === "undefined") return

    // Check if push notifications are supported
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setState("unsupported")
      setTooltip("Push notifications not supported on this browser")
      return
    }

    const permission = Notification.permission
    const savedEnabled = localStorage.getItem(STORAGE_ENABLED_KEY)

    if (permission === "denied") {
      setState("denied")
      setTooltip("Notifications blocked — allow in browser settings")
      return
    }

    if (permission === "granted" && savedEnabled === "true") {
      setState("enabled")
      setTooltip("Push notifications on — tap to turn off")
    } else {
      setState("disabled")
      setTooltip("Push notifications off — tap to turn on")
    }
  }, [])

  // ── Enable: request permission + register token ───────────────
  const enable = useCallback(async () => {
    setState("loading")
    try {
      const token = await initFCM() // requests permission + gets token

      if (!token) {
        // User denied or something failed
        const permission = Notification.permission
        setState(permission === "denied" ? "denied" : "disabled")
        setTooltip(
          permission === "denied"
            ? "Notifications blocked — allow in browser settings"
            : "Push notifications off — tap to turn on"
        )
        return
      }

      const { device_type, device_name } = getDeviceInfo()
      await api.post("/notifications/save/user/fcm/token", { token, device_type, device_name })

      localStorage.setItem(STORAGE_KEY, token)
      localStorage.setItem(STORAGE_ENABLED_KEY, "true")
      setState("enabled")
      setTooltip("Push notifications on — tap to turn off")
    } catch (err) {
      console.error("Enable notifications error:", err)
      setState("disabled")
      setTooltip("Push notifications off — tap to turn on")
    }
  }, [])

  // ── Disable: remove token from backend, clear local ──────────
  const disable = useCallback(async () => {
    setState("loading")
    try {
      const token = localStorage.getItem(STORAGE_KEY)
      if (token) {
        // Best-effort — ignore failure
        await api.post("/notifications/delete/user/fcm/token", { token }).catch(() => {})
      }
      localStorage.removeItem(STORAGE_KEY)
      localStorage.setItem(STORAGE_ENABLED_KEY, "false")
      setState("disabled")
      setTooltip("Push notifications off — tap to turn on")
    } catch (err) {
      console.error("Disable notifications error:", err)
      setState("enabled") // revert
    }
  }, [])

  const handleToggle = () => {
    if (state === "loading" || state === "unsupported") return
    if (state === "denied") {
      // Open browser settings hint — can't do programmatically
      alert("Notifications are blocked by your browser.\n\nTo enable:\n• Chrome: click the lock icon in the address bar → Notifications → Allow\n• Safari: Settings → Websites → Notifications\n• Firefox: click the shield icon → Permissions")
      return
    }
    if (state === "enabled") disable()
    else enable()
  }

  // ── Render ────────────────────────────────────────────────────
  const isLoading = state === "loading"
  const isEnabled = state === "enabled"
  const isDenied = state === "denied"
  const isUnsupported = state === "unsupported"

  const icon = isLoading
    ? "mdi:loading"
    : isEnabled
    ? "mdi:bell"
    : isDenied || isUnsupported
    ? "mdi:bell-off"
    : "mdi:bell-outline"

  return (
    <button
      className={`${styles.bell} ${styles[`bell-${state}`]} ${className ?? ""}`}
      onClick={handleToggle}
      disabled={isLoading || isUnsupported}
      aria-label={tooltip || "Toggle notifications"}
      title={tooltip}
      type="button"
    >
      <span className={`${styles.iconWrap} ${isLoading ? styles.spin : ""}`}>
        <Icon icon={icon} width={18} height={18} />
      </span>

      {/* Active indicator dot */}
      {isEnabled && <span className={styles.activeDot} aria-hidden="true" />}

      {showLabel && (
        <span className={styles.label}>
          {isLoading ? "..." : isEnabled ? "On" : isDenied ? "Blocked" : isUnsupported ? "N/A" : "Off"}
        </span>
      )}
    </button>
  )
}