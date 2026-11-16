/**
 * The install prompt, as one module store.
 *
 * InstallPromptScript (in <head>) owns the native listeners and parks what it
 * catches on window; this store adopts it when initInstallPrompt() runs (once,
 * from providers.tsx) and follows the script's custom events after that. React
 * reads it through usePWAInstall (useSyncExternalStore).
 *
 * A captured prompt can be shown exactly once: prompt() is single-use per
 * event, so promptInstall() hands it over and forgets it. Chromium fires a
 * fresh `beforeinstallprompt` later if the person said no.
 */

import { trackAppEvent } from "./appEvents"
import {
  APP_INSTALLED_EVENT,
  INSTALL_PROMPT_EVENT,
  INSTALL_PROMPT_GLOBAL,
  INSTALLED_GLOBAL,
  type BeforeInstallPromptEvent,
  type InstallWindow,
} from "./constants"

export type InstallOutcome = "accepted" | "dismissed"

export type InstallPromptSnapshot = {
  /** A captured prompt is waiting: our Install button can open it. */
  canPrompt: boolean
  /** Installed during this page's life (accepted, or `appinstalled` fired). */
  installedNow: boolean
  /** What the person answered the last prompt we showed, if any. */
  lastOutcome: InstallOutcome | null
}

const SERVER_SNAPSHOT: InstallPromptSnapshot = {
  canPrompt: false,
  installedNow: false,
  lastOutcome: null,
}

let snapshot: InstallPromptSnapshot = SERVER_SNAPSHOT
let deferred: BeforeInstallPromptEvent | null = null
let initialized = false
// Between prompt() and the answer. `appinstalled` can land before userChoice
// settles, and an install that started from our button must count as ours.
let promptInFlight = false
let installCounted = false

const listeners = new Set<() => void>()

function update(patch: Partial<InstallPromptSnapshot>) {
  const next = { ...snapshot, ...patch }
  if (
    next.canPrompt === snapshot.canPrompt &&
    next.installedNow === snapshot.installedNow &&
    next.lastOutcome === snapshot.lastOutcome
  ) {
    return
  }
  snapshot = next
  listeners.forEach((listener) => listener())
}

function installWindow(): InstallWindow {
  return window as InstallWindow
}

function adoptPrompt() {
  const event = installWindow()[INSTALL_PROMPT_GLOBAL]
  if (!event) return
  deferred = event
  // Chromium only offers a prompt while the app is NOT installed, so a fresh
  // one also means an earlier install is gone (uninstalled in this session).
  update({ canPrompt: true, installedNow: false })
}

function markInstalled() {
  deferred = null
  installWindow()[INSTALL_PROMPT_GLOBAL] = null
  update({ canPrompt: false, installedNow: true })

  if (installCounted) return
  installCounted = true
  trackAppEvent("installed", {
    source:
      snapshot.lastOutcome === "accepted" || promptInFlight ? "prompt" : "browser_menu",
  })
}

/**
 * Start following the install prompt. Idempotent; a no-op on the server.
 * Adopts whatever the <head> script caught before this ran.
 */
export function initInstallPrompt(): void {
  if (initialized || typeof window === "undefined") return
  initialized = true

  window.addEventListener(INSTALL_PROMPT_EVENT, adoptPrompt)
  window.addEventListener(APP_INSTALLED_EVENT, markInstalled)

  // Prompt first, then installed: if both happened before hydration, the
  // install is the later fact and must win.
  adoptPrompt()
  if (installWindow()[INSTALLED_GLOBAL] === true) markInstalled()
}

export function getSnapshot(): InstallPromptSnapshot {
  return snapshot
}

export function getServerSnapshot(): InstallPromptSnapshot {
  return SERVER_SNAPSHOT
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Open the browser's install dialog. "unavailable" when there is no captured
 * prompt (an iPhone, a browser that never offered one, or one already used).
 */
export async function promptInstall(): Promise<InstallOutcome | "unavailable"> {
  const event = deferred
  if (!event) return "unavailable"

  // Single use: forget it before showing it, so a double tap cannot call
  // prompt() twice on the same event.
  deferred = null
  if (typeof window !== "undefined") installWindow()[INSTALL_PROMPT_GLOBAL] = null
  update({ canPrompt: false })

  promptInFlight = true
  try {
    await event.prompt()
    const choice = await event.userChoice
    const outcome: InstallOutcome = choice.outcome === "accepted" ? "accepted" : "dismissed"
    update(
      outcome === "accepted"
        ? { lastOutcome: outcome, installedNow: true }
        : { lastOutcome: outcome }
    )
    return outcome
  } catch {
    return "unavailable"
  } finally {
    promptInFlight = false
  }
}

/**
 * Tests only: stop listening and forget everything, as if the page had just
 * loaded. Module state outlives a test, and so do window listeners.
 */
export function resetInstallPromptForTests(): void {
  if (typeof window !== "undefined") {
    window.removeEventListener(INSTALL_PROMPT_EVENT, adoptPrompt)
    window.removeEventListener(APP_INSTALLED_EVENT, markInstalled)
  }
  snapshot = SERVER_SNAPSHOT
  deferred = null
  initialized = false
  promptInFlight = false
  installCounted = false
  listeners.clear()
}
