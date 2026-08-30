import { useQueryClient } from "@tanstack/react-query"

import type { PlaceBias } from "@/shared/services/places.service"
import { profileKeys } from "./useProfileQueries"
import type { UserProfile } from "../services/profile.api"

/**
 * The signed-in user's own coordinates, for biasing place search.
 *
 * Google takes a 50 km `locationBias` circle around a point and uses it to rank
 * — not to filter — so this only decides whether the Kannur five minutes away
 * comes before the Kannur nobody meant. Every picker treats it as optional.
 *
 * **Reads the cache; never fetches.** `getQueryData` rather than `useMyProfile`
 * is the whole point: a ranking hint must not cost a request, must not put a
 * modal into a loading state, and must not 401 on a page where the profile was
 * never loaded. When the profile is not in the cache the answer is simply null
 * and search runs unbiased.
 *
 * Consequently this is not reactive — it will not re-render when the profile
 * lands later. That is fine for a hint and wrong for anything else, so do not
 * reuse this to read profile data generally: use `useMyProfile`.
 */
export function useProfileBias(): PlaceBias | null {
    const queryClient = useQueryClient()

    const profile = queryClient.getQueryData<UserProfile>(profileKeys.me())

    const latitude = profile?.location?.latitude
    const longitude = profile?.location?.longitude

    if (latitude == null || longitude == null) return null

    return { latitude, longitude }
}
