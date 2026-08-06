"use client"

/**
 * Public-view context: the one switch that turns the normal profile into the
 * logged-out one.
 *
 * Why a context rather than prop-drilling `isPublicView` through six levels:
 * the profile is assembled from sections that each fetch their own data
 * (sports, highlights, career, achievements, posts) precisely so UserProfile
 * doesn't have to know about them. Threading a public flag and a slice of a
 * bundle down to each one by hand would undo that.
 *
 * Two things live here:
 *
 *   1. `sections` — the server-fetched bundle. A section that finds its slice
 *      here renders from it and DISABLES its own query. That matters: those
 *      endpoints are all IsAuthenticated, so an anonymous visitor firing them
 *      would produce five 401s per page load and five empty sections.
 *
 *   2. `openLoginWall(reason)` — every walled interaction calls this instead of
 *      doing the thing. One modal, one place, so a new walled affordance can't
 *      forget to carry the `next` path.
 *
 * Outside a provider both are absent, which is exactly the authenticated case:
 * `usePublicProfile()` returns null, every section runs its own query, and the
 * rendered result is byte-for-byte what it was before this feature existed.
 */

import { createContext, useContext, useMemo, useState, type ReactNode } from "react"

import LoginWall from "@/features/profile/components/LoginWall/LoginWall"
import type {
  PublicOrgBundle,
  PublicUserBundle,
} from "@/features/profile/services/publicProfile.api"

/** Pre-fetched section data, keyed the way the sections ask for it. */
export type PublicSections = {
  /** Raw rows, already in the shape each section's own API returns. */
  sports?: unknown[]
  highlights?: unknown[]
  career?: unknown[]
  achievements?: unknown[]
  posts?: unknown[]
  recruitments?: unknown[]
}

export type PublicProfileValue = {
  /** Display name of whoever's profile this is — used in the wall's copy. */
  displayName: string
  /** Canonical in-app path, e.g. "/profile/riya". Becomes `?next=`. */
  profilePath: string
  sections: PublicSections
  openLoginWall: (action?: string) => void
}

const PublicProfileContext = createContext<PublicProfileValue | null>(null)

/**
 * The public-view value, or null when the viewer is signed in.
 *
 * `null` is the signal to behave exactly as before — sections keep their own
 * queries, interactions do their real work.
 */
export function usePublicProfile(): PublicProfileValue | null {
  return useContext(PublicProfileContext)
}

/**
 * A section's pre-fetched rows, or null when it should fetch for itself.
 *
 * Typed at the call site because each section knows its own row shape and this
 * module deliberately doesn't import six of them.
 */
export function usePublicSection<T>(key: keyof PublicSections): T[] | null {
  const context = useContext(PublicProfileContext)
  const rows = context?.sections?.[key]
  return rows ? (rows as T[]) : null
}

// ── Provider ─────────────────────────────────────────────────

export function PublicProfileProvider({
  displayName,
  profilePath,
  sections,
  children,
}: {
  displayName: string
  profilePath: string
  sections: PublicSections
  children: ReactNode
}) {
  // What the visitor just tried to do ("follow", "message", …). Drives the
  // wall's subtitle; null means closed.
  const [wallAction, setWallAction] = useState<string | null>(null)

  const value = useMemo<PublicProfileValue>(
    () => ({
      displayName,
      profilePath,
      sections,
      openLoginWall: (action = "continue") => setWallAction(action),
    }),
    [displayName, profilePath, sections]
  )

  return (
    <PublicProfileContext.Provider value={value}>
      {children}
      {wallAction && (
        <LoginWall
          displayName={displayName}
          action={wallAction}
          nextPath={profilePath}
          onClose={() => setWallAction(null)}
        />
      )}
    </PublicProfileContext.Provider>
  )
}

// ── Bundle → sections ────────────────────────────────────────

export function sectionsFromUserBundle(
  bundle: PublicUserBundle
): PublicSections {
  return {
    sports: publicSportsAsUserSports(bundle),
    highlights: bundle.highlights,
    career: bundle.career,
    achievements: bundle.achievements,
    posts: bundle.posts.results,
  }
}

/**
 * Reshape the public payload's flat `sports` + `positions` into the nested
 * `UserSport` rows UserSportsSection renders.
 *
 * The public serializer sends them apart because they are apart in the schema
 * (UserSport and UserSportPosition are separate tables, and a position knows
 * which sport it belongs to). Joining here rather than server-side keeps the
 * public payload a flat mirror of the model — one less shape to keep in step —
 * and this is the only consumer that needs them nested.
 *
 * `attributes` is empty by design: per-sport attributes are detailed scouting
 * data and are not part of the public allow-list.
 */
function publicSportsAsUserSports(bundle: PublicUserBundle): unknown[] {
  const { sports, positions } = bundle.profile

  return sports.map((sport) => ({
    // No UserSport row id in the public payload — the section only uses it as a
    // React key and for owner-only edit/delete, which never run in public view.
    id: `public-sport-${sport.name}`,
    sport: {
      id: `public-sport-${sport.name}`,
      name: sport.name,
      icon_name: sport.icon_name,
      icon_url: sport.icon_url,
    },
    is_primary: sport.is_primary,
    experience_level: sport.experience_level,
    positions: positions
      .filter((p) => p.sport === sport.name)
      .map((p) => ({ position: p.name, is_primary: p.is_primary })),
    attributes: [],
  }))
}

export function sectionsFromOrgBundle(bundle: PublicOrgBundle): PublicSections {
  return {
    recruitments: bundle.recruitments,
    posts: bundle.posts.results,
  }
}
