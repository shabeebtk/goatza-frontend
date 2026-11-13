// @vitest-environment jsdom

/**
 * The verified badge. The org's tick shows on this page and nowhere else, and
 * staff set it from the Django admin, so whether it renders is the whole contract.
 * The popover is what tells a reader what the tick means.
 */

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import OrgProfile from "./OrganizationProfile"

vi.mock("@iconify/react", () => ({
    Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}))

vi.mock("next/link", () => ({
    default: ({ href, children }: { href: string; children: React.ReactNode }) => (
        <a href={href}>{children}</a>
    ),
}))

vi.mock("@/shared/services/navigation.service", () => ({
    useNavigation: () => ({ toMessage: () => "/m", toNetwork: () => "/n" }),
}))

vi.mock("@/features/profile/context/PublicProfileContext", () => ({
    usePublicProfile: () => null,
}))

const orgDetail = vi.fn()

vi.mock("@/features/organization/hooks/useOrganizations", () => ({
    useOrgDetail: () => orgDetail(),
    useFollowOrg: () => ({
        follow: { mutate: vi.fn(), isPending: false },
        unfollow: { mutate: vi.fn(), isPending: false },
    }),
}))

// Everything below the header is somebody else's feature, and each would drag
// its own queries in for a test about one badge.
vi.mock("@/features/profile/components/ProfileShareMenu/ProfileShareMenu", () => ({
    default: () => null,
}))
vi.mock("@/features/moderation/components/BlockedProfileBanner/BlockedProfileBanner", () => ({
    default: () => null,
}))
vi.mock("../OrgPhotoEditModal/OrgPhotoEditModal", () => ({ default: () => null }))
vi.mock("../EditOrgProfileModal/EditOrgProfileModal", () => ({ default: () => null }))
vi.mock("@/features/posts/components/PostsList/PostsList.tsx", () => ({ default: () => null }))
vi.mock("@/features/squads/components/OrgSquadsSection/OrgSquadsSection", () => ({
  default: () => null,
}))
vi.mock("@/features/posts/components/CreatePostModal/CreatePostModal", () => ({ default: () => null }))
vi.mock("@/features/recruitments/components/RecruitmentsList/RecruitmentsList", () => ({
    default: () => null,
}))

const makeOrg = (overrides = {}) => ({
    id: "org-1",
    name: "Thalassery United",
    username: "thalassery",
    type: "club",
    level: "",
    logo: "",
    cover_image: "",
    headline: "",
    description: "",
    website: "",
    followers_count: 0,
    following_count: 0,
    posts_count: 0,
    is_verified: true,
    sports: [],
    locations: [],
    relationship: null,
    ...overrides,
})

const renderProfile = (org = makeOrg()) => {
    orgDetail.mockReturnValue({ data: org, isLoading: false, isError: false })
    return render(<OrgProfile orgId="org-1" />)
}

const badge = () =>
    screen.getByRole("button", { name: "Verified organization" })

afterEach(() => {
    cleanup()
    orgDetail.mockReset()
})

describe("the verified badge", () => {
    it("shows when the organization is verified", () => {
        renderProfile()

        expect(badge().tagName).toBe("BUTTON")
        expect(badge().getAttribute("type")).toBe("button")
    })

    it("does not show when it is not", () => {
        renderProfile(makeOrg({ is_verified: false }))

        expect(
            screen.queryByRole("button", { name: "Verified organization" })
        ).toBeNull()
        expect(screen.queryByText("Verified")).toBeNull()
    })
})

describe("the popover", () => {
    const popover = () => screen.queryByRole("tooltip")

    it("opens on a tap and says what the tick means", () => {
        renderProfile()
        expect(popover()).toBeNull()

        fireEvent.click(badge())

        expect(screen.getByText("Verified by Goatza")).toBeTruthy()
        expect(
            screen.getByText("Goatza has confirmed this organization is genuine.")
        ).toBeTruthy()
    })

    it("opens on keyboard focus", () => {
        renderProfile()

        fireEvent.focus(badge())

        expect(popover()).toBeTruthy()
    })

    it("does not open on the focus a press causes, so a tap does not open then shut it", () => {
        renderProfile()

        fireEvent.pointerDown(badge())
        fireEvent.focus(badge())
        expect(popover()).toBeNull()

        fireEvent.click(badge())
        expect(popover()).toBeTruthy()
    })

    it("closes on an outside tap, but not on a tap inside it", () => {
        renderProfile()
        fireEvent.click(badge())

        fireEvent.pointerDown(popover() as HTMLElement)
        expect(popover()).toBeTruthy()

        fireEvent.pointerDown(document.body)
        expect(popover()).toBeNull()
    })

    it("closes on Esc", () => {
        renderProfile()
        fireEvent.click(badge())

        fireEvent.keyDown(document, { key: "Escape" })

        expect(popover()).toBeNull()
    })

    it("closes on scroll", () => {
        renderProfile()
        fireEvent.click(badge())

        fireEvent.scroll(window)

        expect(popover()).toBeNull()
    })
})
