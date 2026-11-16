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
import {
  ANDROID_COPY,
  ANDROID_MENU_COPY,
  DESKTOP_COPY,
  IN_APP_COPY,
  INSTALLED_COPY,
  IOS_COPY,
  SKELETON_STATUS,
} from "../../installCopy"
import InstallPage from "./InstallPage"
import styles from "./InstallPage.module.css"
import IosInstall from "./IosInstall"

/** The sticky actions area an element sits in, if any. */
const actionsOf = (element: Element) => element.closest(`.${styles.actions}`)

const mocks = vi.hoisted(() => ({
  router: { replace: vi.fn(), push: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() },
  toast: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
  usePathname: () => "/install",
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

function renderPage(
  ua: string,
  { prompt, standalone = false, touch = 0 }: { prompt?: FakePrompt; standalone?: boolean; touch?: number } = {}
) {
  setUserAgent(ua, touch)
  setStandalone(standalone)
  initInstallPrompt()
  if (prompt) offerPrompt(prompt)
  return render(<InstallPage />)
}

beforeEach(() => {
  resetBrowser()
  mocks.router.replace.mockReset()
  mocks.toast.mockReset()
  // jsdom does not implement scrolling; the Installed panel calls it.
  vi.spyOn(window, "scrollTo").mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  resetBrowser()
  vi.restoreAllMocks()
  document.body.innerHTML = ""
})

describe("before the browser is known", () => {
  it("renders the skeleton on the server", () => {
    setUserAgent(UA.androidChrome)
    expect(renderToString(<InstallPage />)).toContain(SKELETON_STATUS)
  })
})

describe("installed", () => {
  it("opened inside the app: straight to the feed", () => {
    renderPage(UA.androidChrome, { standalone: true })

    expect(mocks.router.replace).toHaveBeenCalledWith("/home")
    expect(screen.getByRole("status").textContent).toBe(SKELETON_STATUS)
  })
})

describe("Android", () => {
  it("android-prompt: one tap, then the Installed panel", async () => {
    const prompt = fakePrompt("accepted")
    renderPage(UA.androidChrome, { prompt })

    expect(screen.getByText(ANDROID_COPY.headlineBottom)).toBeTruthy()
    const install = screen.getByRole("button", { name: ANDROID_COPY.cta })
    expect(actionsOf(install)).toBeTruthy()
    fireEvent.click(install)

    expect(await screen.findByText(INSTALLED_COPY.headlineBottom)).toBeTruthy()
    expect(prompt.prompt).toHaveBeenCalledTimes(1)
    expect(screen.getByText(INSTALLED_COPY.tip)).toBeTruthy()
    const keepUsing = screen.getByRole("link", { name: INSTALLED_COPY.keepUsing })
    expect(keepUsing.getAttribute("href")).toBe("/")
    expect(actionsOf(keepUsing)).toBeTruthy()
    expect(mocks.router.replace).not.toHaveBeenCalled()
  })

  it("the Installed panel starts at the top, with focus on its heading", async () => {
    renderPage(UA.androidChrome, { prompt: fakePrompt("accepted") })

    fireEvent.click(screen.getByRole("button", { name: ANDROID_COPY.cta }))
    const heading = (await screen.findByText(INSTALLED_COPY.headlineBottom)).closest("h1")

    expect(window.scrollTo).toHaveBeenCalledWith(0, 0)
    expect(heading?.getAttribute("tabindex")).toBe("-1")
    expect(document.activeElement).toBe(heading)
  })

  it("dismissed: stays, with a quiet line", async () => {
    renderPage(UA.androidChrome, { prompt: fakePrompt("dismissed") })

    fireEvent.click(screen.getByRole("button", { name: ANDROID_COPY.cta }))

    expect(await screen.findByText(ANDROID_COPY.dismissed)).toBeTruthy()
    expect(screen.queryByText(INSTALLED_COPY.headlineBottom)).toBeNull()
  })

  it("android-menu: the button opens Chrome's menu steps", () => {
    renderPage(UA.androidChrome)

    fireEvent.click(screen.getByRole("button", { name: ANDROID_COPY.cta }))

    const sheet = screen.getByRole("dialog", { name: ANDROID_MENU_COPY.title })
    for (const step of ANDROID_MENU_COPY.steps) expect(sheet.textContent).toContain(step)
    expect(sheet.textContent).toContain(ANDROID_MENU_COPY.otherBrowsers)
    expect(sheet.textContent).toContain(ANDROID_MENU_COPY.inAppTab)
  })

  it("android-menu becomes one tap when the prompt arrives", async () => {
    renderPage(UA.androidChrome)
    const prompt = fakePrompt("dismissed")

    act(() => offerPrompt(prompt))
    fireEvent.click(screen.getByRole("button", { name: ANDROID_COPY.cta }))

    expect(await screen.findByText(ANDROID_COPY.dismissed)).toBeTruthy()
    expect(prompt.prompt).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})

describe("iPhone Safari", () => {
  it("modern: ••• first, Next / Back / Done, and the toolbar arrow on step 1", () => {
    const { container } = renderPage(UA.iphoneSafari26)

    // Nothing to keep on screen here: no actions area, so no empty sticky bar.
    expect(container.querySelector(`.${styles.actions}`)).toBeNull()

    expect(screen.getByText(IOS_COPY.headlineBottom)).toBeTruthy()
    expect(screen.getByText(IOS_COPY.lede("Safari"))).toBeTruthy()
    expect(screen.getByText("Step 1 of 3")).toBeTruthy()
    expect(screen.getByText("Tap ••• in Safari")).toBeTruthy()
    expect(screen.getByText(IOS_COPY.arrowModern)).toBeTruthy()
    expect(screen.queryByText(IOS_COPY.olderIphone)).toBeNull()

    const back = screen.getByRole("button", { name: IOS_COPY.back }) as HTMLButtonElement
    expect(back.disabled).toBe(true)

    fireEvent.click(screen.getByRole("button", { name: IOS_COPY.next }))
    expect(screen.getByText("Step 2 of 3")).toBeTruthy()
    expect(screen.getByText("Tap Share, then \"Add to Home Screen\"")).toBeTruthy()
    expect(screen.queryByText(IOS_COPY.arrowModern)).toBeNull()

    fireEvent.click(back)
    expect(screen.getByText("Step 1 of 3")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: IOS_COPY.next }))
    fireEvent.click(screen.getByRole("button", { name: IOS_COPY.next }))
    expect(screen.getByText("Keep \"Open as Web App\" on, tap Add")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: IOS_COPY.done }))
    expect(screen.getByText(IOS_COPY.doneNote)).toBeTruthy()
  })

  it("classic: the Share button first, and the arrow says Share", () => {
    renderPage(UA.iphoneSafari18)

    expect(screen.getByText("Tap the Share button")).toBeTruthy()
    expect(screen.getByText(IOS_COPY.arrowClassic)).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: IOS_COPY.next }))
    expect(screen.getByText("Tap \"Add to Home Screen\"")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: IOS_COPY.next }))
    expect(screen.getByText("Tap Add")).toBeTruthy()
  })

  it("unknown version: the modern steps plus a line for older phones", () => {
    render(<IosInstall browser="safari" iosSteps="modern" safariMajorKnown={false} />)

    expect(screen.getByText("Tap ••• in Safari")).toBeTruthy()
    expect(screen.getByText(IOS_COPY.olderIphone)).toBeTruthy()
  })
})

