"use client"

/**
 * useScreenWakeLock — keep the screen on while an upload is running.
 *
 * A phone that auto-locks mid-upload suspends the page, and iOS kills the
 * request with it: that is the single most common "random" iPhone upload
 * failure. The retry policy in mediaUpload.ts recovers from it once the app is
 * back on screen, but not locking in the first place is better than any
 * recovery. Screen Wake Lock is supported by Safari 16.4+ — iOS home-screen
 * apps included — and by every Chromium.
 *
 * Feature-detected and silent: an unsupported browser, a battery-saver
 * refusal or a permissions policy just means no lock, never an error. The
 * browser drops the lock whenever the page is hidden, so it is asked for again
 * each time the page comes back.
 *
 * Reference-counted at module level, because more than one upload can run at
 * once (several chat photos, say) and the lock must stay until the last one
 * ends. `holdScreenWakeLock()` is the imperative form for code that is not a
 * component; it returns the release.
 */

import { useEffect } from "react"

let holders = 0
let sentinel: WakeLockSentinel | null = null
let requesting = false

const supported = () =>
  typeof navigator !== "undefined" &&
  typeof document !== "undefined" &&
  "wakeLock" in navigator

async function acquire() {
  if (holders === 0 || requesting || document.visibilityState !== "visible") return
  if (sentinel && !sentinel.released) return

  requesting = true
  try {
    const lock = await navigator.wakeLock.request("screen")
    // Everybody let go while the request was in flight.
    if (holders === 0) {
      void lock.release().catch(() => {})
      return
    }
    sentinel = lock
  } catch {
    // Refused: battery saver, a permissions policy, or the page went hidden.
  } finally {
    requesting = false
  }
}

function onVisibility() {
  if (document.visibilityState === "visible") void acquire()
}

/** Ask for the lock until the returned function is called. Never throws. */
export function holdScreenWakeLock(): () => void {
  if (!supported()) return () => {}

  holders++
  if (holders === 1) document.addEventListener("visibilitychange", onVisibility)
  void acquire()

  let released = false
  return () => {
    if (released) return
    released = true
    holders--
    if (holders > 0) return

    document.removeEventListener("visibilitychange", onVisibility)
    const lock = sentinel
    sentinel = null
    if (lock && !lock.released) void lock.release().catch(() => {})
  }
}

/** Hold the screen wake lock for as long as `active` is true. */
export function useScreenWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return
    return holdScreenWakeLock()
  }, [active])
}
