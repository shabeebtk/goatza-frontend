// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import AddMemberSheet from "./AddMemberSheet"

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  invite: vi.fn(),
  search: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
}))
vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
vi.mock("@/shared/components/ui/Avatar/Avatar", () => ({ default: () => <span /> }))
vi.mock("@/shared/components/ui/BackHeader/BackHeader", () => ({ default: () => null }))
vi.mock("@/shared/components/ui/Toast/Toast", () => ({ useToast: () => ({ show: mocks.toast }) }))
vi.mock("@/shared/components/ui/Select/Select", () => ({
  default: ({
    options,
    onChange,
    value,
  }: {
    options: { value: string; label: string; hint?: string }[]
    onChange: (value: string) => void
    value: string
  }) => (
    <div data-testid="role-select" data-value={value}>
      {options.map((option) => (
        <button key={option.value} title={option.hint} onClick={() => onChange(option.value)}>
          Set {option.label}
        </button>
      ))}
    </div>
  ),
}))
vi.mock("../../services/orgMembers.api", async (original) => ({
  ...(await original<typeof import("../../services/orgMembers.api")>()),
  inviteMemberApi: mocks.invite,
  searchPeopleApi: mocks.search,
}))

const person = (id: string, name: string) => ({
  id,
  name,
  username: name.toLowerCase(),
  avatar: "",
  headline: "",
  type: "user" as const,
  conversation_id: null,
  source: "all" as const,
})

const renderSheet = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AddMemberSheet
        orgId="org-1"
        orgName="Dream FC"
        memberUserIds={new Set(["u-member"])}
        invitedUserIds={new Set(["u-invited"])}
        onClose={vi.fn()}
      />
    </QueryClientProvider>
  )

const type = (text: string) =>
  fireEvent.change(screen.getByLabelText("Name, @username or email"), { target: { value: text } })

const send = () => screen.getByRole("button", { name: "Send invite" }) as HTMLButtonElement

const refusal = (code: string) => ({
  isAxiosError: true,
  response: { status: 400, data: { message: "server words", data: { code } } },
})

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset())
  mocks.search.mockResolvedValue([])
})

afterEach(cleanup)

describe("AddMemberSheet: finding someone", () => {
  it("labels members and invitees, and they can't be picked", async () => {
    mocks.search.mockResolvedValue([
      person("u-member", "Mona"),
      person("u-invited", "Ivan"),
      person("u-free", "Fran"),
    ])
    renderSheet()
    type("an")

    const memberRow = (await screen.findByText("Mona")).closest("button") as HTMLButtonElement
    const invitedRow = screen.getByText("Ivan").closest("button") as HTMLButtonElement
    const freeRow = screen.getByText("Fran").closest("button") as HTMLButtonElement

    expect(memberRow.disabled).toBe(true)
    expect(memberRow.textContent).toContain("Member")
    expect(invitedRow.disabled).toBe(true)
    expect(invitedRow.textContent).toContain("Invited")
    expect(freeRow.disabled).toBe(false)
  })

  it("waits for typing to stop", async () => {
    renderSheet()
    type("fr")
    type("fra")
    type("fran")

    expect(mocks.search).not.toHaveBeenCalled()

    await waitFor(() => expect(mocks.search).toHaveBeenCalledTimes(1))
    expect(mocks.search).toHaveBeenCalledWith("fran")
  })

  it("searches a handle without its @", async () => {
    renderSheet()
    type("@fran")

    await waitFor(() => expect(mocks.search).toHaveBeenCalledWith("fran"))
  })

  it("invites the picked person with the default role of Coach", async () => {
    mocks.search.mockResolvedValue([person("u-free", "Fran")])
    mocks.invite.mockResolvedValue({})
    renderSheet()
    expect(screen.getByTestId("role-select").getAttribute("data-value")).toBe("coach")
    expect(send().disabled).toBe(true)

    type("fran")
    fireEvent.click(await screen.findByText("Fran"))
    expect(send().disabled).toBe(false)
    fireEvent.click(send())

    await waitFor(() =>
      expect(mocks.invite).toHaveBeenCalledWith("org-1", { user_id: "u-free" }, "coach")
    )
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Invite sent" }))
    )
  })

  it("explains each role in terms of this org", () => {
    renderSheet()

    expect(screen.getByRole("button", { name: "Set Owner" }).title).toBe(
      "Can add and remove members and manage Dream FC"
    )
    expect(screen.getByRole("button", { name: "Set Coach" }).title).toBe(
      "Uses Dream FC; can't manage members"
    )
    expect(screen.getByRole("button", { name: "Set Staff" }).title).toBe(
      "Uses Dream FC; can't manage members"
    )
  })

  it("sends the chosen role", async () => {
    mocks.invite.mockResolvedValue({})
    renderSheet()

    type("new@else.example")
    fireEvent.click(screen.getByText("Invite new@else.example by email"))
    fireEvent.click(screen.getByRole("button", { name: "Set Owner" }))
    fireEvent.click(send())

    await waitFor(() =>
      expect(mocks.invite).toHaveBeenCalledWith("org-1", { email: "new@else.example" }, "owner")
    )
  })
})

describe("AddMemberSheet: an email", () => {
  it("offers the same row and never searches, so it can't say who has an account", async () => {
    renderSheet()
    type("known@else.example")

    expect(screen.getByText("Invite known@else.example by email")).toBeTruthy()

    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(mocks.search).not.toHaveBeenCalled()
  })

  it("has no row until the text is an email", () => {
    renderSheet()
    type("known@else")

    expect(screen.queryByText(/by email/)).toBeNull()
  })

  it("drops the choice when the text changes", () => {
    renderSheet()
    type("known@else.example")
    fireEvent.click(screen.getByText("Invite known@else.example by email"))
    expect(send().disabled).toBe(false)

    type("known@else.exampl")

    expect(send().disabled).toBe(true)
  })
})

describe("AddMemberSheet: refusals", () => {
  it.each([
    ["already_member", "This person is already a member."],
    ["already_invited", "This person already has a pending invite."],
    ["member_limit", "Dream FC has reached its limit of 50 members."],
    ["invite_limit", "You can have up to 20 pending invites. Cancel one to send another."],
  ])("%s reads as a sentence, in the sheet", async (code, sentence) => {
    mocks.invite.mockRejectedValue(refusal(code))
    renderSheet()

    type("new@else.example")
    fireEvent.click(screen.getByText("Invite new@else.example by email"))
    fireEvent.click(send())

    expect((await screen.findByRole("alert")).textContent).toBe(sentence)
    expect(mocks.toast).not.toHaveBeenCalled()
  })

  it("shows the server's own words for the generic refusal", async () => {
    mocks.invite.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 400,
        data: { message: "Couldn't invite this person.", data: { code: "cannot_invite" } },
      },
    })
    mocks.search.mockResolvedValue([person("u-free", "Fran")])
    renderSheet()

    type("fran")
    fireEvent.click(await screen.findByText("Fran"))
    fireEvent.click(send())

    expect((await screen.findByRole("alert")).textContent).toBe("Couldn't invite this person.")
  })
})
