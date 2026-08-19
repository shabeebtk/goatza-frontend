/**
 * The live "N of GOAL spots" counter.
 *
 * A query rather than a one-shot effect so the number survives the intro →
 * form → success walk without refetching: React Query keeps it in cache while
 * the page swaps state, and the success screen reads the same entry.
 *
 * Never retried into a spinner. If the counter cannot load, the page still
 * renders the bar (unfilled) and the form still works — the count is social
 * proof, not a dependency of signing up.
 */

import { useQuery } from "@tanstack/react-query"

import { fetchWaitlistStats } from "../services/join.api"
import type { WaitlistStats } from "../types"
import { WAITLIST_GOAL_FALLBACK } from "../types"

export const joinKeys = {
  all: ["waitlist"] as const,
  stats: () => ["waitlist", "stats"] as const,
}

export function useWaitlistStats() {
  return useQuery<WaitlistStats>({
    queryKey: joinKeys.stats(),
    queryFn: fetchWaitlistStats,
    // The backend caches this for 60s; matching it here stops a state switch
    // from firing a request that can only return the same number.
    staleTime: 60_000,
    // One retry, not three. A visitor who arrived from an Instagram link is not
    // waiting through a backoff ladder to see a progress bar.
    retry: 1,
    refetchOnWindowFocus: false,
  })
}

/**
 * `stats` with the fallback already applied — what the bar actually renders.
 *
 * `goal` always holds a number so the track can be drawn on the first paint;
 * `count` stays null until it is known, which is what keeps the fill at zero
 * instead of animating down from a guess.
 */
export function useWaitlistProgress() {
  const { data, isPending, isError } = useWaitlistStats()

  const goal = data?.goal ?? WAITLIST_GOAL_FALLBACK
  const count = data?.count ?? null

  const percent =
    count === null || goal <= 0
      ? 0
      : Math.min(100, Math.max(0, (count / goal) * 100))

  return { count, goal, percent, isPending, isError }
}
