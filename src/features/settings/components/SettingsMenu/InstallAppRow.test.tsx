// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { resetBrowser, setStandalone, setUserAgent } from "@/core/pwa/testing/browserEnv"
import { UA } from "@/core/pwa/testing/userAgents"
import { SETTINGS_INSTALL_LABEL } from "@/features/install/installCopy"
import InstallAppRow from "./InstallAppRow"

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))
vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
vi.mock("@/core/pwa/appEvents", () => ({ trackAppEvent: vi.fn() }))

beforeEach(() => {
  resetBrowser()
})

afterEach(() => {
  cleanup()
  resetBrowser()
  vi.restoreAllMocks()
})

describe("Settings: Install the app", () => {
  it("links to /install in a browser", () => {
    setUserAgent(UA.androidChrome)
    render(<InstallAppRow />)

    expect(screen.getByRole("link", { name: SETTINGS_INSTALL_LABEL }).getAttribute("href")).toBe("/install")
  })

  it("is hidden inside the installed app", () => {
    setUserAgent(UA.androidChrome)
    setStandalone(true)

    expect(render(<InstallAppRow />).container.innerHTML).toBe("")
  })
})
