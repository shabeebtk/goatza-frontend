// @vitest-environment jsdom
/**
 * Programs & fees: three cards, then "See all N"; Enquire only with the form on,
 * "Join the waitlist" for a full program; and Enquire opens the sheet with that
 * program already chosen.
 */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { EnquiryProvider } from "@/features/enquiries/EnquiryContext"
import { ACADEMY_PAGE, LOCATIONS, program } from "../../__fixtures__/pageShowcase"
import ProgramsSection from "./ProgramsSection"

vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  usePathname: () => "/organization/profile/kannurfa",
}))

const FOUR = [
  program({ id: "p-1", name: "U10 Starters" }),
  program({ id: "p-2", name: "U12 Football Foundation" }),
  program({ id: "p-3", name: "U14 Development" }),
  program({ id: "p-4", name: "U16 Elite", spots: "full", spots_label: "Full" }),
]

const ORG = {
  id: "org-1",
  username: "kannurfa",
  name: "Kannur FA",
  logo: "",
  type: "academy",
  locations: LOCATIONS,
  isFollowing: false,
}

afterEach(cleanup)

describe("ProgramsSection", () => {
  it("shows three, then See all N, which opens the rest in place", () => {
    render(<ProgramsSection programs={FOUR} enquiryForm={false} />)

    expect(screen.getByRole("heading", { level: 2, name: "Programs & fees" })).toBeTruthy()
    expect(screen.queryByText("U16 Elite")).toBeNull()

    const seeAll = screen.getByRole("button", { name: /See all 4 programs/ })
    fireEvent.click(seeAll)

    expect(screen.getByText("U16 Elite")).toBeTruthy()
    expect(screen.getByRole("button", { name: /Show fewer/ }).getAttribute("aria-expanded")).toBe("true")
  })

  it("asks for nothing with the form off", () => {
    render(<ProgramsSection programs={FOUR} enquiryForm={false} />)

    expect(screen.queryByRole("button", { name: /Enquire about/ })).toBeNull()
    expect(screen.queryByRole("button", { name: /Join the waitlist/ })).toBeNull()
  })

  it("offers Enquire on each card, and Join the waitlist on a full one", () => {
    render(<ProgramsSection programs={FOUR} enquiryForm />)
    fireEvent.click(screen.getByRole("button", { name: /See all 4 programs/ }))

    expect(screen.getByRole("button", { name: "Enquire about U10 Starters" })).toBeTruthy()
    const waitlist = screen.getByRole("button", { name: "Join the waitlist for U16 Elite" })
    expect(waitlist.textContent).toContain("Join the waitlist")
    expect(screen.queryByRole("button", { name: "Enquire about U16 Elite" })).toBeNull()
  })

  it("draws nothing without programs", () => {
    const { container } = render(<ProgramsSection programs={[]} enquiryForm />)
    expect(container.innerHTML).toBe("")
  })

  it("opens the enquiry sheet with that program chosen", () => {
    render(
      <EnquiryProvider page={ACADEMY_PAGE} org={ORG} anonymous>
        <ProgramsSection programs={ACADEMY_PAGE.programs} enquiryForm />
      </EnquiryProvider>
    )

    fireEvent.click(screen.getByRole("button", { name: "Enquire about U16 Development" }))

    const sheet = screen.getByRole("dialog", { name: "Enquire" })
    const programField = within(sheet).getByRole("combobox", { name: "Program (optional)" })
    expect(programField.textContent).toContain("U16 Development · Ages 13 – 16")
  })
})
