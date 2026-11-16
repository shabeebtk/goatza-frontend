/**
 * The browser the install tests pretend to be. Not a test file. jsdom has no
 * install events and no display-mode, so each test says what it is: a user
 * agent, a home-screen app or not, and a prompt Chrome may have offered.
 */

import { vi } from "vitest"

import {
  APP_INSTALLED_EVENT,
  INSTALL_PROMPT_EVENT,
  INSTALL_PROMPT_GLOBAL,
  INSTALLED_GLOBAL,
  type BeforeInstallPromptEvent,
  type InstallWindow,
} from "../constants"
import { resetInstallPromptForTests } from "../installPrompt"
import { resetInstallEnvironmentForTests } from "../useInstallTarget"

export function setUserAgent(ua: string, maxTouchPoints = 0): void {
  vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(ua)
  Object.defineProperty(window.navigator, "maxTouchPoints", {
    configurable: true,
    get: () => maxTouchPoints,
  })
}

/** A home-screen app (display-mode: standalone), or an ordinary tab. */
export function setStandalone(standalone: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: standalone && query.includes("standalone"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  })
}

export type FakePrompt = BeforeInstallPromptEvent & { prompt: ReturnType<typeof vi.fn> }

/** A captured `beforeinstallprompt` whose dialog will be answered `outcome`. */
export function fakePrompt(outcome: "accepted" | "dismissed" = "accepted"): FakePrompt {
  const event = new Event("beforeinstallprompt") as FakePrompt
  event.prompt = vi.fn(async () => {})
  Object.defineProperty(event, "userChoice", {
    value: Promise.resolve({ outcome, platform: "web" }),
  })
  return event
}

/** What InstallPromptScript does when Chrome fires `beforeinstallprompt`. */
export function offerPrompt(event: BeforeInstallPromptEvent): void {
  ;(window as InstallWindow)[INSTALL_PROMPT_GLOBAL] = event
  window.dispatchEvent(new Event(INSTALL_PROMPT_EVENT))
}

/** What InstallPromptScript does when the browser fires `appinstalled`. */
export function fireAppInstalled(): void {
  ;(window as InstallWindow)[INSTALLED_GLOBAL] = true
  window.dispatchEvent(new Event(APP_INSTALLED_EVENT))
}

/** A fresh page: no globals, no store state, no cached environment. */
export function resetBrowser(): void {
  resetInstallPromptForTests()
  resetInstallEnvironmentForTests()
  delete (window as InstallWindow)[INSTALL_PROMPT_GLOBAL]
  delete (window as InstallWindow)[INSTALLED_GLOBAL]
  setStandalone(false)
}
