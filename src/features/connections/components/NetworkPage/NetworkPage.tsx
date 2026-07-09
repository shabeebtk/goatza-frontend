"use client"

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Icon } from "@iconify/react"
import { useNavigation } from "@/shared/services/navigation.service"
import { useUserProfile } from "@/features/profile/hooks/useProfileQueries"
import { useOrgDetail } from "@/features/organization/hooks/useOrganizations"
import { networkKeys, useNetworkList } from "../../hooks/useNetworkList"
import type { NetworkListType } from "../../services/connections.api"
import NetworkRow from "../NetworkRow/NetworkRow"
import styles from "./NetworkPage.module.css"

// ── Tab config ───────────────────────────────────────────────

type TabDef = {
  key: NetworkListType
  label: string
  emptyTitle: string
  emptyBody: string
  emptyIcon: string
}

const TAB_DEFS: Record<NetworkListType, TabDef> = {
  followers: {
    key: "followers",
    label: "Followers",
    emptyTitle: "No followers yet",
    emptyBody: "When people follow this profile, they'll show up here.",
    emptyIcon: "mdi:account-multiple-outline",
  },
  following: {
    key: "following",
    label: "Following",
    emptyTitle: "Not following anyone yet",
    emptyBody: "Profiles this account follows will appear here.",
    emptyIcon: "mdi:account-heart-outline",
  },
  connections: {
    key: "connections",
    label: "Connections",
    emptyTitle: "No connections yet",
    emptyBody: "Mutual follows become connections and show up here.",
    emptyIcon: "mdi:account-network-outline",
  },
}

const USER_TABS: NetworkListType[] = ["followers", "following", "connections"]
const ORG_TABS: NetworkListType[] = ["followers", "following"]

const SKELETON_COUNT = 8

// ── Props ────────────────────────────────────────────────────

