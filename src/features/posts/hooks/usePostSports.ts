"use client"

/**
 * The sports the ACTING ACTOR can tag a post with, and which one is theirs
 * by default.
 *
 * Two sources, because the two actors keep their sports in different places
 * and there is no one endpoint that answers for both:
 *
 *   user          GET /sports/user/me/sport/list  (`UserSport`, is_primary)
 *   organization  the org detail payload's `sports` (`OrganizationSport`,
 *                 is_primary — the serializer already maps each row's `id`
 *                 to the SPORT's id, which is what `sport_id` wants)
 *
 * The user endpoint is keyed on `request.user`, NOT on the actor headers, so
 * an org actor asking it gets the sports of the PERSON behind the org —
 * football, because they play it, on a swimming academy's post. That is why
 * this hook exists rather than every composer calling `useMyPostSports`: the
 * question is "what can this ACTOR tag", and only one of the two sources
 * answers it for a given actor.
 *
 * Whichever branch is inactive is not fetched at all.
 */

import { useMemo } from "react"
import { useAuthStore } from "@/store/auth.store"
import { useOrgDetail } from "@/features/organization/hooks/useOrganizations"
import type { SelectOption } from "@/shared/components/ui/Select/Select"
import { useMyPostSports } from "./usePostMutations"

/** A sport the composer can offer. `id` is the SPORT id, never a join row. */
export type PostSportOption = {
    id: string
    name: string
    icon: string
}

/** Sports have an icon on file; this is only for a row that lost one. */
const FALLBACK_ICON = "mdi:trophy-outline"

export type PostSports = {
    sports: PostSportOption[]
    /**
     * The actor's primary sport, for a composer to preselect. Null when the
     * actor has none marked, has no sports at all, or is still loading —
     * all three mean the same thing to a caller: do not preselect anything.
     */
    primarySportId: string | null
    isLoading: boolean
}

export function usePostSports(): PostSports {
    const actorType = useAuthStore((s) => s.actorType)
    const actorId = useAuthStore((s) => s.actorId)

    const isOrg = actorType === "organization" && !!actorId

    const mine = useMyPostSports(!isOrg)
    // `useOrgDetail` is already cached wherever the org dashboard has been
    // open, so on the org side this is usually free.
    const org = useOrgDetail(actorId ?? "", "id", isOrg)

    return useMemo(() => {
        if (isOrg) {
            const rows = org.data?.sports ?? []
            return {
                sports: rows.map((s) => ({
                    id: s.id,
                    name: s.name,
                    icon: s.icon_name || FALLBACK_ICON,
                })),
                primarySportId: rows.find((s) => s.is_primary)?.id ?? null,
                isLoading: org.isLoading,
            }
        }

        const rows = mine.data ?? []
        return {
            sports: rows.map((ms) => ({
                id: ms.sport.id,
                name: ms.sport.name,
                icon: ms.sport.icon_name || FALLBACK_ICON,
            })),
            primarySportId: rows.find((ms) => ms.is_primary)?.sport.id ?? null,
            isLoading: mine.isLoading,
        }
    }, [isOrg, org.data, org.isLoading, mine.data, mine.isLoading])
}

export default usePostSports

// ── The picker's rows ─────────────────────────────────────────

/**
 * The "No sport" row's value. A SENTINEL, never a real one: the Select shows
 * its placeholder only when NOTHING matches, so an option whose value is ""
 * would win that match and the trigger would read "No sport" instead of the
 * "Sport" label the badge row wants. `chooseSport` maps it back to "".
 */
export const CLEAR_SPORT = "__none__"

/**
 * `current` is for the EDIT composer: a post can carry a sport the actor has
 * since dropped from their profile, and that sport has to stay selectable —
 * otherwise opening the editor and saving silently strips it.
 *
 * The clear row is offered only when there IS something to clear, so an
 * untouched picker is not one row longer than it needs to be.
 */
export function sportOptions(
    sports: PostSportOption[],
    value: string,
    current?: PostSportOption | null
): SelectOption[] {
    const options: SelectOption[] = sports.map((s) => ({
        value: s.id,
        label: s.name,
        icon: s.icon,
    }))

    if (current && !options.some((o) => o.value === current.id)) {
        options.unshift({
            value: current.id,
            label: current.name,
            icon: current.icon,
        })
    }

    if (value) {
        options.unshift({
            value: CLEAR_SPORT,
            label: "No sport",
            icon: "mdi:close",
        })
    }

    return options
}
