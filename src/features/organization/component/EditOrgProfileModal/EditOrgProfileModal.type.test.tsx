// @vitest-environment jsdom

/**
 * A page is a club, a team or an academy. "School" is retired (a school or
 * college team is a team), so the type select no longer offers it, and an old
 * cached page that still says "school" opens with no type rather than one the
 * form would refuse.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import EditOrgProfileModal from "./EditOrgProfileModal"
import type { OrganizationDetail } from "../../types"

vi.mock("@/features/profile/hooks/useProfileQueries", () => ({
  useCheckUsername: () => ({ mutateAsync: vi.fn() }),
}))

vi.mock("../../hooks/useOrganizations", () => ({
  useUpdateOrganization: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpsertOrgLocation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteOrgLocation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock("@/features/profile/hooks/useProfileBias", () => ({ useProfileBias: () => null }))
vi.mock("@/shared/components/LocationPicker/LocationPicker", () => ({ default: () => null }))
vi.mock("@/shared/components/ui/ConfirmDialog/ConfirmDialog", () => ({ default: () => null }))
vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
// Its Select reserves a history entry when open, through the app router.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/organization/admin/org-1/profile",
  useSearchParams: () => new URLSearchParams(),
}))

const orgOfType = (type: string) =>
  ({
    id: "org-1",
    name: "Dream FC",
    username: "dreamfc",
    type,
    headline: "",
    description: "",
    website: "",
    level: "",
    logo: "",
    cover_image: "",
    locations: [],
    sports: [],
  }) as unknown as OrganizationDetail

const typeSelect = () => screen.getByRole("combobox", { name: "Organization type" })

beforeEach(() => {
  // jsdom has no scrollIntoView; the open Select calls it for its active row.
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("EditOrgProfileModal type", () => {
  it("offers Club, Team and Academy, and no School", () => {
    render(<EditOrgProfileModal org={orgOfType("club")} onClose={vi.fn()} />)

    fireEvent.click(typeSelect())

    const options = screen.getAllByRole("option").map((option) => option.textContent?.trim())
    expect(options).toEqual(["Club", "Team", "Academy"])
    expect(screen.queryByRole("option", { name: /school/i })).toBeNull()
  })

  it("shows a team page as Team", () => {
    render(<EditOrgProfileModal org={orgOfType("team")} onClose={vi.fn()} />)

    expect(typeSelect().textContent).toContain("Team")
  })

  it("opens an old cached school page with no type picked", () => {
    render(<EditOrgProfileModal org={orgOfType("school")} onClose={vi.fn()} />)

    const select = typeSelect()
    expect(select.textContent).toContain("Select Type")
    expect(select.textContent?.toLowerCase()).not.toContain("school")
  })
})
