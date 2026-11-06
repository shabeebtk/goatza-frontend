// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/store/auth.store"
import type { OrgMember, OrgMembersResponse, PendingInvite } from "../../services/orgMembers.api"
import OrgMembersPage from "./OrgMembersPage"

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  toast: vi.fn(),
  getMembers: vi.fn(),
  getInvites: vi.fn(),
  changeRole: vi.fn(),
  remove: vi.fn(),
  cancel: vi.fn(),
  leave: vi.fn(),
  getOrgs: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/organization/admin/org-1/members",
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
vi.mock("@/shared/components/ui/BackHeader/BackHeader", () => ({
  default: ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <header>
      <span>{title}</span>
      <span data-testid="count">{subtitle}</span>
    </header>
  ),
}))
vi.mock("@/shared/components/ui/Toast/Toast", () => ({ useToast: () => ({ show: mocks.toast }) }))
// The real one portals and measures; this is about what the page does with a value.
vi.mock("@/shared/components/ui/Select/Select", () => ({
  default: ({
    options,
    onChange,
    value,
  }: {
    options: { value: string; label: string }[]
    onChange: (value: string) => void
    value: string
  }) => (
    <div data-testid="role-select" data-value={value}>
      {options.map((option) => (
        <button key={option.value} onClick={() => onChange(option.value)}>
          Set {option.label}
        </button>
      ))}
    </div>
  ),
}))
vi.mock("../AddMemberSheet/AddMemberSheet", () => ({
  default: () => <div data-testid="add-sheet" />,
}))
vi.mock("@/features/organization/services/organization.api", () => ({
  getOrganizationsApi: mocks.getOrgs,
}))
vi.mock("../../services/orgMembers.api", async (original) => ({
  ...(await original<typeof import("../../services/orgMembers.api")>()),
  getOrgMembersApi: mocks.getMembers,
  getPendingInvitesApi: mocks.getInvites,
  changeMemberRoleApi: mocks.changeRole,
  removeMemberApi: mocks.remove,
  cancelInviteApi: mocks.cancel,
  leaveOrganizationApi: mocks.leave,
}))

const member = (
  id: string,
  name: string,
  role: OrgMember["role"],
  is_me = false
): OrgMember => ({
  id,
  role,
  is_me,
  joined_at: "2026-03-10T10:00:00Z",
  added_by: null,
  user: { id: `user-${id}`, name, username: name.toLowerCase(), profile_photo: "" },
})

const OLIVE = member("m1", "Olive", "owner", true)
const CORA = member("m2", "Cora", "coach")

const managerView = (members = [OLIVE, CORA]): OrgMembersResponse => ({
  members,
  me: { role: "owner", permissions: ["members.view", "members.manage"] },
})

const INVITE: PendingInvite = {
  id: "inv-1",
  role: "coach",
  invited_user: null,
  email_masked: "j*****n@gmail.com",
  invited_by: { name: "Olive", username: "olive" },
  created_at: "2026-11-01T00:00:00Z",
  expires_at: new Date(Date.now() + 9.5 * 86_400_000).toISOString(),
}

const apiRefusal = (code: string) => ({
  isAxiosError: true,
  response: { status: 400, data: { message: "server words", data: { code } } },
})

const renderPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <OrgMembersPage orgId="org-1" />
    </QueryClientProvider>
  )

const confirmIn = async (title: string, button: string) => {
  const dialog = (await screen.findByText(title)).closest('[role="alertdialog"]') as HTMLElement
  fireEvent.click(within(dialog).getByRole("button", { name: button }))
}

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset())
  mocks.getInvites.mockResolvedValue([])
  mocks.getOrgs.mockResolvedValue([])
  useAuthStore.setState({
    user: { id: "user-m1", username: "olive" } as never,
    actorType: "organization",
    actorId: "org-1",
    isOrgAdminView: true,
    organizations: [{ id: "org-1", name: "Dream FC", username: "dreamfc" }] as never,
    currentOrganization: { id: "org-1", name: "Dream FC", username: "dreamfc" } as never,
  })
})

afterEach(cleanup)

describe("OrgMembersPage for everyone", () => {
  it("shows skeleton rows while loading, then the people", async () => {
    let resolve!: (value: OrgMembersResponse) => void
    mocks.getMembers.mockReturnValue(new Promise((done) => (resolve = done)))

    const { container } = renderPage()
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy()
    expect(screen.queryByText("Olive")).toBeNull()

    resolve(managerView())

    expect(await screen.findByText("Olive")).toBeTruthy()
    expect(screen.getByText("@cora")).toBeTruthy()
    expect(screen.getByTestId("count").textContent).toBe("2")
    expect(screen.getByText("Owner")).toBeTruthy()
    expect(screen.getByText("Coach")).toBeTruthy()
    expect(screen.getAllByText("Joined Mar 2026")).toHaveLength(2)
    expect(screen.getByText("You")).toBeTruthy()
  })

  it("opens a profile inside the admin space", async () => {
    mocks.getMembers.mockResolvedValue(managerView())
    renderPage()

    const link = (await screen.findByText("@cora")).closest("a") as HTMLAnchorElement

    expect(link.getAttribute("href")).toBe("/organization/admin/org-1/profile/user/cora")
  })

  it("offers Try again on an error, and it works", async () => {
    mocks.getMembers.mockRejectedValueOnce(new Error("nope")).mockResolvedValue(managerView())
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "Try again" }))

    expect(await screen.findByText("Olive")).toBeTruthy()
  })
})

