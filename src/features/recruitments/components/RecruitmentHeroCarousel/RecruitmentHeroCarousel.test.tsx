// @vitest-environment jsdom

/**
 * RecruitmentHeroCarousel — the parts that are easy to break and invisible
 * when they are.
 *
 * The 4:5 frame and the brand treatment are not tested: they're CSS, and a
 * screenshot is the only thing that would actually catch a regression there.
 * What's here is the chrome logic — which controls exist at which media count,
 * and what a tap opens — because "the single-media hero grew a progress bar"
 * is a bug nobody notices until a recruiter with one photo complains.
 */

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"

import RecruitmentHeroCarousel from "./RecruitmentHeroCarousel"
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

describe("RecruitmentHeroCarousel", () => {
    // The hard requirement: one photo must render as a plain image hero. Every
    // piece of paging chrome is asserted ABSENT individually, because "no
    // segments but still a counter" is the shape this regression takes.
    it("renders no paging chrome at all for a single media item", () => {
        render(<RecruitmentHeroCarousel media={[image(0)]} />)

        expect(screen.queryByRole("tablist")).toBeNull()
        expect(screen.queryByRole("tab")).toBeNull()
        expect(screen.queryByText("1 / 1")).toBeNull()
        // The stage itself is the only button — no click zones either.
        expect(screen.getAllByRole("button")).toHaveLength(1)
    })

    it("renders one segment per media item, with the first active", () => {
        render(<RecruitmentHeroCarousel media={[image(0), image(1), video(2, 30), image(3)]} />)

        const segments = screen.getAllByRole("tab")
        expect(segments).toHaveLength(4)
        expect(segments[0].getAttribute("aria-selected")).toBe("true")
        expect(segments[1].getAttribute("aria-selected")).toBe("false")
    })

    it("shows the counter for multiple media", () => {
        render(<RecruitmentHeroCarousel media={[image(0), image(1)]} />)

        expect(screen.getByText("1 / 2")).toBeTruthy()
    })

    // m:ss from the model's SECONDS — 125 is "2:05", never "2:5" or "125".
    it("shows a video slide's duration as m:ss", () => {
        render(<RecruitmentHeroCarousel media={[video(0, 125)]} />)

        expect(screen.getByText("2:05")).toBeTruthy()
    })

    it("renders no duration chip when the video has no duration", () => {
        const { container } = render(<RecruitmentHeroCarousel media={[video(0, null)]} />)

        // The play button is still there — it is only the chip that is absent.
        expect(container.querySelector('[data-icon="mdi:play"]')).toBeTruthy()
        expect(screen.queryByText("0:00")).toBeNull()
    })

    it("advances when a segment is selected", () => {
        render(<RecruitmentHeroCarousel media={[image(0), image(1), image(2)]} />)

        fireEvent.click(screen.getAllByRole("tab")[2])

        expect(screen.getByText("3 / 3")).toBeTruthy()
    })

    it("pages with the arrow keys", () => {
        render(<RecruitmentHeroCarousel media={[image(0), image(1)]} />)
        const stage = screen.getByRole("button", { name: /Media 1 of 2/ })

        fireEvent.keyDown(stage, { key: "ArrowRight" })
        expect(screen.getByText("2 / 2")).toBeTruthy()

        fireEvent.keyDown(stage, { key: "ArrowLeft" })
        expect(screen.getByText("1 / 2")).toBeTruthy()
    })

    it("hands the tapped index to onSlideActivate instead of opening its own viewer", () => {
        const onSlideActivate = vi.fn()
        render(
            <RecruitmentHeroCarousel
                media={[image(0), image(1), image(2)]}
                index={1}
                onIndexChange={() => {}}
                onSlideActivate={onSlideActivate}
            />
        )

        fireEvent.click(screen.getByRole("button", { name: /Media 2 of 3/ }))

        expect(onSlideActivate).toHaveBeenCalledWith(1)
        expect(screen.queryByRole("dialog")).toBeNull()
    })

    it("renders the overlay slot", () => {
        render(
            <RecruitmentHeroCarousel
                media={[image(0)]}
                overlay={<h2>Goalkeeper trials</h2>}
            />
        )

        expect(screen.getByText("Goalkeeper trials")).toBeTruthy()
    })

    // ── Fullscreen, from the self-contained carousel ───────────
    describe("fullscreen viewer", () => {
        it("opens at the tapped index", () => {
            render(<RecruitmentHeroCarousel media={[image(0), image(1), image(2)]} />)

            // Move to the third slide, then tap it.
            fireEvent.click(screen.getAllByRole("tab")[2])
            fireEvent.click(screen.getByRole("button", { name: /Media 3 of 3/ }))

            const dialog = screen.getByRole("dialog")
            expect(dialog.getAttribute("aria-modal")).toBe("true")
            // Scoped to the dialog: the stage behind it is still on slide 3 and
            // shows the same "3 / 3", so an unscoped query would pass even if
            // the viewer had opened at the wrong index.
            expect(within(dialog).getByText("3 / 3")).toBeTruthy()
            const img = dialog.querySelector("img") as HTMLImageElement
            expect(img.src).toBe(image(2).file_url)
        })

        it("opens at slide one when the first slide is tapped", () => {
            render(<RecruitmentHeroCarousel media={[image(0), image(1), image(2)]} />)

            fireEvent.click(screen.getByRole("button", { name: /Media 1 of 3/ }))

            const dialog = screen.getByRole("dialog")
            expect(within(dialog).getByText("1 / 3")).toBeTruthy()
        })

        // Async because the close routes through history.back() — see
        // MediaLightbox.test.tsx for why that indirection is deliberate.
        it("closes on Escape", async () => {
            render(<RecruitmentHeroCarousel media={[image(0)]} />)

            fireEvent.click(screen.getByRole("button", { name: "View media full screen" }))
            expect(screen.getByRole("dialog")).toBeTruthy()

            fireEvent.keyDown(document, { key: "Escape" })

            await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
        })
    })
})