interface NetworkPageProps {
  /** Whose lists to show. */
  username: string
  /** The kind of profile — controls whether the Connections tab exists. */
  profileType: "user" | "organization"
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

// ── Inner (reads search params — needs a Suspense boundary) ──

function NetworkPageInner({ username, profileType }: NetworkPageProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { toProfile } = useNavigation()

  const tabKeys = profileType === "user" ? USER_TABS : ORG_TABS

  // ── Active tab (URL-synced, defaults to followers) ──────────
  const rawTab = searchParams.get("tab") as NetworkListType | null
  const tab: NetworkListType =
    rawTab && tabKeys.includes(rawTab) ? rawTab : "followers"

  // ── Search ──────────────────────────────────────────────────
  // URL (?q) is the source of truth the list reads from. The input holds a
  // local draft that the user edits; a debounce writes the draft to the URL
  // (an external system — no setState-in-effect). `userEdited` distinguishes
  // real typing from external URL changes (back/forward, tab reset) so the
  // debounce never fights navigation by re-pushing a stale value.
  const committedSearch = searchParams.get("q") ?? ""
  const [draft, setDraft] = useState(committedSearch)
  const userEdited = useRef(false)

  const replaceParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString())
      mutate(params)
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [router, pathname, searchParams]
  )

  // Any external change to ?q means the next draft/URL mismatch is not from
  // typing — clear the flag so the debounce below stays quiet.
  useEffect(() => {
    userEdited.current = false
  }, [committedSearch])

  // Debounced commit of the search box → ?q (only for user edits).
  useEffect(() => {
    if (!userEdited.current) return
    if (draft === committedSearch) return
    const timer = setTimeout(() => {
      replaceParams((p) => {
        if (draft) p.set("q", draft)
        else p.delete("q")
      })
    }, 400)
    return () => clearTimeout(timer)
  }, [draft, committedSearch, replaceParams])

  const onSearchChange = (value: string) => {
    userEdited.current = true
    setDraft(value)
  }

  const setTab = (next: NetworkListType) => {
    userEdited.current = false
    setDraft("")
    replaceParams((p) => {
      p.set("tab", next)
      p.delete("q") // search resets per tab
    })
  }

  // ── Keyboard tab navigation (arrow keys) ────────────────────
  const handleTabKeyDown = (e: React.KeyboardEvent) => {
    const idx = tabKeys.indexOf(tab)
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault()
      const dir = e.key === "ArrowRight" ? 1 : -1
      const nextIdx = (idx + dir + tabKeys.length) % tabKeys.length
      setTab(tabKeys[nextIdx])
    }
  }

  // ── Profile counts for the tab bar (reuses cached profile data) ──
  const userProfileQ = useUserProfile(profileType === "user" ? username : "")
  const orgQ = useOrgDetail(
    profileType === "organization" ? username : "",
    "username"
  )

  const profileCounts = useMemo<Partial<Record<NetworkListType, number>>>(() => {
    if (profileType === "user" && userProfileQ.data) {
      return {
        followers: Number(userProfileQ.data.followers_count) || 0,
        following: Number(userProfileQ.data.following_count) || 0,
        connections: Number(userProfileQ.data.connections_count) || 0,
      }
    }
    if (profileType === "organization" && orgQ.data) {
      return {
        followers: orgQ.data.followers_count ?? 0,
        following: orgQ.data.following_count ?? 0,
      }
    }
    return {}
  }, [profileType, userProfileQ.data, orgQ.data])

  // ── The list ────────────────────────────────────────────────
  const {
    data,
    isLoading,
    isError,
    refetch,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useNetworkList({ username, type: tab, search: committedSearch })

  const activeKey = networkKeys.list(username, tab, committedSearch)
  const rows = data?.pages.flatMap((p) => p.results) ?? []
  const totalCount = data?.pages[0]?.count ?? 0

  // Active tab shows the live count once loaded; others use profile counts.
  const tabCount = (key: NetworkListType): number | undefined => {
    if (key === tab && data) return totalCount
    return profileCounts[key]
  }

  // ── Infinite scroll ─────────────────────────────────────────
  const sentinelRef = useRef<HTMLDivElement>(null)
  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries
      if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage()
      }
    },
    [fetchNextPage, hasNextPage, isFetchingNextPage]
  )
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(handleObserver, {
      rootMargin: "300px",
      threshold: 0,
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [handleObserver])

  const def = TAB_DEFS[tab]
  const searching = committedSearch.trim().length > 0

  return (
    <div className={styles.page}>
      {/* ── Header ── */}
      <header className={styles.header}>
        <button
          type="button"
          className={styles.backBtn}
          onClick={() => router.back()}
          aria-label="Go back"
        >
          <Icon icon="mdi:arrow-left" width={22} height={22} />
        </button>
        <Link
          href={toProfile(username, profileType)}
          className={styles.headerTitle}
        >
          @{username}
        </Link>
        <span className={styles.headerSpacer} aria-hidden="true" />
      </header>

      {/* ── Tabs ── */}
      <div
        className={styles.tabs}
        role="tablist"
        aria-label={`${username} network`}
        onKeyDown={handleTabKeyDown}
      >
        {tabKeys.map((key) => {
          const active = key === tab
          const count = tabCount(key)
          return (
            <button
              key={key}
              type="button"
              role="tab"
              id={`network-tab-${key}`}
              aria-selected={active}
              aria-controls="network-panel"
              tabIndex={active ? 0 : -1}
              className={`${styles.tab} ${active ? styles.tabActive : ""}`}
              onClick={() => setTab(key)}
            >
              {count !== undefined && (
                <span className={styles.tabCount}>{formatCount(count)}</span>
              )}
              <span className={styles.tabLabel}>{TAB_DEFS[key].label}</span>
            </button>
          )
        })}
      </div>

      {/* ── Search ── */}
      <div className={styles.searchWrap}>
        <Icon
          icon="mdi:magnify"
          width={18}
          height={18}
          className={styles.searchIcon}
        />
        <input
          type="search"
          className={styles.searchInput}
          placeholder={`Search ${def.label.toLowerCase()}`}
          value={draft}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label={`Search ${def.label.toLowerCase()}`}
        />
        {draft && (
          <button
            type="button"
            className={styles.searchClear}
            onClick={() => onSearchChange("")}
            aria-label="Clear search"
          >
            <Icon icon="mdi:close" width={16} height={16} />
          </button>
        )}
      </div>

      {/* ── List panel ── */}
      <div
        role="tabpanel"
        id="network-panel"
        aria-labelledby={`network-tab-${tab}`}
        className={styles.panel}
      >
        {/* First load */}
        {isLoading && (
          <ul className={styles.list}>
            {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
              <li key={i} className={styles.skeletonRow} aria-hidden="true">
                <span className={styles.skelAvatar} />
                <span className={styles.skelText}>
                  <span className={styles.skelLine} />
                  <span className={styles.skelLineSm} />
                </span>
                <span className={styles.skelBtn} />
              </li>
            ))}
          </ul>
        )}

        {/* Error */}
        {!isLoading && isError && (
          <div className={styles.stateBox} role="alert">
            <Icon icon="mdi:alert-circle-outline" width={40} height={40} />
            <p className={styles.stateTitle}>Couldn&apos;t load this list</p>
            <p className={styles.stateBody}>Something went wrong. Please try again.</p>
            <button
              type="button"
              className={styles.retryBtn}
              onClick={() => refetch()}
            >
              <Icon icon="mdi:refresh" width={16} height={16} />
              Retry
            </button>
          </div>
        )}

        {/* Empty */}
        {!isLoading && !isError && rows.length === 0 && (
          <div className={styles.stateBox}>
            <div className={styles.stateIcon}>
              <Icon
                icon={searching ? "mdi:magnify-close" : def.emptyIcon}
                width={40}
                height={40}
              />
            </div>
            <p className={styles.stateTitle}>
              {searching
                ? `No results for “${committedSearch}”`
                : def.emptyTitle}
            </p>
            <p className={styles.stateBody}>
              {searching
                ? "Try a different name or username."
                : def.emptyBody}
            </p>
          </div>
        )}

        {/* Results */}
        {!isLoading && !isError && rows.length > 0 && (
          <ul className={styles.list}>
            {rows.map((row) => (
              <NetworkRow
                key={`${row.type}-${row.id}`}
                row={row}
                activeKey={activeKey}
              />
            ))}
          </ul>
        )}

        {/* Infinite-scroll sentinel + spinner */}
        <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />
        {isFetchingNextPage && (
          <div className={styles.loadingMore}>
            <span className={styles.spinner} aria-hidden="true" />
            <span>Loading more…</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Public component (owns the Suspense boundary for useSearchParams) ──

export default function NetworkPage(props: NetworkPageProps) {
  return (
    <Suspense
      fallback={
        <div className={styles.page}>
          <div className={styles.fallback} aria-hidden="true" />
        </div>
      }
    >
      <NetworkPageInner {...props} />
    </Suspense>
  )
}
