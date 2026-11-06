// @vitest-environment jsdom
/** A link to something gone: friendly, and it never says why. */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/store/auth.store"
import UnavailableState, { isUnavailableError } from "./UnavailableState"

vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

afterEach(cleanup)

describe("UnavailableState", () => {
  it("says the one sentence", () => {
    render(<UnavailableState />)

    expect(screen.getByText("This isn't available any more")).toBeTruthy()
  })

  it("goes home for a person", () => {
    useAuthStore.setState({
      isAuthenticated: true,
      isOrgAdminView: false,
      actorId: null,
    } as never)

    render(<UnavailableState />)

    expect(screen.getByRole("link").getAttribute("href")).toBe("/home")
  })

  it("stays inside the org's space for someone acting as it", () => {
    useAuthStore.setState({
      isAuthenticated: true,
      isOrgAdminView: true,
      actorId: "org-1",
    } as never)

    render(<UnavailableState />)

    expect(screen.getByRole("link").getAttribute("href")).toBe(
      "/organization/admin/org-1/dashboard"
    )
  })
})

describe("isUnavailableError", () => {
  it.each([403, 404, 410])("%i means not there, or not for you", (status) => {
    expect(isUnavailableError({ response: { status } })).toBe(true)
  })

  it.each([400, 500, 503])("%i is a failure worth retrying", (status) => {
    expect(isUnavailableError({ response: { status } })).toBe(false)
  })

  it("a dropped connection is too", () => {
    expect(isUnavailableError(new Error("Network Error"))).toBe(false)
  })

  it("no error at all is not unavailable", () => {
    expect(isUnavailableError(null)).toBe(false)
  })
})
