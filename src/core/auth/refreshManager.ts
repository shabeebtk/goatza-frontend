/**
 * refreshManager — the single source of truth for refreshing the access token.
 *
 * Nothing else in the app may call the refresh endpoint. It owns:
 * - single-flight (per tab, and across tabs via Web Locks)
 * - the definitive-vs-retryable distinction (only a 401 with a
 *   refresh_missing/refresh_invalid code clears auth state)
 * - proactive refresh before expiry + on PWA resume / tab refocus
 */

import axios from "axios"
import { useAuthStore } from "@/store/auth.store"

export class SessionExpiredError extends Error {
  constructor() {
    super("Session expired")
    this.name = "SessionExpiredError"
  }
}

const REFRESH_URL = `${process.env.NEXT_PUBLIC_API_URL}/user/token/refresh`
const PROACTIVE_LEAD_MS = 60_000        // refresh 60s before expiry
const NEAR_EXPIRY_MS = 120_000          // "needs refresh" threshold

/**
 * How long one refresh request may take.
 *
 * Every request that meets a 401 waits on the refresh in flight, so a refresh
 * that never answered held ALL of them, and the app sat on "Saving…" until a
 * reload. A phone makes that easy: the proactive refresh fires as the page
 * comes back from a locked screen, and a request sent before the network is
 * back can stay pending with no error at all. A timeout is a retryable failure
 * (auth state untouched), so the caller's request fails and can be tried again.
 */
export const REFRESH_TIMEOUT_MS = 15_000

/**
 * How long to wait for another tab to finish ITS refresh.
 *
 * The cross-tab lock is only released when the holding tab's refresh settles,
 * and a tab frozen in the background (iOS does this to any tab it is not
 * showing) can sit on it indefinitely. Past this, refresh without the lock: the
 * server's grace window for a just-rotated token covers the race the lock was
 * avoiding.
 */
export const LOCK_WAIT_MS = 10_000

let inflight: Promise<string> | null = null
let proactiveTimer: ReturnType<typeof setTimeout> | null = null
let listenersAttached = false

/** Decode the exp claim (ms) without verifying — display/scheduling only. */
export function getTokenExpMs(token: string): number | null {
  try {
    const part = token.split(".")[1]
    const payload = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")))
    return typeof payload.exp === "number" ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

function isDefinitiveAuthFailure(err: unknown): boolean {
  const e = err as { response?: { status?: number; data?: { data?: { code?: string } } } }
  const code = e?.response?.data?.data?.code
  return (
    e?.response?.status === 401 &&
    (code === "refresh_invalid" || code === "refresh_missing")
  )
}

async function doRefresh(): Promise<string> {
  try {
    // Raw axios (NOT the api instance) — must bypass interceptors.
    const res = await axios.post(REFRESH_URL, {}, {
      withCredentials: true,
      timeout: REFRESH_TIMEOUT_MS,
    })
    const token = res.data?.data?.access_token as string
    if (!token) throw new Error("Malformed refresh response")
    useAuthStore.getState().updateAccessToken(token)
    scheduleProactiveRefresh(token)
    return token
  } catch (err) {
    if (isDefinitiveAuthFailure(err)) {
      clearProactiveTimer()
      useAuthStore.getState().clearAuth("expired")
      throw new SessionExpiredError()
    }
    throw err // retryable — caller decides; auth state untouched
  }
}

/** Single-flighted per tab AND across tabs (Web Locks where available). */
export function getFreshAccessToken(): Promise<string> {
  if (inflight) return inflight
  const run = async (): Promise<string> => {
    if (typeof navigator !== "undefined" && "locks" in navigator) {
      // Cross-tab mutex: after the winning tab rotates, the shared cookie jar
      // already holds the new cookie, so waiting tabs refresh cleanly.
      return refreshUnderLock((navigator as Navigator & { locks: LockManager }).locks)
    }
    return doRefresh() // fallback (older Safari): per-tab single-flight only;
                       // the server grace window covers cross-tab races
  }
  inflight = run().finally(() => { inflight = null })
  return inflight
}

/** The refresh, under the cross-tab lock, but never waiting on it for ever. */
async function refreshUnderLock(locks: LockManager): Promise<string> {
  const controller = new AbortController()
  let granted = false
  const timer = setTimeout(() => controller.abort(), LOCK_WAIT_MS)

  try {
    return await locks.request(
      "goatza-token-refresh",
      { signal: controller.signal },
      () => {
        granted = true
        clearTimeout(timer)
        return doRefresh()
      }
    )
  } catch (err) {
    // Gave up waiting for another tab's refresh (see LOCK_WAIT_MS).
    if (!granted && controller.signal.aborted) return doRefresh()
    throw err
  } finally {
    clearTimeout(timer)
  }
}

/** Return current token, refreshing first if missing or expiring soon. */
export async function ensureFreshToken(): Promise<string> {
  const current = useAuthStore.getState().accessToken
  if (current) {
    const exp = getTokenExpMs(current)
    if (exp !== null && exp - Date.now() > NEAR_EXPIRY_MS) return current
  }
  return getFreshAccessToken()
}

function clearProactiveTimer() {
  if (proactiveTimer) {
    clearTimeout(proactiveTimer)
    proactiveTimer = null
  }
}

export function scheduleProactiveRefresh(token: string) {
  if (typeof window === "undefined") return
  clearProactiveTimer()
  attachLifecycleListeners()
  const exp = getTokenExpMs(token)
  if (exp === null) return
  const delay = Math.max(exp - Date.now() - PROACTIVE_LEAD_MS, 5_000)
  proactiveTimer = setTimeout(() => {
    getFreshAccessToken().catch(() => {
      /* retryable failure: the 401-interceptor / next resume will recover */
    })
  }, delay)
}

/** PWA resume / tab refocus: refresh before the app fires requests. */
function attachLifecycleListeners() {
  if (listenersAttached || typeof document === "undefined") return
  listenersAttached = true
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return
    const token = useAuthStore.getState().accessToken
    if (!token) return
    const exp = getTokenExpMs(token)
    if (exp === null || exp - Date.now() < NEAR_EXPIRY_MS) {
      getFreshAccessToken().catch(() => {})
    }
  })
}
