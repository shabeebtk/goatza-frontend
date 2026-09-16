// @vitest-environment jsdom

/**
 * MediaLightbox — the parts that are easy to break and invisible when they are.
 *
 * Mirrors ImageLightbox.test.tsx where the two still agree (scroll lock, focus
 * contract, Esc and the ✕) so a fix applied to one and not the other shows up
 * here. Where they part ways is asserted too: this viewer never closes on a
 * tap on the media, it pages, it counts, and its video is the app's own
 * player bound to the global sound store rather than the browser's controls.
 */

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

import MediaLightbox, { type MediaLightboxItem } from "./MediaLightbox"

// Iconify fetches unknown icon names over the network and renders a
// placeholder meanwhile. Stubbed so these tests neither touch the network nor
// depend on what the real component renders before it resolves.
vi.mock("@iconify/react", () => ({
    Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}))

// The history entry comes from useBackToClose, which needs the app router
// for navigateAway; nothing here navigates.
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn() }),
}))

afterEach(cleanup)

const PHOTO: MediaLightboxItem = {
    id: "m1",
    media_type: "image",
    file_url: "https://media.goatza.test/rec/photo-1.webp",
}
const PHOTO_2: MediaLightboxItem = {
    id: "m2",
    media_type: "image",
    file_url: "https://media.goatza.test/rec/photo-2.webp",
}
const CLIP: MediaLightboxItem = {
    id: "m3",
    media_type: "video",
    file_url: "https://media.goatza.test/rec/clip.mp4",
    thumbnail_url: "https://media.goatza.test/rec/clip.jpg",
    duration: 42,
}

