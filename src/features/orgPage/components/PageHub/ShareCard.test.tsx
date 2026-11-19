// @vitest-environment jsdom
/**
 * The share card's two downloads: short words on the buttons, so nothing clips
 * at 360px, and the full ones as their accessible names.
 */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import ShareCard from "./ShareCard"
import styles from "./PageHub.module.css"

vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
vi.mock("@/shared/components/ui/Toast/Toast", () => ({ useToast: () => ({ show: vi.fn() }) }))
vi.mock("@/features/squads/hooks/useShareLink", () => ({
  useShareLink: () => ({ copyLink: vi.fn(), share: vi.fn() }),
}))
vi.mock("@/features/squads/services/squadQr", () => ({ saveBlob: vi.fn(), squadQrPng: vi.fn() }))
vi.mock("../PosterSheet/PosterSheet", () => ({ default: () => null }))
vi.mock("@/features/profile/services/publicProfile.api", () => ({ siteOrigin: () => "https://goatza.com" }))

afterEach(cleanup)

const POSTER = { logoUrl: "", ages: "", enquiryForm: true } as never

describe("ShareCard", () => {
  it("names the downloads in full and keeps the buttons' words short", () => {
    render(<ShareCard orgId="org-1" username="kannurfa" orgName="Kannur FA" poster={POSTER} />)

    const poster = screen.getByRole("button", { name: "Download QR poster" })
    const code = screen.getByRole("button", { name: "Download QR code" })
    expect(poster.textContent).toBe("QR poster")
    expect(code.textContent).toBe("QR code")
  })

  it("puts the downloads in the row that stacks below 480px", () => {
    render(<ShareCard orgId="org-1" username="kannurfa" orgName="Kannur FA" poster={POSTER} />)

    const row = screen.getByRole("button", { name: "Download QR poster" }).parentElement!
    expect(row.className).toContain(styles.shareDownloads)
    expect(row.contains(screen.getByRole("button", { name: "Download QR code" }))).toBe(true)
  })
})
