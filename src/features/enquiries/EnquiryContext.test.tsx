// @vitest-environment jsdom
/**
 * The provider: `?enquire=1&program=<id>` opens the sheet once, after the page
 * has loaded and only with the form on, then drops the parameters; and `open`
 * does nothing where the form is off or on the org's own admin profile.
 */

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ACADEMY_PAGE, LOCATIONS } from "@/features/orgPage/__fixtures__/pageShowcase"
import type { PageShowcase } from "@/features/orgPage/types"
import { EnquiryProvider, useEnquiry } from "./EnquiryContext"

const mocks = vi.hoisted(() => ({ replace: vi.fn() }))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, push: vi.fn(), back: vi.fn() }),
  usePathname: () => "/organization/profile/kannurfa",
}))
vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))

const ORG = {
  id: "org-1",
  username: "kannurfa",
  name: "Kannur FA",
  logo: "",
  type: "academy",
  locations: LOCATIONS,
  isFollowing: false,
}

function OpenButton() {
  const { open } = useEnquiry()
  return (
    <button type="button" onClick={() => open({ programId: "prog-1" })}>
      Ask
    </button>
  )
}

const provider = (page: PageShowcase | null, { disabled = false } = {}) => (
  <EnquiryProvider page={page} org={ORG} anonymous disabled={disabled}>
    <OpenButton />
  </EnquiryProvider>
)

const FORM_OFF: PageShowcase = { ...ACADEMY_PAGE, contact: { ...ACADEMY_PAGE.contact, enquiry_form: false } }

beforeEach(() => {
  mocks.replace.mockReset()
  window.history.replaceState(null, "", "/organization/profile/kannurfa")
})

afterEach(cleanup)

describe("the deep link", () => {
  it("opens the sheet on the program once the page has loaded, and drops the parameters", () => {
    window.history.replaceState(null, "", "/organization/profile/kannurfa?enquire=1&program=prog-2&ref=qr")

    const { rerender } = render(provider(null))
    expect(screen.queryByRole("dialog")).toBeNull()

    rerender(provider(ACADEMY_PAGE))

    const sheet = screen.getByRole("dialog", { name: "Enquire" })
    expect(within(sheet).getByRole("combobox", { name: "Program (optional)" }).textContent).toContain(
      "U16 Development · Ages 13 – 16"
    )
    expect(mocks.replace).toHaveBeenCalledWith("/organization/profile/kannurfa?ref=qr", { scroll: false })
  })

  it("opens it once: a new page payload later does not reopen it", async () => {
    window.history.replaceState(null, "", "/organization/profile/kannurfa?enquire=1")
    const { rerender } = render(provider(ACADEMY_PAGE))
    expect(screen.getByRole("dialog")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())

    rerender(provider({ ...ACADEMY_PAGE }))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(mocks.replace).toHaveBeenCalledTimes(1)
  })

  it("ignores a program that isn't the page's", () => {
    window.history.replaceState(null, "", "/organization/profile/kannurfa?enquire=1&program=gone")
    render(provider(ACADEMY_PAGE))

    expect(screen.getByRole("combobox", { name: "Program (optional)" }).textContent).toContain("Not sure yet")
  })

  it("does nothing with the form off, or on the org's own admin profile", () => {
    window.history.replaceState(null, "", "/organization/profile/kannurfa?enquire=1")

    render(provider(FORM_OFF))
    expect(screen.queryByRole("dialog")).toBeNull()

    cleanup()
    render(provider(ACADEMY_PAGE, { disabled: true }))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(mocks.replace).not.toHaveBeenCalled()
  })
})

describe("open", () => {
  it("opens the sheet on the program asked for", () => {
    render(provider(ACADEMY_PAGE))

    fireEvent.click(screen.getByRole("button", { name: "Ask" }))

    expect(screen.getByRole("combobox", { name: "Program (optional)" }).textContent).toContain(
      "U12 Football Foundation"
    )
  })

  it("is a no-op with the form off", () => {
    render(provider(FORM_OFF))

    fireEvent.click(screen.getByRole("button", { name: "Ask" }))

    expect(screen.queryByRole("dialog")).toBeNull()
  })
})
