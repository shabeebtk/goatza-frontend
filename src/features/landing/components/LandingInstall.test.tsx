// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { renderToString } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { initInstallPrompt } from "@/core/pwa/installPrompt"
import {
  fakePrompt,
  offerPrompt,
  resetBrowser,
  setStandalone,
  setUserAgent,
  type FakePrompt,
} from "@/core/pwa/testing/browserEnv"
import { UA } from "@/core/pwa/testing/userAgents"
import type { InstallMode } from "@/core/pwa/useInstallTarget"
import { IOS_SHEET_COPY, LANDING_COPY } from "@/features/install/installCopy"
import AppSection from "./AppSection"
import GetAppPill from "./GetAppPill"
import HeroInstallButton, { heroInstallLabel } from "./HeroInstallButton"

const mocks = vi.hoisted(() => ({
  router: { replace: vi.fn(), push: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() },
  toast: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
  usePathname: () => "/",
}))
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))
vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
vi.mock("@/shared/components/ui/Toast/Toast", () => ({ useToast: () => ({ show: mocks.toast }) }))
vi.mock("@/core/pwa/appEvents", () => ({ trackAppEvent: vi.fn() }))
vi.mock("@/features/profile/services/publicProfile.api", () => ({
  siteOrigin: () => "https://goatza.com",
}))

function setBrowser(
  ua: string,
  { prompt, standalone = false }: { prompt?: FakePrompt; standalone?: boolean } = {}
) {
  setUserAgent(ua)
  setStandalone(standalone)
  initInstallPrompt()
  if (prompt) offerPrompt(prompt)
}

beforeEach(() => {
  resetBrowser()
  mocks.toast.mockReset()
  mocks.router.push.mockReset()
})

afterEach(() => {
  cleanup()
  resetBrowser()
  vi.restoreAllMocks()
  document.body.innerHTML = ""
})

describe("the hero button", () => {
  it.each<[InstallMode, string]>([
    ["unknown", LANDING_COPY.heroNeutral],
    ["android-prompt", LANDING_COPY.heroAndroid],
    ["android-menu", LANDING_COPY.heroAndroid],
    ["ios-safari", LANDING_COPY.heroIos],
    ["ios-chrome", LANDING_COPY.heroIos],
    ["ios-other", LANDING_COPY.heroIos],
    ["in-app", LANDING_COPY.heroNeutral],
    ["desktop", LANDING_COPY.heroNeutral],
  ])("%s reads %s", (mode, label) => {
    expect(heroInstallLabel(mode)).toBe(label)
  })

  it("is neutral before mount", () => {
    setBrowser(UA.androidChrome)
    expect(renderToString(<HeroInstallButton />)).toContain(LANDING_COPY.heroNeutral)
  })

  it("links to /install where it is not one tap", () => {
    setBrowser(UA.iphoneSafari26)
    render(<HeroInstallButton />)

    expect(screen.getByRole("link", { name: LANDING_COPY.heroIos }).getAttribute("href")).toBe("/install")
  })

  it("is one tap with Chrome's prompt, with a toast when accepted", async () => {
    const prompt = fakePrompt("accepted")
    setBrowser(UA.androidChrome, { prompt })
    render(<HeroInstallButton />)

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: LANDING_COPY.heroAndroid }))
    })

    expect(prompt.prompt).toHaveBeenCalledTimes(1)
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: LANDING_COPY.installedToast })
    )
    expect(mocks.router.push).not.toHaveBeenCalled()
  })

  it("is gone inside the installed app", () => {
    setBrowser(UA.androidChrome, { standalone: true })
    expect(render(<HeroInstallButton />).container.innerHTML).toBe("")
  })
})

describe("the header pill", () => {
  it("links to /install, and is gone inside the installed app", () => {
    setBrowser(UA.desktopChrome)
    render(<GetAppPill />)
    expect(screen.getByRole("link", { name: LANDING_COPY.headerPill }).getAttribute("href")).toBe("/install")

    cleanup()
    resetBrowser()
    setBrowser(UA.desktopChrome, { standalone: true })
    expect(render(<GetAppPill />).container.innerHTML).toBe("")
  })
})

describe("AppSection", () => {
  it("is hidden inside the installed app", () => {
    setBrowser(UA.iphoneSafari26, { standalone: true })
    expect(render(<AppSection />).container.innerHTML).toBe("")
  })

  it("on an iPhone: Show me how opens the steps sheet", () => {
    setBrowser(UA.iphoneSafari26)
    render(<AppSection />)

    expect(screen.getByText(LANDING_COPY.headlineBottomAccent)).toBeTruthy()
    expect(screen.getByText(LANDING_COPY.noteIos("Safari"))).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: LANDING_COPY.ctaIos }))

    expect(screen.getByRole("dialog", { name: IOS_SHEET_COPY.title })).toBeTruthy()
  })

  it("on Android without a prompt: Install Goatza goes to /install", () => {
    setBrowser(UA.androidChrome)
    render(<AppSection />)

    expect(screen.getByRole("link", { name: LANDING_COPY.ctaAndroid }).getAttribute("href")).toBe("/install")
    expect(screen.getByText(LANDING_COPY.noteAndroid)).toBeTruthy()
  })

  it("on a computer: the QR card, and the computer link only with a prompt", () => {
    setBrowser(UA.desktopChrome)
    render(<AppSection />)

    expect(screen.getByRole("img", { name: LANDING_COPY.qrLabel })).toBeTruthy()
    expect(screen.queryByRole("button", { name: LANDING_COPY.computerLink })).toBeNull()

    cleanup()
    resetBrowser()
    const prompt = fakePrompt("dismissed")
    setBrowser(UA.desktopChrome, { prompt })
    render(<AppSection />)

    fireEvent.click(screen.getByRole("button", { name: LANDING_COPY.computerLink }))
    expect(prompt.prompt).toHaveBeenCalledTimes(1)
  })
})
