"use client"

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query"

import { careerKeys } from "@/features/career/hooks/useCareerQueries"
import { useAuthStore } from "@/store/auth.store"
import { fetchSquadInvite } from "../services/publicSquadInvite.api"
import {
  acceptSquadInviteApi,
  declineSquadInviteApi,
  getMySquadsApi,
  getSquadInviteApi,
  joinSquadApi,
  leaveSquadApi,
  withdrawSquadRequestApi,
} from "../services/squadsPlayer.api"
import { squadKeys } from "./useSquads"

/**
 * The player's side. Under squadKeys.all() like the club's, so a write on either
 * side can refresh both; "player" keeps the two apart from any org id.
 */
export const mySquadKeys = {
  all: () => [...squadKeys.all(), "player"] as const,
  mine: (userId: string | undefined) => [...squadKeys.all(), "player", "mine", userId] as const,
  /** Signed in and anonymous are different answers (`me`), so both are in the key. */
  invite: (token: string, signedIn: boolean) =>
    [...squadKeys.all(), "player", "invite", token, signedIn ? "person" : "anonymous"] as const,
}

/**
 * After any answer: the person's squads, the invite page, their career (a squad
 * place is a verified stint), and the clubs' squad lists the counts sit on.
 */
export function invalidateAfterAnswer(queryClient: QueryClient, userId: string | undefined) {
  queryClient.invalidateQueries({ queryKey: squadKeys.all() })
  if (userId) queryClient.invalidateQueries({ queryKey: careerKeys.list(userId) })
}

// ── Reads ─────────────────────────────────────────────────────

/** This person's squads (active, invited, pending), whoever they are acting as. */
export const useMySquads = (enabled = true) => {
  const userId = useAuthStore((state) => state.user?.id)

  return useQuery({
    queryKey: mySquadKeys.mine(userId),
    queryFn: getMySquadsApi,
    enabled: enabled && !!userId,
    staleTime: 1000 * 60,
  })
}

/**
 * The invite link's page. Anonymous: a plain fetch with no session. Signed in:
 * the api AS THE PERSON, so `me` is about them even while they act as a club.
 * Null is the server's one 404 for every link that does not resolve.
 */
export const useSquadInvite = (token: string, signedIn: boolean, enabled = true) =>
  useQuery({
    queryKey: mySquadKeys.invite(token, signedIn),
    queryFn: async () => {
      if (!signedIn) return fetchSquadInvite(token)
      try {
        return await getSquadInviteApi(token)
      } catch (err) {
        if ((err as { response?: { status?: number } })?.response?.status === 404) return null
        throw err
      }
    },
    enabled: enabled && !!token,
    retry: false,
    staleTime: 0,
  })

// ── Writes ────────────────────────────────────────────────────

export const useJoinSquad = (token: string) => {
  const queryClient = useQueryClient()
  const userId = useAuthStore((state) => state.user?.id)

  return useMutation({
    mutationFn: () => joinSquadApi(token),
    onSuccess: () => invalidateAfterAnswer(queryClient, userId),
  })
}

function useAnswer(mutationFn: (memberId: string) => Promise<unknown>) {
  const queryClient = useQueryClient()
  const userId = useAuthStore((state) => state.user?.id)

  return useMutation({
    mutationFn,
    onSettled: () => invalidateAfterAnswer(queryClient, userId),
  })
}

export const useAcceptSquadInvite = () => useAnswer(acceptSquadInviteApi)
export const useDeclineSquadInvite = () => useAnswer(declineSquadInviteApi)
export const useWithdrawSquadRequest = () => useAnswer(withdrawSquadRequestApi)
export const useLeaveSquad = () => useAnswer(leaveSquadApi)
