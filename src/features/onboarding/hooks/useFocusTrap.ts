import { useEffect, type RefObject } from "react"

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Traps Tab focus inside `containerRef` while `active`. On activation it moves
 * focus into the container and restores it to the previously focused element on
 * cleanup. Keeps keyboard users inside the onboarding modal (and its nested
 * warning dialog, which lives in the same container).
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean
) {
  useEffect(() => {
    if (!active) return
    const container = containerRef.current
    if (!container) return

    const previouslyFocused = document.activeElement as HTMLElement | null

    // Visible, and not a roving tabindex="-1" element (e.g. RoleSelect's unselected
    // cards or the hidden Back button on step 1) so first/last match real Tab order.
    const getFocusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) =>
          (el.offsetParent !== null || el === document.activeElement) &&
          el.getAttribute("tabindex") !== "-1"
      )

    const focusFirst = () => {
      const target = getFocusables()[0] ?? container
      target.focus()
    }
    // Defer so the initial content is mounted before we grab focus.
    const raf = requestAnimationFrame(focusFirst)

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return

      const focusables = getFocusables()

      if (focusables.length === 0) {
        e.preventDefault()
        return
      }

      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const activeEl = document.activeElement as HTMLElement | null

      if (e.shiftKey) {
        if (activeEl === first || !container.contains(activeEl)) {
          e.preventDefault()
          last.focus()
        }
      } else if (activeEl === last || !container.contains(activeEl)) {
        e.preventDefault()
        first.focus()
      }
    }

    container.addEventListener("keydown", handleKeyDown)

    return () => {
      cancelAnimationFrame(raf)
      container.removeEventListener("keydown", handleKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [active, containerRef])
}
