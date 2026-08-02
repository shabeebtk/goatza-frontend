"use client"

/**
 * Portal — render children into <body>, outside the current tree.
 *
 * Needed by anything using `position: fixed` to cover the viewport. A fixed
 * element is positioned against the nearest ancestor with a `transform`,
 * `filter` or `will-change` rather than the viewport, and several page
 * wrappers here animate in with `animation: … both`, which leaves a transform
 * applied permanently. A modal rendered inside one of those lands at the top of
 * that wrapper and scrolls with the page instead of covering the screen — and
 * an ancestor with `overflow: hidden` clips it outright.
 *
 * Portalling to <body> makes the modal immune to whatever it was mounted from.
 */

import { createPortal } from "react-dom"

export default function Portal({ children }: { children: React.ReactNode }) {
    // These only ever mount from a click, so the document always exists by
    // then. The guard is for the server pass, where `document` does not.
    if (typeof document === "undefined") return null

    return createPortal(children, document.body)
}
