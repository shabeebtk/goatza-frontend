"use client"

import { useSyncExternalStore } from "react"

/**
 * False during the server render and the first client paint, true afterwards.
 *
 * WHAT IT REPLACES. Three components had their own copy of:
 *
 *   const [mounted, setMounted] = useState(false)
 *   useEffect(() => { setMounted(true) }, [])
 *
 * which is the standard way to delay a `createPortal` until `document` exists.
 * It works, but it renders, commits, sets state, and renders again — a
 * cascading render on every mount of the component — and React Compiler flags
 * it for exactly that reason.
 *
 * `useSyncExternalStore` answers the same question with no state and no second
 * render: the server snapshot is `false`, the client snapshot is `true`, and
 * React resolves the difference during hydration itself. Nothing subscribes,
 * because the value never changes after mount — hence the no-op `subscribe`.
 *
 * The behaviour at the call sites is identical: one render returning null, then
 * the real tree.
 */

/** Never fires. The value cannot change once the client is running. */
const subscribe = () => () => {}

const getSnapshot = () => true
const getServerSnapshot = () => false

export default function useIsMounted(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
