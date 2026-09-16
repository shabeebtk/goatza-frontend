/**
 * Focus return after an overlay closes — with a ring only for the keyboard.
 *
 * Every viewer and sheet hands focus back to the element that opened it, so a
 * keyboard user carries on exactly where they were. On a phone the same
 * `focus()` call is a bug: iOS Safari treats programmatic focus as
 * `:focus-visible`, so closing the post viewer with a tap or the back gesture
 * left a brand-green ring around the media tile until the reader tapped
 * something else. The ring is the keyboard's; the focus is everyone's.
 *
 * Two parts:
 *
 * - {@link lastInputWasKeyboard} — one document-level record of how the
 *   reader last interacted, started lazily on the client. A key marks
 *   keyboard; a pointer or touch marks pointer. Overlays read it when they
 *   close: Esc → keyboard, ✕ or the back gesture → the tap that came before.
 * - {@link returnFocus} — `focus({ preventScroll: true })`, and for a pointer
 *   reader a one-shot `data-focus-quiet` attribute that globals.css answers
 *   with `outline: none`. It comes off on the element's next blur or the next
 *   keydown anywhere, so a Tab that lands on it later shows the ring as
 *   normal.
 *
 * `preventScroll` is not optional: the page under a closing viewer has just
 * been landed on the post the reader got to, and a focus that scrolled would
 * drag it back to the one they opened.
 */

/** Attribute globals.css suppresses the outline for. */
export const FOCUS_QUIET_ATTR = "data-focus-quiet"

let tracking = false
let keyboard = false

function startTracking() {
    if (tracking || typeof document === "undefined") return
    tracking = true
    // Capture, so a handler that stops propagation (a carousel's swipe, a
    // dialog's own Escape) cannot hide the reader's modality from this.
    document.addEventListener("keydown", () => { keyboard = true }, true)
    document.addEventListener("pointerdown", () => { keyboard = false }, true)
    // Older WebKit without pointer events, and the odd synthetic touch.
    document.addEventListener("touchstart", () => { keyboard = false }, { capture: true, passive: true })
    document.addEventListener("mousedown", () => { keyboard = false }, true)
}

/**
 * True when the reader's last interaction was a key. Starts the tracker on
 * first call; before any interaction it is false — a page nobody has touched
 * yet is being tapped, not typed at.
 */
export function lastInputWasKeyboard(): boolean {
    startTracking()
    return keyboard
}

/**
 * Focus `el` without scrolling, and without a ring unless the reader is on
 * the keyboard. Safe to call with null; `focus()` throwing (an element that
 * cannot take focus) is swallowed — it is never worth failing a close over.
 */
export function returnFocus(el: HTMLElement | null | undefined): void {
    if (!el || !el.isConnected) return

    if (!lastInputWasKeyboard()) {
        el.setAttribute(FOCUS_QUIET_ATTR, "")
        const clear = () => {
            el.removeAttribute(FOCUS_QUIET_ATTR)
            el.removeEventListener("blur", clear)
            document.removeEventListener("keydown", clear, true)
        }
        el.addEventListener("blur", clear)
        document.addEventListener("keydown", clear, true)
    }

    try {
        el.focus({ preventScroll: true })
    } catch {
        /* nothing to return to — the close still happened */
    }
}
