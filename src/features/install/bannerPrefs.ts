/**
 * How often the feed's install banner may show, kept in localStorage under
 * "goatza:install-banner" as {dismissCount, hiddenUntil, installed}.
 *
 *   - "Not now": hidden for 3 days and counted. The third "Not now" is final.
 *   - "Got it" in the iPhone sheet: hidden for 3 days, not counted (the person
 *     did what was asked; they were not saying no).
 *   - Installed from the banner or the browser: never again in this browser.
 *
 * Every storage access is in try/catch. Without storage the same rules hold
 * in memory, so a dismissal lasts for this visit only.
 */

export const BANNER_STORAGE_KEY = "goatza:install-banner"

export const BANNER_SNOOZE_MS = 3 * 24 * 60 * 60 * 1000

/** After this many "Not now"s the banner never shows again. */
export const BANNER_MAX_DISMISSALS = 3

export type BannerPrefs = {
  dismissCount: number
  hiddenUntil: number
  installed?: boolean
}

const EMPTY: BannerPrefs = { dismissCount: 0, hiddenUntil: 0 }

// Used when storage throws: the visit still remembers.
let memory: BannerPrefs | null = null

function sanitize(value: unknown): BannerPrefs {
  if (!value || typeof value !== "object") return EMPTY
  const raw = value as Record<string, unknown>
  return {
    dismissCount: Number.isFinite(raw.dismissCount) ? Number(raw.dismissCount) : 0,
    hiddenUntil: Number.isFinite(raw.hiddenUntil) ? Number(raw.hiddenUntil) : 0,
    ...(raw.installed === true ? { installed: true } : {}),
  }
}

export function readBannerPrefs(): BannerPrefs {
  try {
    const stored = localStorage.getItem(BANNER_STORAGE_KEY)
    return stored ? sanitize(JSON.parse(stored)) : (memory ?? EMPTY)
  } catch {
    return memory ?? EMPTY
  }
}

function writeBannerPrefs(prefs: BannerPrefs): void {
  memory = prefs
  try {
    localStorage.setItem(BANNER_STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // Memory only: this visit remembers, the next one starts fresh.
  }
}

export function isBannerHidden(prefs: BannerPrefs, now: number = Date.now()): boolean {
  return (
    prefs.installed === true ||
    prefs.dismissCount >= BANNER_MAX_DISMISSALS ||
    prefs.hiddenUntil > now
  )
}

/** "Not now". */
export function dismissBanner(now: number = Date.now()): BannerPrefs {
  const prefs = readBannerPrefs()
  const next = { ...prefs, dismissCount: prefs.dismissCount + 1, hiddenUntil: now + BANNER_SNOOZE_MS }
  writeBannerPrefs(next)
  return next
}

/** "Got it" in the iPhone sheet: same 3 days, not counted. */
export function snoozeBanner(now: number = Date.now()): BannerPrefs {
  const next = { ...readBannerPrefs(), hiddenUntil: now + BANNER_SNOOZE_MS }
  writeBannerPrefs(next)
  return next
}

export function markBannerInstalled(): BannerPrefs {
  const next = { ...readBannerPrefs(), installed: true }
  writeBannerPrefs(next)
  return next
}

/** Tests only: forget the in-memory fallback. */
export function resetBannerMemoryForTests(): void {
  memory = null
}
