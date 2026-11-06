// @vitest-environment jsdom
/** The card's share icon: only while the recruitment is live, and no empty slot. */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/store/auth.store"
import type { Recruitment } from "../../services/recruitments.api"
import RecruitmentCard from "./RecruitmentCard"

vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))
vi.mock("@/shared/services/navigation.service", () => ({
  useNavigation: () => ({ toRecruitment: () => "/r", toProfile: () => "/p" }),
}))
vi.mock("@/shared/components/ui/Avatar/Avatar", () => ({ default: () => <span /> }))
vi.mock("@/features/messages/components/ShareSheet/ShareSheet", () => ({
  default: () => <div data-testid="share-sheet" />,
}))
vi.mock("../RecruitmentSharePreview/RecruitmentSharePreview", () => ({ default: () => null }))
vi.mock("../../hooks/useRecruitments", () => ({
  useToggleSaveRecruitment: () => ({ mutate: vi.fn() }),
}))

const recruitment = (overrides: Partial<Recruitment> = {}) =>
  ({
    id: "rec-1",
    title: "Open Trials",
    short_description: "",
    recruitment_type: "open_trial",
    status: "active",
    visibility: "public",
    city: "Kochi",
    applications_count: 3,
    event_date: "2999-01-01T00:00:00Z",
    application_deadline: "2999-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    organization: { id: "org-1", name: "Dream FC", username: "dreamfc", logo: "" },
    sport: { id: "s1", name: "Football", icon_name: "mdi:soccer" },
    positions: [],
    age_categories: [],
    timezone: "Asia/Kolkata",
    ...overrides,
  }) as unknown as Recruitment

const shareButton = () => screen.queryByRole("button", { name: "Share recruitment" })

beforeEach(() => {
  useAuthStore.setState({ actorType: "user", actorId: null } as never)
})

afterEach(cleanup)

describe("RecruitmentCard's share icon", () => {
  it("is there while it is live", () => {
    render(<RecruitmentCard recruitment={recruitment({ can_share: true })} />)

    expect(shareButton()).toBeTruthy()
    expect(screen.getByTestId("share-sheet")).toBeTruthy()
  })

  it.each(["draft", "closed", "cancelled"])("is gone for %s", (status) => {
    render(
      <RecruitmentCard
        recruitment={recruitment({ status } as Partial<Recruitment>)}
      />
    )

    expect(shareButton()).toBeNull()
    expect(screen.queryByTestId("share-sheet")).toBeNull()
  })

  it("is gone when the trial is over", () => {
    render(<RecruitmentCard recruitment={recruitment({ is_trial_over: true })} />)

    expect(shareButton()).toBeNull()
  })

  it("is gone when the server says so", () => {
    render(<RecruitmentCard recruitment={recruitment({ can_share: false })} />)

    expect(shareButton()).toBeNull()
  })

  it("leaves the bookmark beside it alone", () => {
    render(<RecruitmentCard recruitment={recruitment({ can_share: false })} />)

    expect(screen.getByRole("button", { name: "Save recruitment" })).toBeTruthy()
  })

  it("leaves no empty slot on the organiser's own card", () => {
    useAuthStore.setState({ actorType: "organization", actorId: "org-1" } as never)

    const { container } = render(
      <RecruitmentCard recruitment={recruitment({ can_share: false })} />
    )

    expect(screen.queryByRole("button", { name: "Save recruitment" })).toBeNull()
    expect(container.querySelector('[class*="quickActions"]')).toBeNull()
  })
})
