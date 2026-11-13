// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { currentSeasonLabel } from "../../squadUtils"
import NewSquadSheet from "./NewSquadSheet"

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), back: vi.fn() },
  toast: vi.fn(),
  create: vi.fn(),
  navigateAway: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
  usePathname: () => "/organization/admin/org-1/squads",
}))
vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
vi.mock("@/shared/components/ui/Toast/Toast", () => ({ useToast: () => ({ show: mocks.toast }) }))
vi.mock("@/shared/utils/settleViewport", () => ({ settleViewport: () => Promise.resolve() }))
vi.mock("@/shared/hooks/useBackToClose", async (original) => ({
  ...(await original<typeof import("@/shared/hooks/useBackToClose")>()),
  navigateAwayFromOverlays: mocks.navigateAway,
}))
vi.mock("@/features/profile/hooks/useSportsQueries", () => ({
  useSportsList: () => ({
    data: [
      { id: "s-foot", name: "Football", icon_name: "mdi:soccer", icon_url: "", positions: [], attributes: [] },
      { id: "s-crick", name: "Cricket", icon_name: "", icon_url: "", positions: [], attributes: [] },
    ],
    isLoading: false,
  }),
}))
// The real one portals and measures; this is about what the sheet does with a value.
vi.mock("@/shared/components/ui/Select/Select", () => ({
  default: ({
    label,
    options,
    onChange,
    value,
    error,
  }: {
    label: string
    options: { value: string; label: string }[]
    onChange: (value: string) => void
    value: string
    error?: string
  }) => (
    <div data-testid={`select-${label}`} data-value={value}>
      {options.map((option) => (
        <button key={option.value} type="button" onClick={() => onChange(option.value)}>
          Choose {option.label}
        </button>
      ))}
      {error && <p data-testid={`select-${label}-error`}>{error}</p>}
    </div>
  ),
}))
vi.mock("../../services/squads.api", async (original) => ({
  ...(await original<typeof import("../../services/squads.api")>()),
  createSquadApi: mocks.create,
}))

const refusal = (code: string) => ({
  isAxiosError: true,
  response: { status: 400, data: { message: "Server words.", data: { code } } },
})

const renderSheet = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <NewSquadSheet orgId="org-1" onClose={vi.fn()} />
    </QueryClientProvider>
  )

const nameInput = () => screen.getByLabelText("Name") as HTMLInputElement
const create = () => fireEvent.click(screen.getByRole("button", { name: "Create" }))

beforeEach(() => {
  Object.values(mocks).forEach((mock) => {
    if (typeof mock === "function") mock.mockReset()
  })
  mocks.router.push.mockReset()
})

afterEach(cleanup)

describe("NewSquadSheet", () => {
  it("prefills the season and shows the squad on the profile by default", () => {
    renderSheet()

    expect((screen.getByLabelText(/^Season/) as HTMLInputElement).value).toBe(currentSeasonLabel())
    expect(screen.getByRole("switch", { name: "Show on club profile" }).getAttribute("aria-checked")).toBe(
      "true"
    )
  })

  it("needs a name and a sport before it asks the server", () => {
    renderSheet()
    create()

    expect(screen.getByText("Give the squad a name of 2 to 80 characters.")).toBeTruthy()
    expect(screen.getByTestId("select-Sport-error").textContent).toBe("Choose a sport for this squad.")
    expect(nameInput().getAttribute("aria-invalid")).toBe("true")
    expect(mocks.create).not.toHaveBeenCalled()

    fireEvent.change(nameInput(), { target: { value: " A " } })
    create()
    expect(screen.getByText("Give the squad a name of 2 to 80 characters.")).toBeTruthy()
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it("sends what was filled in, trimmed, then lands on the new squad", async () => {
    mocks.create.mockResolvedValue({ id: "sq-9", name: "U17 Boys" })
    renderSheet()

    fireEvent.change(nameInput(), { target: { value: "  U17 Boys  " } })
    fireEvent.click(screen.getByRole("button", { name: "Choose Football" }))
    fireEvent.click(screen.getByRole("button", { name: "Youth" }))
    fireEvent.change(screen.getByLabelText(/^Age group/), { target: { value: " U17 " } })
    fireEvent.change(screen.getByLabelText(/^Season/), { target: { value: "2026" } })
    fireEvent.click(screen.getByRole("switch", { name: "Show on club profile" }))
    create()

    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1))
    expect(mocks.create).toHaveBeenCalledWith("org-1", {
      name: "U17 Boys",
      sport_id: "s-foot",
      level: "youth",
      age_group: "U17",
      season: "2026",
      is_public: false,
    })

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Squad created" }))
    )
    expect(mocks.navigateAway).toHaveBeenCalledWith(
      "/organization/admin/org-1/squads/sq-9",
      mocks.router
    )
  })

  it("clears a level when its chip is tapped again", async () => {
    mocks.create.mockResolvedValue({ id: "sq-9" })
    renderSheet()

    fireEvent.change(nameInput(), { target: { value: "Seniors" } })
    fireEvent.click(screen.getByRole("button", { name: "Choose Cricket" }))
    const senior = screen.getByRole("button", { name: "Senior" })
    fireEvent.click(senior)
    expect(senior.getAttribute("aria-pressed")).toBe("true")
    fireEvent.click(senior)
    expect(senior.getAttribute("aria-pressed")).toBe("false")
    create()

    await waitFor(() => expect(mocks.create).toHaveBeenCalled())
    expect(mocks.create.mock.calls[0][1]).toMatchObject({ level: "", sport_id: "s-crick" })
  })

  it("ignores a second tap while the first create is on its way", async () => {
    mocks.create.mockReturnValue(new Promise(() => {}))
    renderSheet()

    fireEvent.change(nameInput(), { target: { value: "U17 Boys" } })
    fireEvent.click(screen.getByRole("button", { name: "Choose Football" }))
    const button = screen.getByRole("button", { name: "Create" })
    fireEvent.click(button)
    fireEvent.click(button)

    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1))
    expect(await screen.findByRole("button", { name: "Creating…" })).toBeTruthy()
  })

  it("puts a taken name under the Name field", async () => {
    mocks.create.mockRejectedValue(refusal("name_taken"))
    renderSheet()

    fireEvent.change(nameInput(), { target: { value: "U17 Boys" } })
    fireEvent.click(screen.getByRole("button", { name: "Choose Football" }))
    create()

    const message = await screen.findByText("You already have a squad with this name.")
    expect(nameInput().getAttribute("aria-describedby")).toBe(message.id)
    expect(mocks.navigateAway).not.toHaveBeenCalled()
  })

  it("puts the squad limit above the button", async () => {
    mocks.create.mockRejectedValue(refusal("squad_limit"))
    renderSheet()

    fireEvent.change(nameInput(), { target: { value: "U17 Boys" } })
    fireEvent.click(screen.getByRole("button", { name: "Choose Football" }))
    create()

    expect((await screen.findByRole("alert")).textContent).toBe("You can have up to 50 squads.")
  })
})
