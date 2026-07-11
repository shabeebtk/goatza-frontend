import { useCallback, useState } from "react"

/**
 * Recent-search history backed by localStorage.
 *
 * - key `goatza:recent-searches`, an array of strings, most-recent first
 * - max 10 entries, case-insensitive dedupe
 * - saved explicitly (Enter / tapping a result / a recent), never per keystroke
 * - every storage access is try/caught — private mode & quota errors are
 *   swallowed so the UI keeps working with an in-memory copy.
 */

const STORAGE_KEY = "goatza:recent-searches"
const MAX_RECENTS = 10

function readStorage(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .slice(0, MAX_RECENTS)
  } catch {
    return []
  }
}

function writeStorage(list: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    /* private mode / quota exceeded — ignore, keep the in-memory copy */
  }
}

export interface RecentSearches {
  recents: string[]
  save: (term: string) => void
  remove: (term: string) => void
  clear: () => void
}

export function useRecentSearches(): RecentSearches {
  // Lazy init from storage. This runs on the client only — the /search page
  // renders inside a Suspense boundary (useSearchParams), so there's no server
  // render to mismatch against. Guard `window` defensively regardless.
  const [recents, setRecents] = useState<string[]>(() =>
    typeof window === "undefined" ? [] : readStorage()
  )

  const save = useCallback((term: string) => {
    const trimmed = term.trim()
    if (!trimmed) return
    setRecents((prev) => {
      const deduped = prev.filter(
        (r) => r.toLowerCase() !== trimmed.toLowerCase()
      )
      const next = [trimmed, ...deduped].slice(0, MAX_RECENTS)
      writeStorage(next)
      return next
    })
  }, [])

  const remove = useCallback((term: string) => {
    setRecents((prev) => {
      const next = prev.filter(
        (r) => r.toLowerCase() !== term.toLowerCase()
      )
      writeStorage(next)
      return next
    })
  }, [])

  const clear = useCallback(() => {
    setRecents([])
    writeStorage([])
  }, [])

  return { recents, save, remove, clear }
}
