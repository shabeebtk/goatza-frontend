// @vitest-environment jsdom
/**
 * Facilities: what the chips and the club's own words send, and the photo cap.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/store/auth.store"
import type { PageFacilities } from "../../types"
import FacilitiesPage from "./FacilitiesPage"

const mocks = vi.hoisted(() => ({
  data: null as unknown,
  save: vi.fn(),
  toast: vi.fn(),
  replace: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: mocks.replace, back: vi.fn() }),
  usePathname: () => "/organization/admin/org-1/page/facilities",
}))
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}))
vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
vi.mock("@/shared/components/ui/Toast/Toast", () => ({ useToast: () => ({ show: mocks.toast }) }))
vi.mock("@/features/organization/component/OrgPhotoCropSheet/OrgPhotoCropSheet", () => ({
  default: () => <div data-testid="crop-sheet" />,
}))
vi.mock("@/shared/services/imageVariants", () => ({ ensureDecodableImage: vi.fn() }))
vi.mock("../../services/orgPage.api", async (original) => ({
  ...(await original<typeof import("../../services/orgPage.api")>()),
  getFacilitiesApi: () => Promise.resolve(mocks.data),
  saveLocationFacilitiesApi: mocks.save,
}))

const ORG = { id: "org-1", name: "Bright Academy", username: "brightacademy", type: "academy", my_permissions: ["page.manage"] }

const CATALOG: PageFacilities["catalog"] = [
  {
    group: "playing_area",
    label: "Playing area",
    items: [
      { key: "natural_grass", label: "Natural grass" },
      { key: "artificial_turf", label: "Artificial turf" },
    ],
  },
  {
    group: "comfort",
    label: "Comfort",
    items: [
      { key: "changing_rooms", label: "Changing rooms" },
      { key: "drinking_water", label: "Drinking water" },
    ],
  },
]

const branch = (photos = 0) => ({
  location: { id: "loc-1", name: "Main Ground", city: "Kochi" },
  items: ["artificial_turf"],
  custom_items: [],
  photos: Array.from({ length: photos }, (_, index) => ({
    id: `ph-${index}`,
    url: `https://media.example.com/${index}.webp`,
    order: index,
  })),
})

const renderPage = (data: PageFacilities) => {
  mocks.data = data
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}
    >
      <FacilitiesPage orgId="org-1" />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  mocks.save.mockReset()
  mocks.toast.mockReset()
  useAuthStore.setState({ organizations: [ORG] as never, currentOrganization: ORG as never })
})

afterEach(cleanup)

describe("The facility chips", () => {
  it("send the catalog keys in catalog order, plus the club's own words", async () => {
    mocks.save.mockImplementation(async (_org: string, _loc: string, body: { items: string[]; custom_items: string[] }) => ({
      ...branch(),
      ...body,
    }))
    renderPage({ catalog: CATALOG, locations: [branch()] })

    const grass = await screen.findByRole("button", { name: "Natural grass" })
    expect(screen.getByRole("button", { name: "Artificial turf" }).getAttribute("aria-pressed")).toBe("true")

    fireEvent.click(screen.getByRole("button", { name: "Drinking water" }))
    fireEvent.click(grass)
    fireEvent.click(screen.getByRole("button", { name: "Artificial turf" }))
    expect(grass.getAttribute("aria-pressed")).toBe("true")
    expect(screen.getByText("2 picked")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Add your own" }))
    const own = screen.getByLabelText("A facility in your own words")
    fireEvent.change(own, { target: { value: "Floodlit futsal court" } })
    fireEvent.keyDown(own, { key: "Enter" })
    expect(screen.getByText("Floodlit futsal court")).toBeTruthy()
    expect(screen.getByText("3 picked")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Save facilities" }))

    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith("org-1", "loc-1", {
        items: ["natural_grass", "drinking_water"],
        custom_items: ["Floodlit futsal court"],
      })
    )
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Facilities saved" }))
    )
  })

  it("refuses own words that are too short, and a repeat", async () => {
    renderPage({ catalog: CATALOG, locations: [branch()] })

    fireEvent.click(await screen.findByRole("button", { name: "Add your own" }))
    const own = screen.getByLabelText("A facility in your own words")
    fireEvent.change(own, { target: { value: "x" } })
    fireEvent.keyDown(own, { key: "Enter" })
    expect(screen.getByText("Use 2 to 40 characters.")).toBeTruthy()

    fireEvent.change(own, { target: { value: "Gym" } })
    fireEvent.keyDown(own, { key: "Enter" })
    fireEvent.change(own, { target: { value: "gym" } })
    fireEvent.keyDown(own, { key: "Enter" })
    expect(screen.getByText("That's already on the list.")).toBeTruthy()
  })
})

describe("The photos", () => {
  it("mark the first as the cover and offer Add below twelve", async () => {
    renderPage({ catalog: CATALOG, locations: [branch(3)] })

    expect(await screen.findByText("Cover")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Add" })).toBeTruthy()
    expect(screen.getByText("Up to 12 photos. The first one leads.")).toBeTruthy()
  })

  it("take the Add tile away at twelve", async () => {
    renderPage({ catalog: CATALOG, locations: [branch(12)] })

    await screen.findByText("Cover")
    expect(screen.getAllByRole("img")).toHaveLength(12)
    expect(screen.queryByRole("button", { name: "Add" })).toBeNull()
  })
})

describe("No branches", () => {
  it("sends the club to add a location first", async () => {
    renderPage({ catalog: CATALOG, locations: [] })

    expect(await screen.findByText("Facilities belong to a branch. Add where you train first.")).toBeTruthy()
    expect(screen.getByRole("link", { name: "Add a location" }).getAttribute("href")).toBe(
      "/organization/admin/org-1/profile?edit=profile"
    )
  })
})
