// @vitest-environment jsdom

/**
 * ImageLightbox — the parts that are easy to break and invisible when they are.
 *
 * The image and the backdrop colour are not tested: they're CSS, and a
 * screenshot is the only thing that would actually catch a regression there.
 * What's here is the machinery a keyboard or screen-reader user depends on and
 * a mouse user never notices — scroll lock, focus, and the two ways out.
 */

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import ImageLightbox from "./ImageLightbox"

// Iconify fetches unknown icon names over the network and renders a
// placeholder meanwhile. Stubbed so these tests neither touch the network nor
// depend on what the real component renders before it resolves.
vi.mock("@iconify/react", () => ({
    Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}))

afterEach(cleanup)

const SRC = "https://res.cloudinary.com/demo/image/upload/v1/trophy.jpg"

describe("ImageLightbox", () => {
    it("is a modal dialog showing the image", () => {
        render(<ImageLightbox src={SRC} alt="Golden Boot" onClose={() => {}} />)

        const dialog = screen.getByRole("dialog")
        expect(dialog.getAttribute("aria-modal")).toBe("true")

        const img = screen.getByAltText("Golden Boot") as HTMLImageElement
        expect(img.src).toBe(SRC)
    })

    it("closes on Escape", () => {
        const onClose = vi.fn()
        render(<ImageLightbox src={SRC} alt="" onClose={onClose} />)

        fireEvent.keyDown(document, { key: "Escape" })

        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it("closes on a backdrop click", () => {
        const onClose = vi.fn()
        render(<ImageLightbox src={SRC} alt="" onClose={onClose} />)

        fireEvent.click(screen.getByRole("dialog"))

        expect(onClose).toHaveBeenCalledTimes(1)
    })

    // The button stops propagation, so a bug there shows up as TWO calls rather
    // than none — which is why the count is asserted and not just the call.
    it("closes exactly once from the close button", () => {
        const onClose = vi.fn()
        render(<ImageLightbox src={SRC} alt="" onClose={onClose} />)

        fireEvent.click(screen.getByRole("button", { name: "Close" }))

        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it("locks body scroll while open and restores what it found", () => {
        // Not the empty string: an overlay opened from inside something that
        // already locked the page must not unlock it on the way out.
        document.body.style.overflow = "scroll"

        const { unmount } = render(
            <ImageLightbox src={SRC} alt="" onClose={() => {}} />
        )
        expect(document.body.style.overflow).toBe("hidden")

        unmount()
        expect(document.body.style.overflow).toBe("scroll")

        document.body.style.overflow = ""
    })

    it("takes focus on open and hands it back to the trigger on close", () => {
        const trigger = document.createElement("button")
        document.body.appendChild(trigger)
        trigger.focus()
        expect(document.activeElement).toBe(trigger)

        const { unmount } = render(
            <ImageLightbox src={SRC} alt="" onClose={() => {}} />
        )
        expect(document.activeElement).toBe(screen.getByRole("dialog"))

        unmount()
        expect(document.activeElement).toBe(trigger)

        trigger.remove()
    })
})
