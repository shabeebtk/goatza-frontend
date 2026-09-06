// @vitest-environment jsdom

/**
 * HeroThumbs — the strip's two jobs: disappear when there is nothing to choose,
 * and drive the carousel when there is.
 *
 * The active ring and the 4:5 thumb shape are not tested: they're CSS.
 */

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import HeroThumbs from "./HeroThumbs"
import type { RecruitmentMedia } from "../../services/recruitments.api"

// Iconify fetches unknown icon names over the network and renders a
// placeholder meanwhile. Stubbed so these tests neither touch the network nor
// depend on what the real component renders before it resolves.
vi.mock("@iconify/react", () => ({
    Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}))

afterEach(cleanup)

function image(n: number): RecruitmentMedia {
    return {
        id: `img-${n}`,
        media_type: "image",
        file_url: `https://media.goatza.test/rec/photo-${n}.webp`,
        public_id: `rec/photo-${n}`,
        thumbnail_url: "",
        duration: null,
        order: n,
    }
}

function video(n: number, duration: number | null): RecruitmentMedia {
    return {
        id: `vid-${n}`,
        media_type: "video",
        file_url: `https://media.goatza.test/rec/clip-${n}.mp4`,
        public_id: `rec/clip-${n}`,
        thumbnail_url: `https://media.goatza.test/rec/clip-${n}.jpg`,
        duration,
        order: n,
    }
}

describe("HeroThumbs", () => {
    // A single thumb under a single-media hero is a control with nothing to
    // choose — it must not render at all.
    it("renders nothing for one media item", () => {
        const { container } = render(
            <HeroThumbs media={[image(0)]} index={0} onSelect={() => {}} />
        )

        expect(container.firstChild).toBeNull()
    })

    it("renders nothing for empty media", () => {
        const { container } = render(
            <HeroThumbs media={[]} index={0} onSelect={() => {}} />
        )

        expect(container.firstChild).toBeNull()
    })

    it("renders one thumb per media item and marks the active one", () => {
        render(
            <HeroThumbs
                media={[image(0), image(1), image(2)]}
                index={1}
                onSelect={() => {}}
            />
        )

        const thumbs = screen.getAllByRole("button")
        expect(thumbs).toHaveLength(3)
        expect(thumbs[1].getAttribute("aria-current")).toBe("true")
        expect(thumbs[0].getAttribute("aria-current")).toBe("false")
    })

    it("selects an inactive thumb rather than opening it", () => {
        const onSelect = vi.fn()
        const onActivate = vi.fn()
        render(
            <HeroThumbs
                media={[image(0), image(1)]}
                index={0}
                onSelect={onSelect}
                onActivate={onActivate}
            />
        )

        fireEvent.click(screen.getByRole("button", { name: "Photo 2 of 2" }))

        expect(onSelect).toHaveBeenCalledWith(1)
        expect(onActivate).not.toHaveBeenCalled()
    })

    // Clicking the thumb that is already showing is the "show me this one
    // properly" gesture — selecting it again would do nothing visible.
    it("activates the already-active thumb", () => {
        const onSelect = vi.fn()
        const onActivate = vi.fn()
        render(
            <HeroThumbs
                media={[image(0), image(1)]}
                index={0}
                onSelect={onSelect}
                onActivate={onActivate}
            />
        )

        fireEvent.click(screen.getByRole("button", { name: "Photo 1 of 2" }))

        expect(onActivate).toHaveBeenCalledWith(0)
        expect(onSelect).not.toHaveBeenCalled()
    })

    it("overlays play and duration on a video thumb only", () => {
        const { container } = render(
            <HeroThumbs
                media={[image(0), video(1, 95)]}
                index={0}
                onSelect={() => {}}
            />
        )

        expect(container.querySelectorAll('[data-icon="mdi:play"]')).toHaveLength(1)
        expect(screen.getByText("1:35")).toBeTruthy()
        expect(screen.getByRole("button", { name: "Video 2 of 2" })).toBeTruthy()
    })
})
