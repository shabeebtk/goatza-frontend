// @vitest-environment jsdom
/**
 * The anonymous profile's bottom bar: on a page with any contact action the
 * Enquire bar replaces PublicCtaBar; without one (or without a page at all)
 * PublicCtaBar shows as it always did.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ACADEMY_PAGE } from "@/features/orgPage/__fixtures__/pageShowcase"
import type { PageShowcase } from "@/features/orgPage/types"
import type { PublicOrgBundle } from "@/features/profile/services/publicProfile.api"
import { useAuthStore } from "@/store/auth.store"
import PublicOrgProfileView from "./PublicOrgProfileView"

const mocks = vi.hoisted(() => ({ fetchPage: vi.fn() }))

vi.mock("@/features/organization/component/OrganizationProfile/OrganizationProfile", () => ({
  default: () => <div data-testid="profile" />,
}))
vi.mock("@/features/profile/components/PublicCtaBar/PublicCtaBar", () => ({
  default: () => <div data-testid="cta-bar" />,
}))
vi.mock("@/features/profile/components/ProfileUnavailable/ProfileUnavailable", () => ({ default: () => null }))
vi.mock("@/features/orgPage/services/pageShowcase.api", () => ({
  fetchPublicPageShowcase: mocks.fetchPage,
  getPageShowcaseApi: vi.fn(),
}))

const BUNDLE = {
  profile: { id: "org-1", username: "kannurfa", name: "Kannur FA", sports: [], locations: [] },
  posts: { count: 0, results: [] },
  recruitments: [],
} as unknown as PublicOrgBundle

const view = (pageSeed: PageShowcase | null) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <PublicOrgProfileView username="kannurfa" bundle={BUNDLE} pageSeed={pageSeed} />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  mocks.fetchPage.mockReset()
  useAuthStore.setState({ isAuthenticated: false, isLoading: false } as never)
})

afterEach(cleanup)

describe("the anonymous bottom bar", () => {
  it("gives way to the Enquire bar on a page with a contact action", () => {
    view(ACADEMY_PAGE)

    expect(screen.getByTestId("profile")).toBeTruthy()
    expect(screen.queryByTestId("cta-bar")).toBeNull()
    expect(mocks.fetchPage).not.toHaveBeenCalled()
  })

  it("gives way with only a number on", () => {
    view({ ...ACADEMY_PAGE, contact: { enquiry_form: false, whatsapp: null, call: "+919812345678", email: null } })
    expect(screen.queryByTestId("cta-bar")).toBeNull()
  })

  it("stays on a page with no contact action", () => {
    view({ ...ACADEMY_PAGE, contact: { enquiry_form: false, whatsapp: null, call: null, email: null } })
    expect(screen.getByTestId("cta-bar")).toBeTruthy()
  })

  it("stays when there is no page", () => {
    view(null)
    expect(screen.getByTestId("cta-bar")).toBeTruthy()
  })
})
