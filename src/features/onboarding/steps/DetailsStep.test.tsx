// @vitest-environment jsdom
/**
 * The final review of a date of birth: the last moment it can change, so a change
 * is confirmed, and one that makes someone a minor hands off to the parent screen.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useGuardianStore } from "@/features/guardian/store/guardian.store"
import { useOnboardingStore } from "../store/onboarding.store"
import DetailsStep from "./DetailsStep"

const mocks = vi.hoisted(() => ({
  profile: {} as Record<string, unknown>,
  save: vi.fn(),
  replace: vi.fn(),
}))

vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }))
vi.mock("@/features/profile/hooks/useProfileQueries", () => ({
  useMyProfile: () => ({ data: mocks.profile, isLoading: false }),
  useUpdateProfileData: () => ({ mutateAsync: mocks.save, isPending: false }),
}))
vi.mock("@/features/profile/hooks/useSportsQueries", () => ({
  useSportsList: () => ({ data: [] }),
}))
vi.mock("@/shared/components/ui", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  DateOfBirthPicker: ({
    value,
    onChange,
  }: {
    value: string | null
    onChange: (next: string | null) => void
  }) => (
    <input
      aria-label="Date of birth"
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

const LAST_CHANCE =
  "Last chance to change your date of birth. After this step it's locked."

const onNext = vi.fn()

const pressContinue = () =>
  fireEvent.click(screen.getByRole("button", { name: /Continue/ }))

const changeDate = (value: string) =>
  fireEvent.change(screen.getByLabelText("Date of birth"), { target: { value } })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.profile = {
    id: "u1",
    username: "me",
    name: "Me",
    headline: "",
    about: "",
    height_cm: null,
    weight_kg: null,
    birthdate: "2000-01-01",
    can_edit_birthdate: true,
  }
  mocks.save.mockResolvedValue({ name: "Me", username: "me", profile_photo: "" })
  useGuardianStore.getState().clear()
  useOnboardingStore.setState({ drafts: {} } as never)
  vi.stubGlobal("sessionStorage", window.sessionStorage)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("DetailsStep's date of birth", () => {
  it("says this is the last chance", () => {
    render(<DetailsStep onNext={onNext} />)

    expect(screen.getByText(LAST_CHANCE)).toBeTruthy()
  })

  it("asks nothing and saves no date when it was left alone", async () => {
    render(<DetailsStep onNext={onNext} />)

    pressContinue()

    await waitFor(() => expect(onNext).toHaveBeenCalled())
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it("asks first when it changed, naming the date", async () => {
    render(<DetailsStep onNext={onNext} />)

    changeDate("2008-03-12")
    pressContinue()

    expect((await screen.findByRole("alertdialog")).textContent).toContain(
      "Is 12 March 2008 your correct date of birth? You won't be able to change it later."
    )
    expect(mocks.save).not.toHaveBeenCalled()
    expect(onNext).not.toHaveBeenCalled()
  })

  it("saves once confirmed, then moves on", async () => {
    render(<DetailsStep onNext={onNext} />)

    changeDate("2008-03-12")
    pressContinue()
    fireEvent.click(await screen.findByRole("button", { name: "Yes" }))

    await waitFor(() => expect(onNext).toHaveBeenCalled())
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ birthdate: "2008-03-12" })
    )
  })

  it("stays put when they go back to check", async () => {
    render(<DetailsStep onNext={onNext} />)

    changeDate("2008-03-12")
    pressContinue()
    fireEvent.click(await screen.findByRole("button", { name: "No" }))

    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect(mocks.save).not.toHaveBeenCalled()
    expect(onNext).not.toHaveBeenCalled()
  })

  it("does not send a half-picked date, which the server would refuse as a clear", async () => {
    render(<DetailsStep onNext={onNext} />)

    changeDate("")
    pressContinue()

    await waitFor(() => expect(onNext).toHaveBeenCalled())
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it("hands off to the parent screen when the date makes them a minor", async () => {
    mocks.save.mockResolvedValue({
      name: "Me",
      username: "me",
      profile_photo: "",
      guardian_required: true,
    })
    const finish = vi.fn()
    useOnboardingStore.setState({ finish } as never)
    render(<DetailsStep onNext={onNext} />)

    changeDate("2012-03-12")
    pressContinue()
    fireEvent.click(await screen.findByRole("button", { name: "Yes" }))

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/auth"))
    expect(useGuardianStore.getState().required).toBe(true)
    expect(finish).toHaveBeenCalled()
    expect(onNext).not.toHaveBeenCalled()
  })

  it("shows the server's own sentence when it refuses the date", async () => {
    mocks.save.mockRejectedValue({
      response: {
        data: {
          message: "Validation failed",
          data: { birthdate: ["Your date of birth can't be changed."] },
        },
      },
    })
    render(<DetailsStep onNext={onNext} />)

    changeDate("2008-03-12")
    pressContinue()
    fireEvent.click(await screen.findByRole("button", { name: "Yes" }))

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Your date of birth can't be changed."
    )
    expect(onNext).not.toHaveBeenCalled()
  })

  it("has no picker if somebody comes back through here after it locked", () => {
    mocks.profile = { ...mocks.profile, can_edit_birthdate: false }

    render(<DetailsStep onNext={onNext} />)

    expect(screen.queryByLabelText("Date of birth")).toBeNull()
    expect(screen.queryByText(LAST_CHANCE)).toBeNull()
    expect(screen.getByText("1 January 2000")).toBeTruthy()
  })
})
