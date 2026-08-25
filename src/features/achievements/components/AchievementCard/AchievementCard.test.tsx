// @vitest-environment jsdom

/**
 * AchievementCard — the thumbnail's two states and what they open.
 *
 * The layout itself isn't tested: "the chips run the full card width" is a
 * grid question that jsdom, which computes no layout, would answer yes to
 * whatever the CSS says. What IS tested is the part a test can hold the line
 * on — whether the thumb is an interactive control, and whether it opens the
 * viewer it claims to.
 */

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import type { Achievement } from "../../types"
import AchievementCard from "./AchievementCard"

vi.mock("@iconify/react", () => ({
    Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}))

afterEach(cleanup)

const IMAGE = "https://media.goatza.test/users/u1/achievements/certificate.webp"

const achievement = (overrides: Partial<Achievement> = {}): Achievement => ({
    id: "a1",
    title: "Most Valuable Player",
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
    ...overrides,
})

const noop = () => {}

const renderCard = (a: Achievement, isOwn = false) =>
    render(
        <AchievementCard
            achievement={a}
            isOwn={isOwn}
            onEdit={noop}
            onDelete={noop}
            onTogglePin={noop}
        />
    )

describe("AchievementCard thumbnail", () => {
    it("is a button when there is a real image", () => {
        renderCard(achievement({ image: IMAGE }))

        const thumb = screen.getByRole("button", {
            name: "View image for Most Valuable Player",
        })
        expect(thumb.tagName).toBe("BUTTON")
    })

    // A placeholder has nothing behind it, so it must not be a focus stop.
    it("is not a button when the award has no image", () => {
        renderCard(achievement())

        expect(screen.queryByRole("button")).toBeNull()
    })

    it("opens the fullscreen viewer on click, with the title as alt text", () => {
        renderCard(achievement({ image: IMAGE }))

        expect(screen.queryByRole("dialog")).toBeNull()

        fireEvent.click(
            screen.getByRole("button", {
                name: "View image for Most Valuable Player",
            })
        )

        screen.getByRole("dialog")
        const img = screen.getByAltText("Most Valuable Player") as HTMLImageElement
        expect(img.src).toBe(IMAGE)
    })

    it("closes the viewer on Escape", () => {
        renderCard(achievement({ image: IMAGE }))

        fireEvent.click(screen.getByRole("button", { name: /^View image/ }))
        screen.getByRole("dialog")

        fireEvent.keyDown(document, { key: "Escape" })

        expect(screen.queryByRole("dialog")).toBeNull()
    })

    it("closes the viewer on a backdrop click", () => {
        renderCard(achievement({ image: IMAGE }))

        fireEvent.click(screen.getByRole("button", { name: /^View image/ }))
        fireEvent.click(screen.getByRole("dialog"))

        expect(screen.queryByRole("dialog")).toBeNull()
    })

    // The <img> is what fails, and it fails after the card has rendered — so
    // the card has to give up its button too, not just swap the picture.
    it("falls back to the inert placeholder when the image fails to load", () => {
        renderCard(achievement({ image: IMAGE }))

        fireEvent.error(screen.getByRole("button", { name: /^View image/ })
            .querySelector("img")!)

        expect(screen.queryByRole("button")).toBeNull()
    })
})

describe("AchievementCard owner actions", () => {
    // Three controls beside the title is what forced the header to widen; if a
    // future edit drops one, the layout reasoning behind it stops applying.
    it("renders pin, edit and delete for the owner", () => {
        renderCard(achievement(), true)

        screen.getByRole("button", { name: "Pin Most Valuable Player" })
        screen.getByRole("button", { name: "Edit Most Valuable Player" })
        screen.getByRole("button", { name: "Delete Most Valuable Player" })
    })

    it("renders none of them for a visitor", () => {
        renderCard(achievement(), false)

        expect(screen.queryByRole("button", { name: /^Edit/ })).toBeNull()
        expect(screen.queryByRole("button", { name: /^Delete/ })).toBeNull()
    })
})