describe("Chrome on iPhone", () => {
  it("its own three steps, and no toolbar arrow", () => {
    renderPage(UA.iphoneChrome)

    expect(screen.getByText(IOS_COPY.lede("Chrome"))).toBeTruthy()
    expect(screen.getByText("Tap the share icon in the address bar")).toBeTruthy()
    expect(screen.queryByText(IOS_COPY.arrowModern)).toBeNull()
    expect(screen.queryByText(IOS_COPY.arrowClassic)).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: IOS_COPY.next }))
    expect(screen.getByText("Tap \"Add to Home Screen\"")).toBeTruthy()
  })
})

describe("in-app browsers", () => {
  it("iPhone: open in Safari, the menu steps, and Copy link", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
    renderPage(UA.instagramIphone)

    expect(screen.getByText(IN_APP_COPY.headlineTop("Safari"))).toBeTruthy()
    expect(screen.getByText(IN_APP_COPY.inside("Instagram", "Safari"))).toBeTruthy()
    for (const step of IN_APP_COPY.iosSteps) expect(screen.getByText(step)).toBeTruthy()
    expect((screen.getByLabelText(IN_APP_COPY.linkLabel) as HTMLInputElement).value).toBe(
      "goatza.com/install"
    )

    const copy = screen.getByRole("button", { name: IN_APP_COPY.copyLink })
    expect(actionsOf(copy)).toBeTruthy()
    await act(async () => {
      fireEvent.click(copy)
    })

    expect(writeText).toHaveBeenCalledWith("https://goatza.com/install")
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: IN_APP_COPY.copied }))
  })

  it("Android: an intent that opens /install in Chrome", () => {
    renderPage(UA.instagramAndroid)

    expect(screen.getByText(IN_APP_COPY.headlineTop("Chrome"))).toBeTruthy()
    expect(screen.getByRole("link", { name: IN_APP_COPY.openInChrome }).getAttribute("href")).toBe(
      "intent://goatza.com/install#Intent;scheme=https;package=com.android.chrome;" +
        "S.browser_fallback_url=https%3A%2F%2Fgoatza.com%2Finstall;end"
    )
    expect(screen.getByText(IN_APP_COPY.thenTapInstall)).toBeTruthy()
    expect(actionsOf(screen.getByRole("link", { name: IN_APP_COPY.openInChrome }))).toBeTruthy()
    // The copy link is the "Or…" after it, outside the sticky bar.
    expect(actionsOf(screen.getByRole("button", { name: IN_APP_COPY.copyLink }))).toBeNull()
  })

  it("the wrong iPhone browser is sent to Safari, without the in-app steps", () => {
    renderPage(UA.iphoneFirefox)

    expect(screen.getByText(IN_APP_COPY.headlineTop("Safari"))).toBeTruthy()
    expect(screen.getByText(IN_APP_COPY.otherBrowser("Safari"))).toBeTruthy()
    expect(screen.queryByText(IN_APP_COPY.iosSteps[0])).toBeNull()
  })
})

describe("desktop", () => {
  it("a QR code of /install, and no computer card without a prompt", () => {
    renderPage(UA.desktopChrome)

    expect(screen.getByRole("img", { name: DESKTOP_COPY.qrLabel })).toBeTruthy()
    expect(screen.getByText(DESKTOP_COPY.qrSub("goatza.com/install"))).toBeTruthy()
    expect(screen.queryByText(DESKTOP_COPY.computerTitle)).toBeNull()
    expect(screen.queryByText(DESKTOP_COPY.macSafari)).toBeNull()
  })

  it("the computer card only when the browser offers a prompt", () => {
    const prompt = fakePrompt("dismissed")
    renderPage(UA.desktopEdge, { prompt })

    expect(screen.getByText(DESKTOP_COPY.computerTitle)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: DESKTOP_COPY.computerCta }))
    expect(prompt.prompt).toHaveBeenCalledTimes(1)
  })

  it("a Mac Safari line", () => {
    renderPage(UA.macSafari)

    expect(screen.getByText(DESKTOP_COPY.macSafari)).toBeTruthy()
  })
})
