"use client"

import { useMemo, useSyncExternalStore } from "react"
import { detectPlatform, isStandalone, type PlatformInfo, type PwaOs } from "./platform"
import { usePWAInstall } from "./usePWAInstall"

/** Which iOS Safari steps apply: iOS 26+ (••• menu) or 18 and older (Share bar). */
export type IosSteps = "modern" | "classic"

/**
 * What the install page should show. Exactly one mode.
 *
 * "unknown" on the server and during hydration, so a page renders a skeleton
 * and never mismatches. Every other mode carries `platform` for wording and
 * counting.
 */
export type InstallTarget =
  | { mode: "unknown"; platform: null }
  | { mode: "installed"; platform: PlatformInfo }
  | { mode: "in-app"; appName: string | null; os: PwaOs; platform: PlatformInfo }
  | { mode: "android-prompt"; platform: PlatformInfo }
  | { mode: "android-menu"; platform: PlatformInfo }
  | { mode: "ios-safari"; iosSteps: IosSteps; platform: PlatformInfo }
  | { mode: "ios-chrome"; platform: PlatformInfo }
  | { mode: "ios-other"; platform: PlatformInfo }
  | { mode: "desktop"; canPrompt: boolean; isMacSafari: boolean; platform: PlatformInfo }

export type InstallMode = InstallTarget["mode"]

/** iOS 26 is where Safari moved Share behind the ••• menu. */
const MODERN_SAFARI_MAJOR = 26

const UNKNOWN: InstallTarget = { mode: "unknown", platform: null }

/**
 * The decision, pure. First match wins: installed, then in-app (it cannot
 * install whatever the OS), then by OS and browser.
 */
export function resolveInstallTarget({
  platform,
  standalone,
  canPrompt,
  installedNow,
}: {
  platform: PlatformInfo
  standalone: boolean
  canPrompt: boolean
  installedNow: boolean
}): InstallTarget {
  if (standalone || installedNow) return { mode: "installed", platform }

  if (platform.inApp) {
    return { mode: "in-app", appName: platform.inApp.name, os: platform.os, platform }
  }

  if (platform.os === "android") {
    return canPrompt
      ? { mode: "android-prompt", platform }
      : { mode: "android-menu", platform }
  }

  if (platform.os === "ios") {
    if (platform.browser === "safari") {
      // An unreadable version reads as current: a new phone is the likelier
      // guess, and its steps are the ones a wrong guess costs least on.
      const major = platform.safariMajor
      const iosSteps: IosSteps =
        major === null || major >= MODERN_SAFARI_MAJOR ? "modern" : "classic"
      return { mode: "ios-safari", iosSteps, platform }
    }
    if (platform.browser === "chrome") return { mode: "ios-chrome", platform }
    // Firefox, Edge, Opera and anything else on iOS: send them to Safari.
    return { mode: "ios-other", platform }
  }

  // Desktop, and the rare OS we could not name.
  return {
    mode: "desktop",
    canPrompt,
    isMacSafari: platform.os === "desktop" && platform.browser === "safari",
    platform,
  }
}

type Environment = { platform: PlatformInfo; standalone: boolean }

// Read once per page: neither the user agent nor display-mode changes while a
// page is open (installing on a desktop opens a NEW window). Cached so
// useSyncExternalStore gets the same object every time.
let environment: Environment | null = null

function getEnvironment(): Environment {
  if (!environment) {
    environment = {
      platform: detectPlatform(navigator.userAgent, navigator),
      standalone: isStandalone(),
    }
  }
  return environment
}

const getServerEnvironment = () => null
const subscribeToNothing = () => () => {}

/**
 * The install page's mode for this browser. Upgrades android-menu to
 * android-prompt by itself when the prompt arrives, and moves to "installed"
 * when the install completes.
 */
export function useInstallTarget(): InstallTarget {
  const { canPrompt, installedNow } = usePWAInstall()
  const env = useSyncExternalStore<Environment | null>(
    subscribeToNothing,
    getEnvironment,
    getServerEnvironment
  )

  return useMemo(
    () =>
      env
        ? resolveInstallTarget({
            platform: env.platform,
            standalone: env.standalone,
            canPrompt,
            installedNow,
          })
        : UNKNOWN,
    [env, canPrompt, installedNow]
  )
}

/** Tests only: read the user agent and display-mode again on next use. */
export function resetInstallEnvironmentForTests(): void {
  environment = null
}
