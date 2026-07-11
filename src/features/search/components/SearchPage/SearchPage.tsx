"use client"

import { useCallback, useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Icon } from "@iconify/react"
import SearchInput from "../SearchInput/SearchInput"
import RecentSearches from "../RecentSearches/RecentSearches"
import SearchPostsList from "../SearchPostsList/SearchPostsList"
import SearchPlayersRail from "./SearchPlayersRail"
import SearchOrgsRail from "./SearchOrgsRail"
import { useRecentSearches } from "../../hooks/useRecentSearches"
import {
  useSearchPlayers,
  useSearchOrgs,
  useSearchPosts,
  MIN_QUERY_LENGTH,
} from "../../hooks/useSearchQueries"
import styles from "./SearchPage.module.css"

const TEAMS_TYPES = "club,team"
const ACADEMY_TYPES = "academy"
const DEBOUNCE_MS = 350

/**
 * /search — one query fans out to Players / Teams & Clubs / Academies rails and
 * a vertical Posts feed (LinkedIn-style sectioned results). Empty input shows
 * recent searches.
 *
 * The URL `?q=` is the single source of truth for the *committed* (debounced)
 * query — it drives every section hook and is restored on back-navigation from
 * an explore listing. The controlled input is re-seeded from the URL during
 * render (the "adjust state on prop change" pattern) so we never setState in an
 * effect. One debounce owns all four hooks, so a keystroke never storms them.
 */
export default function SearchPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const spString = searchParams.toString()

  // URL is the source of truth for the committed query.
  const committedQ = searchParams.get("q") ?? ""

  const commitQ = useCallback(
    (value: string) => {
      const params = new URLSearchParams(spString)
      if (value.trim()) params.set("q", value)
      else params.delete("q")
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [router, pathname, spString]
  )

  // ── Controlled input ─────────────────────────────────────────
  const [input, setInput] = useState(committedQ)

  // Re-seed the box when the URL query changes from outside (back-nav, a recent
  // tap). Done during render, not in an effect. While typing, the debounce only
  // commits after a pause, so `committedQ` catches up to a value the box already
  // holds → this branch is a no-op then.
  const [seenCommitted, setSeenCommitted] = useState(committedQ)
  if (committedQ !== seenCommitted) {
    setSeenCommitted(committedQ)
    setInput(committedQ)
  }

  // Debounced commit → URL. Clearing the timer on each keystroke means only the
  // last pause fires, so the four hooks refetch once per settled query.
  useEffect(() => {
    const t = setTimeout(() => {
      if (input !== committedQ) commitQ(input)
    }, DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [input, committedQ, commitQ])

  // ── Recent searches ──────────────────────────────────────────
  const { recents, save, remove, clear } = useRecentSearches()

  // Enter — commit immediately (bypass the debounce) and save to recents.
  const submit = useCallback(() => {
    commitQ(input)
    const trimmed = input.trim()
    if (trimmed.length >= MIN_QUERY_LENGTH) save(trimmed)
  }, [commitQ, input, save])

  const clearInput = useCallback(() => {
    setInput("")
    commitQ("")
  }, [commitQ])

  // Tap a recent → fill the box, run now, and bump it to the top.
  const runRecent = useCallback(
    (term: string) => {
      setInput(term)
      commitQ(term)
      save(term)
    },
    [commitQ, save]
  )

  // ── Section data (committed query drives everything) ─────────
  const q = committedQ.trim()
  const active = q.length >= MIN_QUERY_LENGTH

  const players = useSearchPlayers(q)
  const teams = useSearchOrgs(q, TEAMS_TYPES)
  const academies = useSearchOrgs(q, ACADEMY_TYPES)
  const posts = useSearchPosts(q)

  const sections = [players, teams, academies, posts]
  const anyFetching = active && sections.some((s) => s.isFetching)

  // Page-level empty: only once every section has settled without error and
  // returned nothing. An errored section shows its own retry instead — one
  // failing section never blanks the others.
  const anyLoading = sections.some((s) => s.isLoading)
  const playersCount = players.data?.results.length ?? 0
  const teamsCount = teams.data?.results.length ?? 0
  const academiesCount = academies.data?.results.length ?? 0
  const postsCount =
    posts.data?.pages.reduce((n, p) => n + p.results.length, 0) ?? 0
  const allEmpty =
    active &&
    !anyLoading &&
    !players.isError &&
    !teams.isError &&
    !academies.isError &&
    !posts.isError &&
    playersCount + teamsCount + academiesCount + postsCount === 0

  const enc = encodeURIComponent(q)

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <button
          type="button"
          className={styles.back}
          onClick={() => router.back()}
          aria-label="Go back"
        >
          <Icon icon="mdi:arrow-left" width={22} height={22} />
        </button>

        <div className={styles.inputSlot}>
          <SearchInput
            value={input}
            onChange={setInput}
            onSubmit={submit}
            onClear={clearInput}
            isFetching={anyFetching}
          />
        </div>
      </header>

      {!active ? (
        <RecentSearches
          recents={recents}
          onPick={runRecent}
          onRemove={remove}
          onClear={clear}
        />
      ) : allEmpty ? (
        <div className={styles.emptyState} role="status">
          <Icon
            icon="mdi:magnify-close"
            width={52}
            height={52}
            className={styles.emptyIcon}
            aria-hidden="true"
          />
          <p className={styles.emptyTitle}>No results for “{q}”</p>
          <p className={styles.emptyBody}>
            Try checking your spelling or searching with fewer words.
          </p>
        </div>
      ) : (
        // Any tap inside the results (a card, a see-all, a post) counts as
        // engagement → save the query to recents.
        <div
          className={styles.sections}
          onClickCapture={() => save(q)}
          aria-busy={anyFetching ? true : undefined}
        >
          <SearchPlayersRail q={q} seeAllHref={`/explore/players?q=${enc}`} />
          <SearchOrgsRail
            q={q}
            types={TEAMS_TYPES}
            title="Teams & Clubs"
            seeAllHref={`/explore/organizations?q=${enc}`}
          />
          <SearchOrgsRail
            q={q}
            types={ACADEMY_TYPES}
            title="Academies"
            seeAllHref={`/explore/academies?q=${enc}`}
          />
          <SearchPostsList q={q} />
        </div>
      )}
    </div>
  )
}
