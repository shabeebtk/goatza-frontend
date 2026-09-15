/**
 * keepFocusProps — spread onto a control that must NOT steal focus from a
 * text input when it is tapped.
 *
 * On iOS Safari, the first tap on anything while the keyboard is up blurs the
 * input, the keyboard slides away, the layout viewport grows back and the
 * fixed sheet moves — all before the click is dispatched, so the click lands
 * on whatever is under the finger by then: the next row down, or nothing
 * where the Send button used to be. Focus moves on `mousedown` (and the
 * `pointerdown` that precedes it); cancelling both keeps the input focused,
 * the keyboard still, and the sheet where it was. The `click` still fires.
 *
 * Blur on purpose afterwards where that is the right thing (after Send), and
 * when the reader starts scrolling the list — see `blurActiveInput`.
 */

import type { MouseEvent, PointerEvent } from "react"

const prevent = (e: PointerEvent | MouseEvent) => {
  e.preventDefault()
}

export const keepFocusProps = {
  onPointerDown: prevent,
  onMouseDown: prevent,
} as const

/** Close the keyboard: blur whatever text field has focus, if any. */
export function blurActiveInput() {
  const active = document.activeElement
  if (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement ||
    (active instanceof HTMLElement && active.isContentEditable)
  ) {
    active.blur()
  }
}
