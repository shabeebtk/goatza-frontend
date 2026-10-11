// @vitest-environment jsdom

/**
 * AchievementsSection — the show-more / see-all gate.
 *
 * ACHIEVEMENT_PAGE_SIZE is three so the shelf pages at the same rate as the
 * Career timeline sitting directly above it. That number is a UI decision with
 * nothing enforcing it, and the section reads it in two places (the initial
 * count and the step), so the interesting case is four awards: the smallest
 * list where getting the page size wrong hides the button entirely.
 *
 * The data layer is mocked rather than driven through React Query — this is a
 * test about how many cards are on screen, and a QueryClient would only add a
 * way for it to fail for reasons that have nothing to do with that.
 */

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import {
    ACHIEVEMENT_PAGE_SIZE,
    ACHIEVEMENT_SEE_ALL_OVER,
    type Achievement,
} from "../../types"
import AchievementsSection from "./AchievementsSection"

vi.mock("@iconify/react", () => ({
    Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}))

vi.mock("next/link", () => ({
    default: ({
        href,
        children,
    }: {
        href: string
        children: React.ReactNode
    }) => <a href={href}>{children}</a>,
}))

// Not a public profile — the section should read the query, not the bundle.
vi.mock("@/features/profile/context/PublicProfileContext", () => ({
    usePublicSection: () => null,
}))

const useUserAchievements = vi.fn()

vi.mock("../../hooks/useAchievementQueries", () => ({
    useUserAchievements: (...args: unknown[]) => useUserAchievements(...args),
    useDeleteAchievement: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useUpdateAchievement: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

// The add/edit form never opens here, and mounting it would drag in
// react-hook-form, the sport list and the org combobox for nothing.
vi.mock("../AchievementModal/AchievementModal", () => ({
    default: () => null,
}))

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

afterEach(() => {
    cleanup()
    useUserAchievements.mockReset()
})

const achievement = (n: number): Achievement => ({
    id: `a${n}`,
    title: `Award ${n}`,
    achievement_type: "individual_award",
    sport: { id: "s1", name: "Football", icon_name: "mdi:soccer", icon_url: "" },
    description: "",
    event_name: "",
    level: "",
    awarded_by: null,
    awarded_by_name: "",
    career_entry: null,
    achieved_date: "2025-06-01",
    image: "",
    image_public_id: "",
    reference_link: "",
    is_pinned: false,
    verification_status: "self_reported",
    verified_at: null,
    created_at: "2025-06-02T00:00:00Z",
})

const renderWith = (count: number, username?: string) => {
    useUserAchievements.mockReturnValue({
        data: {
            count,
            is_owner: false,
            results: Array.from({ length: count }, (_, i) => achievement(i + 1)),
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
        isRefetching: false,
    })

    return render(
        <AchievementsSection userId="u1" username={username} isOwn={false} />
    )
}

const seeAll = () => screen.queryByRole("link", { name: /See all/ })
const showMore = () => screen.queryByRole("button", { name: /Show .* more/ })

const titles = () => screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)

describe("AchievementsSection show more", () => {
    it("pages at the same size as the Career timeline above it", () => {
        expect(ACHIEVEMENT_PAGE_SIZE).toBe(3)
    })

    it("shows three of four, then reveals the fourth and drops the button", () => {
        renderWith(4)

        expect(titles()).toEqual(["Award 1", "Award 2", "Award 3"])

        const button = screen.getByRole("button", { name: /Show 1 more/ })
        fireEvent.click(button)

        expect(titles()).toEqual([
            "Award 1",
            "Award 2",
            "Award 3",
            "Award 4",
        ])
        expect(screen.queryByRole("button", { name: /Show .* more/ })).toBeNull()
    })

    it("offers no button when everything already fits", () => {
        renderWith(3)

        expect(titles()).toHaveLength(3)
        expect(screen.queryByRole("button", { name: /Show .* more/ })).toBeNull()
    })

    // Two presses, not one — the count in the label has to follow the
    // remainder down rather than staying at the page size.
    it("grows by a page per press and counts down the remainder", () => {
        renderWith(8)

        screen.getByRole("button", { name: /Show 3 more/ })
        fireEvent.click(screen.getByRole("button", { name: /Show 3 more/ }))

        expect(titles()).toHaveLength(6)

        fireEvent.click(screen.getByRole("button", { name: /Show 2 more/ }))

        expect(titles()).toHaveLength(8)
        expect(screen.queryByRole("button", { name: /Show .* more/ })).toBeNull()
    })
})

/**
 * THE HAND-OVER. Ten or fewer is a section; past ten it is a list, and the
 * section stops trying to be one — after the first "Show more" the button
 * becomes the way to the page that holds them all.
 */
describe("AchievementsSection see all", () => {
    it("hands over past the threshold, but not before the first press", () => {
        renderWith(ACHIEVEMENT_SEE_ALL_OVER + 2, "shabeeb")

        // Un-expanded, the reader is still offered the next three: they asked
        // for a bit more, not for another screen.
        expect(showMore()).toBeTruthy()
        expect(seeAll()).toBeNull()

        fireEvent.click(showMore()!)

        expect(titles()).toHaveLength(ACHIEVEMENT_PAGE_SIZE * 2)
        expect(showMore()).toBeNull()

        const link = seeAll()
        expect(link).toBeTruthy()
        expect(link!.textContent).toContain(String(ACHIEVEMENT_SEE_ALL_OVER + 2))
        expect(link!.getAttribute("href")).toBe("/profile/shabeeb/achievements")
    })

    it("keeps paging in place at the threshold itself", () => {
        renderWith(ACHIEVEMENT_SEE_ALL_OVER, "shabeeb")

        fireEvent.click(showMore()!)

        // Ten is still a section: no hand-over, just the next page.
        expect(seeAll()).toBeNull()
        expect(showMore()).toBeTruthy()
    })

    // The org side gets these pages later; until a caller passes a username
    // there is nowhere to send anybody, and a button that goes nowhere is
    // worse than the one that already works.
    it("keeps paging in place when no username was passed", () => {
        renderWith(ACHIEVEMENT_SEE_ALL_OVER + 2)

        fireEvent.click(showMore()!)

        expect(seeAll()).toBeNull()
        expect(showMore()).toBeTruthy()
    })
})
