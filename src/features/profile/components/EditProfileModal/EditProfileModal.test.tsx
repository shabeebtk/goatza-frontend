// @vitest-environment jsdom
/**
 * A date of birth on file cannot be edited here: the row says what it is and how
 * to get it corrected. Only a legacy account with none gets a picker, once.
 */

import { forwardRef } from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useGuardianStore } from "@/features/guardian/store/guardian.store"
import type { UserProfile } from "@/features/profile/services/profile.api"
import EditProfileModal from "./EditProfileModal"

const mocks = vi.hoisted(() => ({
  me: {} as Record<string, unknown> | undefined,
  save: vi.fn(),
}))

vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
vi.mock("@/features/profile/hooks/useProfileQueries", () => ({
  useMyProfile: () => ({ data: mocks.me }),
  useUpdateProfileData: () => ({ mutateAsync: mocks.save }),
  useCheckUsername: () => ({ mutateAsync: vi.fn() }),
}))
vi.mock("@/shared/components/LocationPicker/LocationPicker", () => ({ default: () => null }))
vi.mock("@/shared/hooks/useBodyScrollLock", () => ({ useBodyScrollLock: () => undefined }))
vi.mock("@/shared/utils/settleViewport", () => ({ settleViewport: () => Promise.resolve() }))
vi.mock("@/shared/components/ui", () => ({
  Input: forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
    function Input(props, ref) {
      return <input ref={ref} {...props} />
    }
  ),
  Select: () => null,
  DateOfBirthPicker: ({
    value,
    onChange,
  }: {
    value: string | null
    onChange: (next: string | null) => void
  }) => (
    <input
      aria-label="Date of birth picker"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
    />
  ),
}))
vi.mock("@/shared/components/ui/ConfirmDialog/ConfirmDialog", () => ({
  default: ({
    open,
    message,
    onConfirm,
    onCancel,
  }: {
    open: boolean
    message: string
    onConfirm: () => void
    onCancel: () => void
  }) =>
    open ? (
      <div role="alertdialog">
        <p>{message}</p>
        <button onClick={onConfirm}>Yes</button>
        <button onClick={onCancel}>No</button>
      </div>
    ) : null,
}))
vi.mock("@/features/support/components/ProblemReportSheet/ProblemReportSheet", () => ({
  default: ({
    prefill,
    onClose,
  }: {
    prefill?: { category: string; description: string }
    onClose: () => void
  }) => (
    <div role="dialog" aria-label="Report a problem">
      <span data-testid="category">{prefill?.category}</span>
      <span data-testid="description">{prefill?.description}</span>
      <button onClick={onClose}>Close report</button>
    </div>
  ),
}))

const WARNING =
  "Check this carefully — you won't be able to change your date of birth later."

const profile = (overrides: Partial<UserProfile> = {}): UserProfile =>
  ({
    id: "u1",
    username: "valid_name",
    name: "Me",
    headline: "",
    about: "",
    gender: "",
    height_cm: null,
    weight_kg: null,
    location: null,
    birthdate: "2008-03-12",
    ...overrides,
  }) as UserProfile

const onClose = vi.fn()
const onSaved = vi.fn()

const renderModal = (overrides: Partial<UserProfile> = {}) =>
  render(<EditProfileModal profile={profile(overrides)} onClose={onClose} onSaved={onSaved} />)

const save = () => fireEvent.click(screen.getByRole("button", { name: /Save Changes/ }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.me = { can_edit_birthdate: false }
  mocks.save.mockResolvedValue({ name: "Me", username: "valid_name", profile_photo: "" })
  useGuardianStore.getState().clear()
})

afterEach(cleanup)