describe("OrgMembersPage without members.manage", () => {
  beforeEach(() => {
    mocks.getMembers.mockResolvedValue({
      members: [member("m0", "Olive", "owner"), member("m1", "Cora", "coach", true)],
      me: { role: "coach", permissions: ["members.view"] },
    })
  })

  it("is read-only and never asks for the pending invites", async () => {
    renderPage()
    await screen.findByText("Olive")

    expect(screen.queryByRole("button", { name: "Add member" })).toBeNull()
    expect(screen.queryByRole("button", { name: /Actions for/ })).toBeNull()
    expect(screen.queryByText("Pending invites")).toBeNull()
    expect(mocks.getInvites).not.toHaveBeenCalled()
  })

  it("can still leave", async () => {
    renderPage()

    const leave = (await screen.findByRole("button", { name: "Leave organization" })) as HTMLButtonElement
    expect(leave.disabled).toBe(false)
  })
})

describe("OrgMembersPage with members.manage", () => {
  it("offers Add member and a menu on every row but your own", async () => {
    mocks.getMembers.mockResolvedValue(managerView())
    renderPage()
    await screen.findByText("Cora")

    fireEvent.click(screen.getByRole("button", { name: "Add member" }))
    expect(screen.getByTestId("add-sheet")).toBeTruthy()

    expect(screen.getByRole("button", { name: "Actions for Cora" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Actions for Olive" })).toBeNull()
  })

  it("shows the empty state when the owner is alone", async () => {
    mocks.getMembers.mockResolvedValue(managerView([OLIVE]))
    renderPage()

    expect(
      await screen.findByText("Invite your coaches and staff to help run Dream FC.")
    ).toBeTruthy()
    expect(screen.getAllByRole("button", { name: "Add member" })).toHaveLength(1)
  })

  it("lists pending invites and cancels one after asking", async () => {
    mocks.getMembers.mockResolvedValue(managerView())
    mocks.getInvites.mockResolvedValue([INVITE])
    mocks.cancel.mockResolvedValue(undefined)
    renderPage()

    expect(await screen.findByText("j*****n@gmail.com")).toBeTruthy()
    expect(screen.getByText("Invited by Olive · expires in 9 days")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(mocks.cancel).not.toHaveBeenCalled()

    await confirmIn("Cancel this invite?", "Cancel invite")

    await waitFor(() => expect(mocks.cancel).toHaveBeenCalledWith("org-1", "inv-1"))
  })

  it("changes a role from the menu", async () => {
    mocks.getMembers.mockResolvedValue(managerView())
    mocks.changeRole.mockResolvedValue({ ...CORA, role: "staff" })
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "Actions for Cora" }))
    expect(screen.getByTestId("role-select").getAttribute("data-value")).toBe("coach")
    fireEvent.click(screen.getByRole("button", { name: "Set Staff" }))

    await waitFor(() => expect(mocks.changeRole).toHaveBeenCalledWith("org-1", "m2", "staff"))
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Role updated" }))
    )
  })

  it("says last_owner in the org's own words", async () => {
    mocks.getMembers.mockResolvedValue(managerView())
    mocks.changeRole.mockRejectedValue(apiRefusal("last_owner"))
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "Actions for Cora" }))
    fireEvent.click(screen.getByRole("button", { name: "Set Staff" }))

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Dream FC needs at least one owner."
    )
  })

  it("removes only after the confirmation, in the agreed words", async () => {
    mocks.getMembers.mockResolvedValue(managerView())
    mocks.remove.mockResolvedValue(undefined)
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "Actions for Cora" }))
    fireEvent.click(screen.getByRole("button", { name: "Remove from Dream FC" }))

    expect(await screen.findByText("They'll lose access to Dream FC right away.")).toBeTruthy()
    expect(mocks.remove).not.toHaveBeenCalled()

    await confirmIn("Remove Cora?", "Remove")

    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith("org-1", "m2"))
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Cora removed" }))
    )
  })
})

describe("Leaving", () => {
  it("is disabled for the last owner, who is told why", async () => {
    mocks.getMembers.mockResolvedValue(managerView())
    renderPage()

    const leave = (await screen.findByRole("button", { name: "Leave organization" })) as HTMLButtonElement

    expect(leave.disabled).toBe(true)
    expect(screen.getByText("Make someone else an owner first.")).toBeTruthy()
  })

  it("is open to an owner with a co-owner", async () => {
    mocks.getMembers.mockResolvedValue(managerView([OLIVE, member("m3", "Other", "owner")]))
    renderPage()

    const leave = (await screen.findByRole("button", { name: "Leave organization" })) as HTMLButtonElement

    expect(leave.disabled).toBe(false)
    expect(screen.queryByText("Make someone else an owner first.")).toBeNull()
  })

  it("switches to the personal account, says so and goes home", async () => {
    mocks.getMembers.mockResolvedValue({
      members: [member("m0", "Olive", "owner"), member("m1", "Cora", "coach", true)],
      me: { role: "coach", permissions: ["members.view"] },
    })
    mocks.leave.mockResolvedValue(undefined)
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "Leave organization" }))
    await confirmIn("Leave Dream FC?", "Leave")

    await waitFor(() => expect(mocks.leave).toHaveBeenCalledWith("org-1"))
    await waitFor(() => expect(useAuthStore.getState().actorType).toBe("user"))

    const state = useAuthStore.getState()
    expect(state.actorId).toBeNull()
    expect(state.organizations).toEqual([])
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "You left Dream FC" })
    )
    expect(mocks.push).toHaveBeenCalledWith("/home")
    await waitFor(() => expect(mocks.getOrgs).toHaveBeenCalled())
  })
})
