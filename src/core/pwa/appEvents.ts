/**
 * Counting installs and opens: POST /app/events (backend apps/pwa).
 *
 * Fire-and-forget by design. Nothing here is ever awaited by a caller, shown
 * to anyone, or retried: a lost event is an under-count, and that is the right
 * way for a number like this to fail. No storage means no counting at all,
 * because without a stable device id every open would look like a new device.
 *
 * The backend stores no IP and no user agent; this sends coarse buckets only.
 */

import api from "@/core/api/axios"
import { useAuthStore } from "@/store/auth.store"
import { APP_DAY_TIME_ZONE, DEVICE_ID_KEY, OPENED_DAY_KEY } from "./constants"
import { currentPlatform, isStandalone } from "./platform"

export type AppEventName = "installed" | "opened"

/** How the app was installed: our Install button, or the browser's own menu. */
export type InstallSource = "prompt" | "browser_menu"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * How long an event waits for the session bootstrap before going anonymous.
 * A cold start fires "opened" before initAuth has a token; waiting is what
 * lets the backend attach the signed-in person to the device.
 */
const AUTH_SETTLE_MAX_MS = 10_000

/**
 * This browser's device id: a random UUID kept in localStorage, made on first
 * use. null when storage is unavailable or does not keep what we write.
 */
export function deviceId(): string | null {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY)
    if (existing && UUID_RE.test(existing)) return existing

    const id = crypto.randomUUID()
    localStorage.setItem(DEVICE_ID_KEY, id)
    // Read it back: an id that is not kept would count every open as new.
    return localStorage.getItem(DEVICE_ID_KEY) === id ? id : null
  } catch {
    return null
  }
}

/** YYYY-MM-DD in Asia/Kolkata. `en-CA` formats numerically as an ISO date. */
export function appDay(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_DAY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at)
}

/** Resolves once the auth bootstrap has finished, or after a cap. */
function whenAuthSettled(): Promise<void> {
  if (!useAuthStore.getState().isLoading) return Promise.resolve()

  return new Promise((resolve) => {
    let unsubscribe = () => {}
    const finish = () => {
      clearTimeout(timer)
      unsubscribe()
      resolve()
    }
    const timer = setTimeout(finish, AUTH_SETTLE_MAX_MS)
    unsubscribe = useAuthStore.subscribe((state) => {
      if (!state.isLoading) finish()
    })
  })
}

/**
 * Report one event. Never throws, never blocks, never retries.
 *
 * Goes through the shared axios instance, so a signed-in session rides along
 * and a signed-out one sends nothing. Always as the PERSON, never as an org:
 * the backend links the device to a human, and an org actor header would only
 * add a membership check that could fail.
 */
export function trackAppEvent(
  event: AppEventName,
  { source }: { source?: InstallSource } = {}
): void {
  if (typeof window === "undefined") return

  try {
    const id = deviceId()
    if (!id) return

    const { os, browser } = currentPlatform()
    const body = {
      device_id: id,
      event,
      platform: os,
      browser,
      ...(source ? { source } : {}),
    }

    void whenAuthSettled()
      .then(() => api.post("/app/events", body, { actor: { type: "user" } }))
      .catch(() => {})
  } catch {
    // Counting must never break the app.
  }
}

/**
 * Send "opened" when running as the installed app, at most once per
 * Asia/Kolkata calendar day. The day is written BEFORE sending, so a failed
 * send is not retried and two calls in a row send once.
 */
export function trackOpenedOncePerDay(): void {
  if (!isStandalone()) return

  const today = appDay()
  try {
    if (localStorage.getItem(OPENED_DAY_KEY) === today) return
    localStorage.setItem(OPENED_DAY_KEY, today)
  } catch {
    return
  }

  trackAppEvent("opened")
}
