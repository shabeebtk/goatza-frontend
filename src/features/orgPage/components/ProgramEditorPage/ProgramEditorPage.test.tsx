// @vitest-environment jsdom
/**
 * The program editor's fee period: the Select is labelled "Charged" (it read
 * "Paid", which sounded like the parent had already paid).
 */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/store/auth.store"
import ProgramEditorPage from "./ProgramEditorPage"

const mutation = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false })

vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  usePathname: () => "/organization/admin/org-1/page/programs/new",
}))
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}))
vi.mock("@/shared/components/ui/Toast/Toast", () => ({ useToast: () => ({ show: vi.fn() }) }))
vi.mock("../PageEditorLayout/PageEditorLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock("@/features/organization/hooks/useOrganizations", () => ({
  useOrgDetail: () => ({
    isLoading: false,
    data: {
      id: "org-1",
      sports: [{ id: "sport-1", name: "Football", icon_name: "", is_primary: true }],
      locations: [],
    },
  }),
}))
vi.mock("../../hooks/usePrograms", () => ({
  usePrograms: () => ({ isLoading: false, data: [] }),
  useCreateProgram: () => mutation(),
  useUpdateProgram: () => mutation(),
  useDeleteProgram: () => mutation(),
}))

beforeEach(() => {
  useAuthStore.setState({ organizations: [{ id: "org-1", my_permissions: ["page.manage"] }] } as never)
})

afterEach(cleanup)

describe("the fee period", () => {
  it("is labelled Charged", () => {
    render(<ProgramEditorPage orgId="org-1" />)

    const field = screen.getByRole("combobox", { name: "Charged" })
    expect(field).toBeTruthy()
    expect(screen.queryByRole("combobox", { name: "Paid" })).toBeNull()
  })
})
