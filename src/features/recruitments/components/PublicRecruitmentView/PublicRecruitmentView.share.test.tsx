// @vitest-environment jsdom
/** The public page's share menu: needs no account, but only while it is live. */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/store/auth.store"
import PublicRecruitmentView from "./PublicRecruitmentView"

vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/r/rec-1",
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock("@/shared/components/ui/Toast/Toast", () => ({
  useToast: () => ({ show: vi.fn() }),
}))
vi.mock("../RecruitmentShareMenu/RecruitmentShareMenu", () => ({
  default: () => <button>Share menu</button>,
}))

const recruitment = (overrides: Record<string, unknown> = {}) =>
  ({
    id: "rec-1",
    title: "Open Trials",
    description: "",
    short_description: "",
    recruitment_type: "open_trial",
    visibility: "public",
    apply_method: "goatza",
    gender: "all",
    experience_level: "",
    application_deadline: "2999-01-01T00:00:00Z",
    event_date: "2999-01-01T00:00:00Z",
    timezone: "Asia/Kolkata",
    is_paid: false,
    fee_amount: null,
    fee_currency: "INR",
    venue_name: "",
    city: "Kochi",
    organization: { id: "org-1", username: "dreamfc", name: "Dream FC", logo: "" },
    sport: { id: "s1", name: "Football", icon_name: "mdi:soccer" },
    positions: [],
    media: [],
    questions: [],
    age_categories: [],
    benefits: [],
    requirements: [],
    eligibility_criteria: [],
    contacts: [],
    sessions: [],
    is_accepting_applications: true,
    ...overrides,
  }) as never

const renderView = (overrides: Record<string, unknown>) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PublicRecruitmentView recruitmentId="rec-1" recruitment={recruitment(overrides)} />
    </QueryClientProvider>
  )

beforeEach(() => {
  useAuthStore.setState({ isLoading: false, isAuthenticated: false } as never)
})

afterEach(cleanup)

describe("PublicRecruitmentView's share menu", () => {
  it("is there for a live trial, logged out", () => {
    renderView({ can_share: true })

    expect(screen.getByRole("button", { name: "Share menu" })).toBeTruthy()
  })

  it("is gone once it cannot be shared", () => {
    renderView({ can_share: false })

    expect(screen.queryByRole("button", { name: "Share menu" })).toBeNull()
  })
})
