// @vitest-environment jsdom
/**
 * The hub: the readiness card (headline, next step, 100%), and the section rows
 * (switch, Add pill or nothing; the switch is optimistic and rolls back).
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/store/auth.store"
import { FILLED_ADMIN, FRESH_ADMIN } from "../../__fixtures__/pageAdmin"
import type { PageAdmin, ReadinessKey } from "../../types"
import PageHub from "./PageHub"
import styles from "./PageHub.module.css"

const mocks = vi.hoisted(() => ({
  admin: null as unknown,
  updateSections: vi.fn(),
  toast: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/organization/admin/org-1/page",
}))
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))
vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
vi.mock("@/shared/components/ui/Toast/Toast", () => ({ useToast: () => ({ show: mocks.toast }) }))
vi.mock("@/features/profile/services/publicProfile.api", () => ({ siteOrigin: () => "https://goatza.com" }))
vi.mock("../../services/orgPage.api", async (original) => ({
  ...(await original<typeof import("../../services/orgPage.api")>()),
  getPageAdminApi: () => Promise.resolve(mocks.admin),
  updateSectionsApi: mocks.updateSections,
}))

const ORG = {
  id: "org-1",
  name: "Bright Academy",
  username: "brightacademy",
  type: "academy",
  logo: "",
  my_permissions: ["members.view", "page.manage"],
}

const renderHub = (admin: PageAdmin) => {
  mocks.admin = admin
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <PageHub orgId="org-1" />
    </QueryClientProvider>
  )
}

const row = (title: string) =>
  screen.getByText(title, { selector: `.${styles.sectionTitle}` }).closest("li") as HTMLElement

/** A promise the test settles, so the optimistic state can be seen before the answer. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  mocks.updateSections.mockReset()
  mocks.toast.mockReset()
  useAuthStore.setState({
    organizations: [ORG] as never,
    currentOrganization: ORG as never,
    actorType: "organization",
    actorId: "org-1",
  })
})

afterEach(cleanup)

describe("The readiness card", () => {
  it("says how ready the page is, with the bar and the next step", async () => {
    renderHub(FRESH_ADMIN)

    expect(await screen.findByRole("heading", { name: /your page is 20% ready/i })).toBeTruthy()
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("20")
    expect(screen.getByText("Parents look for programs and fees first.")).toBeTruthy()
    expect(screen.getByRole("link", { name: "Add a program" }).getAttribute("href")).toBe(
      "/organization/admin/org-1/page/programs/new"
    )
  })

  it.each([
    ["programs", "Add a program", "/organization/admin/org-1/page/programs/new"],
    ["facilities", "Add facilities", "/organization/admin/org-1/page/facilities"],
    ["coaches", "Add coaches", "/organization/admin/org-1/page/people"],
    ["about", "Write about your page", "/organization/admin/org-1/page/about"],
    ["facts", "Add key facts", "/organization/admin/org-1/page/about#facts"],
    ["photos", "Add a logo and cover", "/organization/admin/org-1/profile?edit=photos"],
    ["location", "Add a location", "/organization/admin/org-1/profile?edit=profile"],
    ["contact", "Choose how people reach you", "/organization/admin/org-1/page/contact"],
  ] as const)("sends %s to its editor", async (key, label, href) => {
    renderHub({
      ...FRESH_ADMIN,
      readiness: { ...FRESH_ADMIN.readiness, next: { key: key as ReadinessKey, label } },
    })

    expect((await screen.findByRole("link", { name: label })).getAttribute("href")).toBe(href)
  })

  it("at 100% says the page is ready and offers to share it", async () => {
    renderHub({ ...FILLED_ADMIN, readiness: { ...FILLED_ADMIN.readiness, percent: 100, next: null } })

    expect(await screen.findByRole("heading", { name: /^your page is ready$/i })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Share it" })).toBeTruthy()
  })

  it("keeps the checklist folded until asked", async () => {
    renderHub(FRESH_ADMIN)

    const toggle = await screen.findByRole("button", { name: "See checklist" })
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    fireEvent.click(toggle)
    expect(toggle.getAttribute("aria-expanded")).toBe("true")
    expect(screen.getByText("Add a location")).toBeTruthy()
  })
})

describe("The section rows", () => {
  it("offer the switch for content or a hidden section, Add for empty and on, nothing for posts", async () => {
    renderHub(FILLED_ADMIN)
    await screen.findByText("Programs & fees")

    // Content: a switch, on.
    const programs = row("Programs & fees")
    expect(within(programs).getByRole("switch").getAttribute("aria-checked")).toBe("true")
    expect(within(programs).getByText("2 programs")).toBeTruthy()

    // Empty and on: the Add pill, to the screen that owns it.
    const squads = row("Squads")
    expect(within(squads).queryByRole("switch")).toBeNull()
    expect(within(squads).getByRole("link", { name: /Add/ }).getAttribute("href")).toBe(
      "/organization/admin/org-1/squads"
    )

    // Empty and off: the switch, so it can be turned back on.
    const players = row("Players we developed")
    expect(within(players).getByRole("switch").getAttribute("aria-checked")).toBe("false")
    expect(within(players).getByText(/Not picked yet · Hidden/)).toBeTruthy()

    // Posts: always shown, no control.
    const posts = row("Posts")
    expect(within(posts).queryByRole("switch")).toBeNull()
    expect(within(posts).getByText("Always shown")).toBeTruthy()
  })

  it("flips at once and toasts when the server agrees", async () => {
    const answer = deferred<unknown>()
    mocks.updateSections.mockReturnValue(answer.promise)
    renderHub(FILLED_ADMIN)
    await screen.findByText("Programs & fees")

    const toggle = within(row("Programs & fees")).getByRole("switch")
    fireEvent.click(toggle)

    // Before the server has said anything.
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("false"))
    expect(mocks.updateSections).toHaveBeenCalledWith("org-1", { programs: false })
    expect(mocks.toast).not.toHaveBeenCalled()

    answer.resolve({ ...FILLED_ADMIN.settings, sections: { ...FILLED_ADMIN.settings.sections, programs: false } })
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Hidden from your page" }))
    )
  })

  it("puts the switch back and says why when the server refuses", async () => {
    const answer = deferred<unknown>()
    mocks.updateSections.mockReturnValue(answer.promise)
    renderHub(FILLED_ADMIN)
    await screen.findByText("Programs & fees")

    fireEvent.click(within(row("Programs & fees")).getByRole("switch"))
    await waitFor(() =>
      expect(within(row("Programs & fees")).getByRole("switch").getAttribute("aria-checked")).toBe("false")
    )

    answer.reject({
      isAxiosError: true,
      response: { status: 400, data: { message: "This section can't be switched off.", data: { code: "invalid" } } },
    })

    await waitFor(() =>
      expect(within(row("Programs & fees")).getByRole("switch").getAttribute("aria-checked")).toBe("true")
    )
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "error", message: "This section can't be switched off." })
    )
  })
})

describe("Who sees the hub", () => {
  it("is a calm empty state without page.manage, never a redirect", () => {
    const viewer = { ...ORG, my_permissions: ["members.view"] }
    useAuthStore.setState({ organizations: [viewer] as never, currentOrganization: viewer as never })
    renderHub(FRESH_ADMIN)

    expect(screen.getByText("Only owners and staff can edit the page.")).toBeTruthy()
    expect(screen.getByRole("link", { name: "Back to dashboard" }).getAttribute("href")).toBe(
      "/organization/admin/org-1/dashboard"
    )
  })
})
