// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { initInstallPrompt } from "@/core/pwa/installPrompt"
import {
  fakePrompt,
  fireAppInstalled,
  offerPrompt,
  resetBrowser,
  setStandalone,
  setUserAgent,
  type FakePrompt,
} from "@/core/pwa/testing/browserEnv"
import { UA } from "@/core/pwa/testing/userAgents"
import {
  BANNER_SNOOZE_MS,
  BANNER_STORAGE_KEY,
  resetBannerMemoryForTests,
} from "../../bannerPrefs"
import { ANDROID_MENU_COPY, BANNER_COPY, IOS_SHEET_COPY } from "../../installCopy"
import InstallBanner, { INSTALLED_MESSAGE_MS } from "./InstallBanner"

const mocks = vi.hoisted(() => ({
  router: { replace: vi.fn(), push: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() },
}))

vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
  usePathname: () => "/home",
}))
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))
vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
vi.mock("@/core/pwa/appEvents", () => ({ trackAppEvent: vi.fn() }))

const NOW = new Date("2026-11-16T09:00:00Z").getTime()

function renderBanner(
  ua: string,
  { prompt, standalone = false }: { prompt?: FakePrompt; standalone?: boolean } = {}
) {
  setUserAgent(ua)
  setStandalone(standalone)
  initInstallPrompt()
  if (prompt) offerPrompt(prompt)
  return render(<InstallBanner />)
}

function storedPrefs() {
  return JSON.parse(localStorage.getItem(BANNER_STORAGE_KEY) ?? "null")
}

beforeEach(() => {
  resetBrowser()
  resetBannerMemoryForTests()
  localStorage.clear()
  vi.spyOn(Date, "now").mockReturnValue(NOW)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  resetBrowser()
  document.body.innerHTML = ""
})

describe("where it shows", () => {
  it("never on a desktop", () => {
    const { container } = renderBanner(UA.desktopChrome)
    expect(container.innerHTML).toBe("")
  })

  it("never inside the installed app", () => {
    const { container } = renderBanner(UA.androidChrome, { standalone: true })
    expect(container.innerHTML).toBe("")
  })

  it("hides at once when the app is installed from the browser's menu", () => {
    const { container } = renderBanner(UA.androidChrome)
    expect(screen.getByText(BANNER_COPY.androidTitle)).toBeTruthy()

    act(() => fireAppInstalled())

    expect(container.innerHTML).toBe("")
    expect(storedPrefs()).toMatchObject({ installed: true })
  })
})

describe("Android", () => {
  it("without a prompt, Install opens Chrome's menu steps", () => {
    renderBanner(UA.androidChrome)

    expect(screen.getByText(BANNER_COPY.androidText)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: BANNER_COPY.androidCta }))

    expect(screen.getByRole("dialog", { name: ANDROID_MENU_COPY.title })).toBeTruthy()
  })

  it("with a prompt, one tap; accepted says so for 4 seconds, then gone for good", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const prompt = fakePrompt("accepted")
    const { container } = renderBanner(UA.androidChrome, { prompt })

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: BANNER_COPY.androidCta }))
    })

    expect(screen.getByText(BANNER_COPY.installed)).toBeTruthy()
    expect(prompt.prompt).toHaveBeenCalledTimes(1)
    expect(storedPrefs()).toMatchObject({ installed: true })

    act(() => {
      vi.advanceTimersByTime(INSTALLED_MESSAGE_MS)
    })

    expect(container.innerHTML).toBe("")
  })
})

describe("iPhone", () => {
  it("Safari: Show me how opens the steps; Got it hides it for 3 days without counting", async () => {
    const { container } = renderBanner(UA.iphoneSafari26)

    expect(screen.getByText(BANNER_COPY.iosTitle)).toBeTruthy()
    expect(screen.getByText(BANNER_COPY.iosCtaNote)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: BANNER_COPY.iosCta }))

    const sheet = screen.getByRole("dialog", { name: IOS_SHEET_COPY.title })
    expect(sheet.textContent).toContain("Tap ••• in Safari")
    expect(sheet.textContent).toContain(IOS_SHEET_COPY.belowHint)

    fireEvent.click(screen.getByRole("button", { name: IOS_SHEET_COPY.gotIt }))

    await waitFor(() => expect(container.innerHTML).toBe(""))
    expect(storedPrefs()).toEqual({ dismissCount: 0, hiddenUntil: NOW + BANNER_SNOOZE_MS })
  })

  it("an in-app browser links to /install with the iPhone wording", () => {
    renderBanner(UA.instagramIphone)

    expect(screen.getByText(BANNER_COPY.iosTitle)).toBeTruthy()
    expect(screen.getByRole("link", { name: BANNER_COPY.iosCta }).getAttribute("href")).toBe("/install")
  })
})

describe("how often", () => {
  it("Not now hides it for 3 days, and it comes back after", () => {
    const { container } = renderBanner(UA.androidChrome)

    fireEvent.click(screen.getByRole("button", { name: BANNER_COPY.notNow }))

    expect(container.innerHTML).toBe("")
    expect(storedPrefs()).toEqual({ dismissCount: 1, hiddenUntil: NOW + BANNER_SNOOZE_MS })

    cleanup()
    vi.mocked(Date.now).mockReturnValue(NOW + BANNER_SNOOZE_MS - 60_000)
    expect(render(<InstallBanner />).container.innerHTML).toBe("")

    cleanup()
    vi.mocked(Date.now).mockReturnValue(NOW + BANNER_SNOOZE_MS + 60_000)
    render(<InstallBanner />)
    expect(screen.getByText(BANNER_COPY.androidTitle)).toBeTruthy()
  })

  it("is gone for good after the third Not now", () => {
    localStorage.setItem(BANNER_STORAGE_KEY, JSON.stringify({ dismissCount: 2, hiddenUntil: 0 }))
    renderBanner(UA.androidChrome)

    fireEvent.click(screen.getByRole("button", { name: BANNER_COPY.notNow }))
    expect(storedPrefs().dismissCount).toBe(3)

    cleanup()
    vi.mocked(Date.now).mockReturnValue(NOW + 100 * BANNER_SNOOZE_MS)
    expect(render(<InstallBanner />).container.innerHTML).toBe("")
  })

  it("still renders when storage throws, and remembers a dismissal for this visit", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError")
    })
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError")
    })

    renderBanner(UA.androidChrome)
    expect(screen.getByText(BANNER_COPY.androidTitle)).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: BANNER_COPY.notNow }))
    cleanup()

    expect(render(<InstallBanner />).container.innerHTML).toBe("")
  })

  // Its 44px hit area is CSS (InstallBanner.module.css), which jsdom cannot measure.
  it("the Not now button carries its label", () => {
    renderBanner(UA.androidChrome)

    const notNow = screen.getByRole("button", { name: BANNER_COPY.notNow })
    expect(notNow.getAttribute("aria-label")).toBe("Not now")
  })
})
