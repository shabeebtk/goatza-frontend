/**
 * settleViewport — for an overlay with a text field that closes itself on
 * submit.
 *
 * Tapping Save or Post does not blur the field on iOS, so the overlay goes
 * away with the keyboard still up. iOS then leaves every `position: fixed`
 * element (the bottom dock, the toasts) offset until the next scroll: the
 * layout viewport it panned for the keyboard is not put back on its own.
 *
 * So: blur the field, wait for the visual viewport to grow back, and scroll
 * to where the page already is, which is what makes iOS re-anchor them.
 *
 * Fire and forget. The blur is synchronous, so the overlay can close in the
 * same tick (whatever is underneath covers the keyboard animating away); the
 * re-anchor happens by itself when it has finished.
 */

/** A keyboard takes about 300 ms to go; this is the most we wait for it. */
const SETTLE_MAX_MS = 400

/** How close the visual viewport has to be to the window to count as back. */
const SETTLE_TOLERANCE_PX = 2

/**
 * Put `position: fixed` back where it belongs, without moving the page.
 * Harmless when nothing is offset. A browser with no visualViewport has none
 * of this problem, and jsdom has neither.
 */
export function reanchorFixedElements(): void {
    if (typeof window === "undefined" || !window.visualViewport) return
    window.scrollTo(window.scrollX, window.scrollY)
}

export function settleViewport(): Promise<void> {
    if (typeof window === "undefined") return Promise.resolve()

    const active = document.activeElement
    if (active instanceof HTMLElement && active !== document.body) active.blur()

    const viewport = window.visualViewport
    if (!viewport) return Promise.resolve()

    const settled = () =>
        Math.abs(window.innerHeight - viewport.height) <= SETTLE_TOLERANCE_PX

    return new Promise((resolve) => {
        if (settled()) {
            reanchorFixedElements()
            resolve()
            return
        }

        const finish = () => {
            window.clearTimeout(timer)
            viewport.removeEventListener("resize", onResize)
            reanchorFixedElements()
            resolve()
        }
        const onResize = () => {
            if (settled()) finish()
        }
        const timer = window.setTimeout(finish, SETTLE_MAX_MS)
        viewport.addEventListener("resize", onResize)
    })
}
