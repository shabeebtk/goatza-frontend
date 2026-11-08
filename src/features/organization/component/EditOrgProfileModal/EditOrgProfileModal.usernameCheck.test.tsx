// @vitest-environment jsdom

/**
 * The org edit modal checks its handle as a PAGE's handle: for=organization,
 * with its own id, so the owner's personal handle reads as taken and only the
 * org's current handle reads as free.
 */

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

import EditOrgProfileModal from "./EditOrgProfileModal"
import type { OrganizationDetail } from "../../types"

const m = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  useCheckUsername: vi.fn(),
}))

vi.mock("@/features/profile/hooks/useProfileQueries", () => ({
  useCheckUsername: (options: unknown) => {
    m.useCheckUsername(options)
    return { mutateAsync: m.mutateAsync }
  },
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

const ORG = {
  id: "org-1",
  name: "Dream FC",
  username: "dreamfc",
  type: "club",
  headline: "",
  description: "",
  website: "",
  level: "",
  logo: "",
  cover_image: "",
  locations: [],
  sports: [],
} as unknown as OrganizationDetail

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("EditOrgProfileModal handle check", () => {
  it("checks a new handle for the organization, naming it", async () => {
    m.mutateAsync.mockResolvedValue({ username: "makerhandle", valid: true, available: false })
    render(<EditOrgProfileModal org={ORG} onClose={vi.fn()} />)

    expect(m.useCheckUsername).toHaveBeenCalledWith({ for: "organization", orgId: "org-1" })

    fireEvent.change(screen.getByPlaceholderText("username"), {
      target: { value: "makerhandle" },
    })

    await waitFor(() => expect(m.mutateAsync).toHaveBeenCalledWith("makerhandle"))
  })
})
