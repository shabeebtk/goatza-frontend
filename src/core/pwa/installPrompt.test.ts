// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { INSTALL_PROMPT_GLOBAL, type InstallWindow } from "./constants"
import { getSnapshot, initInstallPrompt, promptInstall, subscribe } from "./installPrompt"
import { fakePrompt, fireAppInstalled, offerPrompt, resetBrowser } from "./testing/browserEnv"

const track = vi.hoisted(() => vi.fn())
vi.mock("./appEvents", () => ({ trackAppEvent: track }))

beforeEach(() => {
  resetBrowser()
  track.mockReset()
})

afterEach(() => {
  resetBrowser()
})

describe("capturing the prompt", () => {
  it("picks up a prompt the <head> script caught before init", () => {
    ;(window as InstallWindow)[INSTALL_PROMPT_GLOBAL] = fakePrompt()

    initInstallPrompt()

    expect(getSnapshot()).toEqual({ canPrompt: true, installedNow: false, lastOutcome: null })
  })

  it("follows a prompt that arrives after init, and tells subscribers", () => {
    initInstallPrompt()
    const listener = vi.fn()
    subscribe(listener)

    expect(getSnapshot().canPrompt).toBe(false)
    offerPrompt(fakePrompt())

    expect(getSnapshot().canPrompt).toBe(true)
    expect(listener).toHaveBeenCalled()
  })

  it("is idempotent", () => {
    initInstallPrompt()
    initInstallPrompt()
    const listener = vi.fn()
    subscribe(listener)

    offerPrompt(fakePrompt())

    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe("promptInstall", () => {
  it("accepted: shows the dialog once and marks installed", async () => {
    const event = fakePrompt("accepted")
    initInstallPrompt()
    offerPrompt(event)

    await expect(promptInstall()).resolves.toBe("accepted")

    expect(event.prompt).toHaveBeenCalledTimes(1)
    expect(getSnapshot()).toEqual({ canPrompt: false, installedNow: true, lastOutcome: "accepted" })
  })

  it("dismissed: the prompt is spent, nothing is installed", async () => {
    initInstallPrompt()
    offerPrompt(fakePrompt("dismissed"))

    await expect(promptInstall()).resolves.toBe("dismissed")

    expect(getSnapshot()).toEqual({ canPrompt: false, installedNow: false, lastOutcome: "dismissed" })
  })

  it("unavailable without a captured prompt", async () => {
    initInstallPrompt()

    await expect(promptInstall()).resolves.toBe("unavailable")
  })

  it("never calls prompt() twice on one event", async () => {
    const event = fakePrompt("dismissed")
    initInstallPrompt()
    offerPrompt(event)

    const [first, second] = await Promise.all([promptInstall(), promptInstall()])

    expect(first).toBe("dismissed")
    expect(second).toBe("unavailable")
    expect(event.prompt).toHaveBeenCalledTimes(1)
    expect((window as InstallWindow)[INSTALL_PROMPT_GLOBAL]).toBeNull()
  })

  it("a prompt that throws is unavailable, not an error", async () => {
    const event = fakePrompt()
    event.prompt.mockRejectedValue(new Error("NotAllowedError"))
    initInstallPrompt()
    offerPrompt(event)

    await expect(promptInstall()).resolves.toBe("unavailable")
  })
})

describe("appinstalled", () => {
  it("after our prompt was accepted: installed, counted as prompt", async () => {
    initInstallPrompt()
    offerPrompt(fakePrompt("accepted"))
    await promptInstall()

    fireAppInstalled()

    expect(getSnapshot().installedNow).toBe(true)
    expect(track).toHaveBeenCalledWith("installed", { source: "prompt" })
  })

  it("while our dialog is still open: counted as prompt", () => {
    initInstallPrompt()
    offerPrompt(fakePrompt("accepted"))
    void promptInstall()

    fireAppInstalled()

    expect(track).toHaveBeenCalledWith("installed", { source: "prompt" })
  })

  it("from the browser's menu: counted as browser_menu", () => {
    initInstallPrompt()

    fireAppInstalled()

    expect(getSnapshot()).toEqual({ canPrompt: false, installedNow: true, lastOutcome: null })
    expect(track).toHaveBeenCalledWith("installed", { source: "browser_menu" })
  })

  it("after a dismissal: counted as browser_menu", async () => {
    initInstallPrompt()
    offerPrompt(fakePrompt("dismissed"))
    await promptInstall()

    fireAppInstalled()

    expect(track).toHaveBeenCalledWith("installed", { source: "browser_menu" })
  })

  it("before init: picked up, and the install wins over a stale prompt", () => {
    ;(window as InstallWindow)[INSTALL_PROMPT_GLOBAL] = fakePrompt()
    fireAppInstalled()

    initInstallPrompt()

    expect(getSnapshot()).toEqual({ canPrompt: false, installedNow: true, lastOutcome: null })
    expect(track).toHaveBeenCalledTimes(1)
  })

  it("is counted once per page", () => {
    initInstallPrompt()

    fireAppInstalled()
    fireAppInstalled()

    expect(track).toHaveBeenCalledTimes(1)
  })
})
