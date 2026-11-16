// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react"
import { renderToString } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { initInstallPrompt } from "./installPrompt"
import { detectPlatform, isStandalone, type PlatformInfo } from "./platform"
import { fakePrompt, offerPrompt, resetBrowser, setStandalone, setUserAgent } from "./testing/browserEnv"
import { UA } from "./testing/userAgents"
import { resolveInstallTarget, useInstallTarget } from "./useInstallTarget"

vi.mock("./appEvents", () => ({ trackAppEvent: vi.fn() }))

const platform = (ua: string, maxTouchPoints = 0): PlatformInfo =>
  detectPlatform(ua, { maxTouchPoints })

const resolve = (
  info: PlatformInfo,
  { standalone = false, canPrompt = false, installedNow = false } = {}
) => resolveInstallTarget({ platform: info, standalone, canPrompt, installedNow })

describe("resolveInstallTarget: every mode", () => {
  it("installed: standalone, or installed from this tab", () => {
    expect(resolve(platform(UA.androidChrome), { standalone: true }).mode).toBe("installed")
    expect(resolve(platform(UA.iphoneSafari26), { installedNow: true }).mode).toBe("installed")
  })

  it("in-app: before anything about the OS", () => {
    const target = resolve(platform(UA.instagramIphone))
    expect(target).toMatchObject({ mode: "in-app", appName: "Instagram", os: "ios" })
    expect(resolve(platform(UA.androidWebView))).toMatchObject({
      mode: "in-app",
      appName: null,
      os: "android",
    })
  })

  it("android-prompt and android-menu", () => {
    expect(resolve(platform(UA.androidChrome), { canPrompt: true }).mode).toBe("android-prompt")
    expect(resolve(platform(UA.androidChrome)).mode).toBe("android-menu")
    expect(resolve(platform(UA.samsung)).mode).toBe("android-menu")
  })

  it("ios-safari: modern from 26, classic before it, modern when unknown", () => {
    expect(resolve(platform(UA.iphoneSafari26))).toMatchObject({ mode: "ios-safari", iosSteps: "modern" })
    expect(resolve(platform(UA.iphoneSafari18))).toMatchObject({ mode: "ios-safari", iosSteps: "classic" })
    const unknownVersion: PlatformInfo = { os: "ios", browser: "safari", inApp: null, safariMajor: null }
    expect(resolve(unknownVersion)).toMatchObject({ mode: "ios-safari", iosSteps: "modern" })
  })

  it("ios-chrome and ios-other", () => {
    expect(resolve(platform(UA.iphoneChrome)).mode).toBe("ios-chrome")
    expect(resolve(platform(UA.iphoneFirefox)).mode).toBe("ios-other")
  })

  it("desktop, with canPrompt and isMacSafari", () => {
    expect(resolve(platform(UA.desktopChrome), { canPrompt: true })).toMatchObject({
      mode: "desktop",
      canPrompt: true,
      isMacSafari: false,
    })
    expect(resolve(platform(UA.macSafari))).toMatchObject({ mode: "desktop", isMacSafari: true })
    expect(resolve(platform(UA.ipadOs, 5)).mode).toBe("ios-safari")
  })
})

function Probe() {
  const target = useInstallTarget()
  return <span data-testid="mode">{target.mode}</span>
}

describe("useInstallTarget", () => {
  beforeEach(() => {
    resetBrowser()
  })

  afterEach(() => {
    cleanup()
    resetBrowser()
    vi.restoreAllMocks()
  })

  it("is unknown on the server, so hydration never mismatches", () => {
    setUserAgent(UA.androidChrome)

    expect(renderToString(<Probe />)).toContain("unknown")
  })

  it("knows the browser once mounted, and upgrades when the prompt arrives", () => {
    setUserAgent(UA.androidChrome)
    initInstallPrompt()

    render(<Probe />)
    expect(screen.getByTestId("mode").textContent).toBe("android-menu")

    act(() => offerPrompt(fakePrompt()))

    expect(screen.getByTestId("mode").textContent).toBe("android-prompt")
  })

  it("is installed inside the home-screen app", () => {
    setUserAgent(UA.iphoneSafari26)
    setStandalone(true)

    render(<Probe />)

    expect(screen.getByTestId("mode").textContent).toBe("installed")
  })
})

describe("isStandalone", () => {
  afterEach(() => {
    resetBrowser()
    vi.restoreAllMocks()
  })

  it("reads display-mode standalone and fullscreen, and iOS's flag", () => {
    setStandalone(false)
    expect(isStandalone()).toBe(false)

    setStandalone(true)
    expect(isStandalone()).toBe(true)

    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (query: string) => ({ matches: query.includes("fullscreen") }),
    })
    expect(isStandalone()).toBe(true)

    setStandalone(false)
    Object.defineProperty(window.navigator, "standalone", { configurable: true, value: true })
    expect(isStandalone()).toBe(true)
    Object.defineProperty(window.navigator, "standalone", { configurable: true, value: undefined })
  })
})
