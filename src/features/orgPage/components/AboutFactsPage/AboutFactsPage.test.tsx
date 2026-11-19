// @vitest-environment jsdom
/**
 * About & key facts: the client refuses what the server would (an age range the
 * wrong way round, a link that isn't https on the right site), and days and
 * languages go up as the server stores them.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/store/auth.store"
import { FRESH_ADMIN, SETTINGS } from "../../__fixtures__/pageAdmin"
import AboutFactsPage from "./AboutFactsPage"

const mocks = vi.hoisted(() => ({
  updateFacts: vi.fn(),
  updateAbout: vi.fn(),
  toast: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/organization/admin/org-1/page/about",
}))
vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
vi.mock("@/shared/components/ui/Toast/Toast", () => ({ useToast: () => ({ show: mocks.toast }) }))
vi.mock("@/shared/components/ui/Select/Select", () => ({
  default: ({ label, value }: { label?: string; value: string }) => (
    <div data-testid={`select-${label}`} data-value={value} />
  ),
}))
vi.mock("@/features/organization/hooks/useOrganizations", async (original) => ({
  ...(await original<typeof import("@/features/organization/hooks/useOrganizations")>()),
  useOrgDetail: () => ({
    data: { id: "org-1", type: "academy", description: "We coach football.", sports: [], locations: [] },
    isLoading: false,
    refetch: vi.fn(),
    isRefetching: false,
  }),
}))
vi.mock("../../services/orgPage.api", async (original) => ({
  ...(await original<typeof import("../../services/orgPage.api")>()),
  getPageAdminApi: () => Promise.resolve(FRESH_ADMIN),
  updateFactsApi: mocks.updateFacts,
  updateAboutApi: mocks.updateAbout,
}))

const ORG = { id: "org-1", name: "Bright Academy", username: "brightacademy", type: "academy", my_permissions: ["page.manage"] }

const renderPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}
    >
      <AboutFactsPage orgId="org-1" />
    </QueryClientProvider>
  )

const save = () => fireEvent.click(screen.getByRole("button", { name: "Save" }))

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  mocks.updateFacts.mockReset()
  mocks.updateAbout.mockReset()
  mocks.toast.mockReset()
  useAuthStore.setState({ organizations: [ORG] as never, currentOrganization: ORG as never })
})

afterEach(cleanup)

describe("AboutFactsPage", () => {
  it("names the org's own kind in the About heading", async () => {
    renderPage()
    expect(await screen.findByRole("heading", { name: "About your academy" })).toBeTruthy()
    expect((screen.getByLabelText("Description") as HTMLTextAreaElement).value).toBe("We coach football.")
  })

  it("refuses a 'from' age above the 'to' age before anything is sent", async () => {
    renderPage()
    fireEvent.change(await screen.findByLabelText("From"), { target: { value: "14" } })
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "9" } })
    save()

    expect(await screen.findByText("The oldest age can't be below the youngest.")).toBeTruthy()
    expect(mocks.updateFacts).not.toHaveBeenCalled()
  })

  it("refuses a link on the wrong site, and upgrades a bare one to https", async () => {
    renderPage()
    const instagram = (await screen.findByLabelText("Instagram")) as HTMLInputElement

    fireEvent.change(instagram, { target: { value: "https://example.com/brightacademy" } })
    save()
    expect(await screen.findByText("Enter an https link to your Instagram page.")).toBeTruthy()
    expect(mocks.updateFacts).not.toHaveBeenCalled()

    fireEvent.change(instagram, { target: { value: "http://instagram.com/brightacademy" } })
    fireEvent.blur(instagram)
    expect(instagram.value).toBe("https://instagram.com/brightacademy")
  })

  it("sends days in week order and the languages as chips, and nothing else", async () => {
    mocks.updateFacts.mockResolvedValue({
      ...SETTINGS,
      facts: { ...SETTINGS.facts, training_days: ["tue", "sat"], coaching_languages: ["Tamil", "English"] },
    })
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "Saturday" }))
    fireEvent.click(screen.getByRole("button", { name: "Tuesday" }))
    expect(screen.getByRole("button", { name: "Tuesday" }).getAttribute("aria-pressed")).toBe("true")

    const languages = screen.getByLabelText("Coaching languages")
    fireEvent.change(languages, { target: { value: "Tamil" } })
    fireEvent.keyDown(languages, { key: "Enter" })
    fireEvent.click(screen.getByRole("button", { name: "Add English" }))
    // Already added: the quick chip goes.
    expect(screen.queryByRole("button", { name: "Add English" })).toBeNull()

    save()

    await waitFor(() =>
      expect(mocks.updateFacts).toHaveBeenCalledWith("org-1", {
        coaching_languages: ["Tamil", "English"],
        training_days: ["tue", "sat"],
      })
    )
    expect(mocks.updateAbout).not.toHaveBeenCalled()
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Saved" })))
  })

  it("saves the description first, then the facts", async () => {
    const order: string[] = []
    mocks.updateAbout.mockImplementation(async () => {
      order.push("about")
      return {}
    })
    mocks.updateFacts.mockImplementation(async () => {
      order.push("facts")
      return { ...SETTINGS, facts: { ...SETTINGS.facts, founded_year: 2010 } }
    })
    renderPage()

    fireEvent.change(await screen.findByLabelText("Description"), {
      target: { value: "We coach football for ages 6 to 16 in Kochi." },
    })
    fireEvent.change(screen.getByLabelText("Founded"), { target: { value: "2010" } })
    save()

    await waitFor(() => expect(order).toEqual(["about", "facts"]))
    expect(mocks.updateAbout).toHaveBeenCalledWith("org-1", "We coach football for ages 6 to 16 in Kochi.")
    expect(mocks.updateFacts).toHaveBeenCalledWith("org-1", { founded_year: 2010 })
  })
})
