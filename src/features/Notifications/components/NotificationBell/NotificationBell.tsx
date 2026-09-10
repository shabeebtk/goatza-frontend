"use client"

import { useState, useCallback, useSyncExternalStore } from "react"
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

/**
 * The tooltip for a state. Was two pieces of state kept in step by hand at nine
 * call sites, which is eight opportunities to forget — and one of them did:
 * `disable()`'s error path reverted the state to "enabled" without touching the
 * tooltip, leaving the bell claiming notifications were off while showing them
 * as on. Deriving it removes that class of bug rather than fixing one instance.
 */
const TOOLTIPS: Record<BellState, string> = {
  loading: "",
  unsupported: "Push notifications not supported on this browser",
  denied: "Notifications blocked — allow in browser settings",
  enabled: "Push notifications on — tap to turn off",
  disabled: "Push notifications off — tap to turn on",
}

/**
 * What the BROWSER says, read through useSyncExternalStore.
 *
 * This was an effect that set state on mount — which renders, commits, sets
 * state and renders again, and is what React Compiler flags as a cascading
 * render. It exists at all because `Notification.permission` and localStorage
 * do not exist during the server render, so the value cannot simply be the
 * initial state.
 *
 * useSyncExternalStore is the shape for exactly that: `getServerSnapshot`
 * answers "loading" for SSR and the first paint, `getSnapshot` answers from the
 * browser afterwards, and React reconciles the two itself. Nothing subscribes —
 * permission changes only via a browser UI that reloads the decision, and the
 * two in-app paths go through `override` below.
 */
const subscribeToBrowser = () => () => {}

const getBrowserSnapshot = (): BellState => {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    return "unsupported"
  }
  if (Notification.permission === "denied") return "denied"

  return Notification.permission === "granted" &&
    localStorage.getItem(STORAGE_ENABLED_KEY) === "true"
    ? "enabled"
    : "disabled"
}

const getServerSnapshot = (): BellState => "loading"

// ── Component ─────────────────────────────────────────────────
interface NotificationBellProps {
  /** Show a label next to the icon */
  showLabel?: boolean
  className?: string
}

export default function NotificationBell({ showLabel = false, className }: NotificationBellProps) {
  const browserState = useSyncExternalStore(
    subscribeToBrowser,
    getBrowserSnapshot,
    getServerSnapshot,
  )

  /**
   * What the user just did on this screen, which outranks the browser reading
   * until the page is reloaded. Null means "nobody has touched it — show what
   * the browser says".
   */
  const [override, setOverride] = useState<BellState | null>(null)

  const state = override ?? browserState
  const tooltip = TOOLTIPS[state]

  // ── Enable: request permission + register token ───────────────
  const enable = useCallback(async () => {
    setOverride("loading")
    try {
      const token = await initFCM() // requests permission + gets token

      if (!token) {
        // User denied or something failed
        setOverride(Notification.permission === "denied" ? "denied" : "disabled")
        return
      }

      const { device_type, device_name } = getDeviceInfo()
      await api.post("/notifications/save/user/fcm/token", { token, device_type, device_name })

      localStorage.setItem(STORAGE_KEY, token)
      localStorage.setItem(STORAGE_ENABLED_KEY, "true")
      setOverride("enabled")
    } catch (err) {
      console.error("Enable notifications error:", err)
      setOverride("disabled")
    }
  }, [])

  // ── Disable: remove token from backend, clear local ──────────
  const disable = useCallback(async () => {
    setOverride("loading")
    try {
      const token = localStorage.getItem(STORAGE_KEY)
      if (token) {
        // Best-effort — ignore failure
        await api.post("/notifications/delete/user/fcm/token", { token }).catch(() => {})
      }
      localStorage.removeItem(STORAGE_KEY)
      localStorage.setItem(STORAGE_ENABLED_KEY, "false")
      setOverride("disabled")
    } catch (err) {
      console.error("Disable notifications error:", err)
      setOverride("enabled") // revert — tooltip follows on its own now
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