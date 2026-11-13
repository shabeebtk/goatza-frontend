// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/store/auth.store"
import type { ApplicationDetail, ApplicationStatus } from "../../services/recruitments.api"
import ApplicantDetailDrawer from "./ApplicantDetailDrawer"

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  detail: vi.fn(),
  sheetProps: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/organization/admin/org-1/recruitments/rec-1",
}))
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))
vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
vi.mock("@/shared/components/ui/Avatar/Avatar", () => ({ default: () => <span /> }))
vi.mock("@/shared/components/ui/Toast/Toast", () => ({ useToast: () => ({ show: mocks.toast }) }))
vi.mock("../../hooks/useRecruitments", () => ({
  useApplicationDetail: () => mocks.detail(),
  useUpdateApplicationStatus: () => ({ mutate: vi.fn(), isPending: false }),
}))
// The sheet has its own test; here only that it opens, and with what.
vi.mock("@/features/squads/components/AddToSquadSheet/AddToSquadSheet", () => ({
  default: (props: {
    orgId: string
    applicationId: string
    applicant: { id: string; name: string }
    sportId?: string
  }) => {
    mocks.sheetProps(props)
    return <div data-testid="add-to-squad" />
  },
}))

const application = (status: ApplicationStatus): ApplicationDetail => ({
  id: "app-7",
  status,
  applied_at: "2026-10-01T10:00:00Z",
  shared_name: "",
  shared_email: "",
  shared_phone: "",
  applicant: { id: "user-9", username: "bilal", name: "Bilal", avatar: "", headline: "" },
  age_category: null,
  birth_year: null,
  answers: [],
  status_history: [],
})

const actAs = (permissions: string[]) => {
  const org = { id: "org-1", name: "Dream FC", username: "dreamfc", my_permissions: permissions }
  useAuthStore.setState({
    user: { id: "user-1", username: "olive" } as never,
    actorType: "organization",
    actorId: "org-1",
    isOrgAdminView: true,
    organizations: [org] as never,
    currentOrganization: org as never,
  })
}

const renderDrawer = (status: ApplicationStatus) => {
  mocks.detail.mockReturnValue({ data: application(status), isLoading: false, isError: false })
  render(
    <ApplicantDetailDrawer
      applicationId="app-7"
      recruitmentId="rec-1"
      orgId="org-1"
      sportId="sport-1"
      onClose={vi.fn()}
    />
  )
}

const addButton = () => screen.queryByRole("button", { name: "Add to squad" })

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset())
})

afterEach(cleanup)

describe("ApplicantDetailDrawer · Add to squad", () => {
  it("is offered on a Selected applicant to someone with squads.review", () => {
    actAs(["squads.view", "squads.review"])
    renderDrawer("selected")

    expect(addButton()).toBeTruthy()
    expect(screen.queryByTestId("add-to-squad")).toBeNull()
  })

  it.each<ApplicationStatus>(["applied", "shortlisted", "trial_confirmed", "not_selected"])(
    "is not offered while the applicant is %s",
    (status) => {
      actAs(["squads.view", "squads.review"])
      renderDrawer(status)

      expect(addButton()).toBeNull()
    }
  )

  it("is not offered without squads.review", () => {
    actAs(["squads.view", "recruitments.speak"])
    renderDrawer("selected")

    expect(addButton()).toBeNull()
  })

  it("opens the sheet for this application, applicant and sport", () => {
    actAs(["squads.view", "squads.review"])
    renderDrawer("selected")

    fireEvent.click(addButton() as HTMLElement)

    expect(screen.getByTestId("add-to-squad")).toBeTruthy()
    expect(mocks.sheetProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        applicationId: "app-7",
        applicant: { id: "user-9", name: "Bilal" },
        sportId: "sport-1",
      })
    )
  })
})