describe("MediaLightbox", () => {
    it("is a modal dialog showing the item at startIndex", () => {
        render(
            <MediaLightbox
                media={[PHOTO, PHOTO_2]}
                startIndex={1}
                onClose={() => {}}
            />
        )

        const dialog = screen.getByRole("dialog")
        expect(dialog.getAttribute("aria-modal")).toBe("true")

        const img = document.querySelector("img") as HTMLImageElement
        expect(img.src).toBe(PHOTO_2.file_url)
        expect(screen.getByText("2/2")).toBeTruthy()
    })

    // A run of one has nothing to page through, so it must not claim otherwise.
    it("renders no counter or nav for a single item", () => {
        render(<MediaLightbox media={[PHOTO]} onClose={() => {}} />)

        expect(screen.queryByText("1/1")).toBeNull()
        expect(screen.queryByRole("button", { name: "Next" })).toBeNull()
        expect(screen.queryByRole("button", { name: "Previous" })).toBeNull()
    })

    it("pages with the nav buttons and the arrow keys", () => {
        render(<MediaLightbox media={[PHOTO, PHOTO_2, CLIP]} onClose={() => {}} />)

        fireEvent.click(screen.getByRole("button", { name: "Next" }))
        expect(screen.getByText("2/3")).toBeTruthy()

        fireEvent.keyDown(document, { key: "ArrowRight" })
        expect(screen.getByText("3/3")).toBeTruthy()

        fireEvent.keyDown(document, { key: "ArrowLeft" })
        expect(screen.getByText("2/3")).toBeTruthy()
    })

    it("clamps a startIndex past the end", () => {
        render(<MediaLightbox media={[PHOTO, PHOTO_2]} startIndex={9} onClose={() => {}} />)

        expect(screen.getByText("2/2")).toBeTruthy()
    })

    // Every close is awaited because they all route through history.back(), and
    // popstate is asynchronous. That indirection is the point: the button, Esc
    // and the phone's back gesture are all the SAME path, so the hardware
    // gesture cannot close the viewer by a route the others skip.
    it("closes on Escape", async () => {
        const onClose = vi.fn()
        render(<MediaLightbox media={[PHOTO]} onClose={onClose} />)

        fireEvent.keyDown(document, { key: "Escape" })

        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    })

    // Like the post viewer: a tap on the photo is a zoom or a play/pause,
    // never a dismissal. The ways out are the ✕, Esc and the back gesture.
    it("does NOT close on a tap on the media or the backdrop", async () => {
        const onClose = vi.fn()
        render(<MediaLightbox media={[PHOTO]} onClose={onClose} />)

        fireEvent.click(screen.getByRole("dialog"))
        fireEvent.click(document.querySelector("img") as HTMLImageElement)

        // Let any history.back() that a regression fired come through.
        await new Promise((r) => setTimeout(r, 20))
        expect(onClose).not.toHaveBeenCalled()
    })

    it("closes exactly once from the close button", async () => {
        const onClose = vi.fn()
        render(<MediaLightbox media={[PHOTO]} onClose={onClose} />)

        fireEvent.click(screen.getByRole("button", { name: "Close" }))

        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    // The mobile back gesture is why the viewer reserves a history entry at all.
    it("closes when the browser goes back", async () => {
        const onClose = vi.fn()
        render(<MediaLightbox media={[PHOTO]} onClose={onClose} />)

        window.history.back()

        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    })

    it("locks body scroll while open and restores what it found", () => {
        // Not the empty string: an overlay opened from inside something that
        // already locked the page must not unlock it on the way out.
        document.body.style.overflow = "scroll"

        const { unmount } = render(<MediaLightbox media={[PHOTO]} onClose={() => {}} />)
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

        const { unmount } = render(<MediaLightbox media={[PHOTO]} onClose={() => {}} />)
        expect(document.activeElement).toBe(screen.getByRole("dialog"))

        unmount()
        expect(document.activeElement).toBe(trigger)

        trigger.remove()
    })

    describe("video", () => {
        // The app's own chrome, not the browser's: the element carries a BARE
        // `muted` attribute so the first paint is always muted (useVideoSound
        // sets the property from the global store after mount), and the mute
        // control is the top bar's button, wired to that same store.
        it("plays with the app's chrome, bound to the global sound store", () => {
            render(<MediaLightbox media={[CLIP]} onClose={() => {}} />)

            const el = document.querySelector("video") as HTMLVideoElement
            expect(el.controls).toBe(false)
            expect(el.hasAttribute("muted")).toBe(true)
            expect(el.getAttribute("src")).toBe(CLIP.file_url)
            expect(el.getAttribute("poster")).toBe(CLIP.thumbnail_url)
            // The store starts muted, so the top bar offers to unmute.
            expect(screen.getByRole("button", { name: "Unmute video" })).toBeTruthy()
        })

        // Photos have no sound to control, so the bar must not offer one.
        it("shows no mute button for a photo", () => {
            render(<MediaLightbox media={[PHOTO]} onClose={() => {}} />)

            expect(screen.queryByRole("button", { name: /mute video/i })).toBeNull()
        })

        // Closing unmounts the element, which is what stops the audio. Asserting
        // pause() lands proves the element is actually going away rather than
        // being left playing behind a hidden portal.
        it("pauses when the viewer closes", () => {
            const pause = vi.spyOn(HTMLMediaElement.prototype, "pause")
            // jsdom has no media stack; play() rejects loudly without this.
            vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(
                () => Promise.resolve()
            )

            const { unmount } = render(<MediaLightbox media={[CLIP]} onClose={() => {}} />)
            const el = document.querySelector("video") as HTMLVideoElement
            expect(el).toBeTruthy()

            unmount()

            expect(document.querySelector("video")).toBeNull()
            expect(pause).toHaveBeenCalled()
            vi.restoreAllMocks()
        })

        // A tap on the clip is play/pause, never a dismissal.
        it("toggles playback, not the viewer, when the video is tapped", () => {
            const onClose = vi.fn()
            const pause = vi.spyOn(HTMLMediaElement.prototype, "pause")
            const play = vi
                .spyOn(HTMLMediaElement.prototype, "play")
                .mockImplementation(() => Promise.resolve())
            render(<MediaLightbox media={[CLIP]} onClose={onClose} />)

            // jsdom never autoplays, so the element reads as paused: the tap
            // is a play.
            fireEvent.click(document.querySelector("video") as HTMLVideoElement)

            expect(play).toHaveBeenCalled()
            expect(onClose).not.toHaveBeenCalled()
            pause.mockRestore()
            play.mockRestore()
        })
    })
})