describe("A date on file", () => {
  it("is a read-only row, with no picker", () => {
    renderModal()

    expect(screen.getByText("Date of birth · 12 Mar 2008")).toBeTruthy()
    expect(screen.queryByLabelText("Date of birth picker")).toBeNull()
    expect(screen.queryByText(WARNING)).toBeNull()
  })

  it("stays read-only even mid-onboarding: it is a date on file", () => {
    mocks.me = { can_edit_birthdate: true }

    renderModal()

    expect(screen.queryByLabelText("Date of birth picker")).toBeNull()
  })

  it("links to support, prefilled for a correction", () => {
    renderModal()

    fireEvent.click(screen.getByRole("button", { name: "Wrong date? Contact support" }))

    expect(screen.getByTestId("category").textContent).toBe("account_login")
    expect(screen.getByTestId("description").textContent).toContain("date of birth")
    expect(screen.getByTestId("description").textContent).toContain("12 Mar 2008")
  })

  it("the link does not submit the form", () => {
    renderModal()

    fireEvent.click(screen.getByRole("button", { name: "Wrong date? Contact support" }))

    expect(mocks.save).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it("never goes out in a save", async () => {
    renderModal()

    fireEvent.change(screen.getByPlaceholderText("Your full name"), {
      target: { value: "New Name" },
    })
    save()

    await waitFor(() => expect(mocks.save).toHaveBeenCalled())
    expect(mocks.save.mock.calls[0][0]).not.toHaveProperty("birthdate")
  })
})

describe("A legacy account with none", () => {
  beforeEach(() => {
    mocks.me = { can_edit_birthdate: true }
  })

  it("gets the picker and the warning", () => {
    renderModal({ birthdate: null })

    expect(screen.getByText("Add your date of birth")).toBeTruthy()
    expect(screen.getByLabelText("Date of birth picker")).toBeTruthy()
    expect(screen.getByText(WARNING)).toBeTruthy()
  })

  it("is asked to confirm before it saves", async () => {
    renderModal({ birthdate: null })

    fireEvent.change(screen.getByLabelText("Date of birth picker"), {
      target: { value: "2000-05-06" },
    })
    save()

    expect((await screen.findByRole("alertdialog")).textContent).toContain(
      "Is 6 May 2000 your correct date of birth? You won't be able to change it later."
    )
    expect(mocks.save).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Yes" }))

    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith(
        expect.objectContaining({ birthdate: "2000-05-06" })
      )
    )
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
  })

  it("saves nothing when they go back", async () => {
    renderModal({ birthdate: null })

    fireEvent.change(screen.getByLabelText("Date of birth picker"), {
      target: { value: "2000-05-06" },
    })
    save()
    fireEvent.click(await screen.findByRole("button", { name: "No" }))

    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it("hands off to the parent screen when the date makes them a minor", async () => {
    mocks.save.mockResolvedValue({
      name: "Me",
      username: "valid_name",
      profile_photo: "",
      guardian_required: true,
    })
    renderModal({ birthdate: null })

    fireEvent.change(screen.getByLabelText("Date of birth picker"), {
      target: { value: "2012-05-06" },
    })
    save()
    fireEvent.click(await screen.findByRole("button", { name: "Yes" }))

    await waitFor(() => expect(useGuardianStore.getState().required).toBe(true))
    expect(onClose).toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it("shows the server's sentence under the field if it refuses", async () => {
    mocks.save.mockRejectedValue({
      response: { data: { data: { birthdate: ["Enter a real date."] } } },
    })
    renderModal({ birthdate: null })

    fireEvent.change(screen.getByLabelText("Date of birth picker"), {
      target: { value: "2000-05-06" },
    })
    save()
    fireEvent.click(await screen.findByRole("button", { name: "Yes" }))

    expect((await screen.findByRole("alert")).textContent).toContain("Enter a real date.")
  })
})

describe("No date and not allowed to add one", () => {
  it("offers nothing", () => {
    mocks.me = { can_edit_birthdate: false }

    renderModal({ birthdate: null })

    expect(screen.queryByText(/date of birth/i)).toBeNull()
  })
})
