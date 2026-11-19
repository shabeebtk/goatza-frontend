"use client"

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useToast } from "@/shared/components/ui/Toast/Toast"
import { pageErrorSentence } from "../pageErrors"
import {
  addPlayerApi,
  createCoachApi,
  deleteCoachApi,
  getCoachesApi,
  getPlayersApi,
  removePlayerApi,
  reorderCoachesApi,
  reorderPlayersApi,
  updateCoachApi,
  updatePlayerApi,
} from "../services/orgPage.api"
import type { Coach, CoachCreatePayload, CoachUpdatePayload, PageCoaches, PagePlayers } from "../types"
import { pageKeys } from "./useOrgPage"
import { inOrder, useOptimisticReorder } from "./reorder"
import { invalidateShowcases } from "./usePageShowcase"

/** The most coaches a page holds (coach_limit). */
export const MAX_COACHES = 30
/** The most picked players (the server's cap). */
export const MAX_FEATURED_PLAYERS = 60

// ── Coaches ───────────────────────────────────────────────────

export const useCoaches = (orgId: string) =>
  useQuery({
    queryKey: pageKeys.coaches(orgId),
    queryFn: () => getCoachesApi(orgId),
    enabled: !!orgId,
  })

function useAfterCoachWrite(orgId: string) {
  const queryClient = useQueryClient()
  return (update?: (coaches: Coach[]) => Coach[]) => {
    if (update) {
      queryClient.setQueryData<PageCoaches>(pageKeys.coaches(orgId), (old) =>
        old ? { ...old, coaches: update(old.coaches) } : old
      )
    }
    // Candidates change with who is added, and the hub counts visible coaches.
    queryClient.invalidateQueries({ queryKey: pageKeys.coaches(orgId) })
    queryClient.invalidateQueries({ queryKey: pageKeys.admin(orgId) })
    invalidateShowcases(queryClient)
  }
}

export const useCreateCoach = (orgId: string) => {
  const after = useAfterCoachWrite(orgId)
  return useMutation({
    mutationFn: (payload: CoachCreatePayload) => createCoachApi(orgId, payload),
    onSuccess: (coach) => after((coaches) => [...coaches, coach]),
  })
}

/**
 * Any change to one coach. A visibility-only change is optimistic (it is a
 * switch); a refusal puts it back and toasts. Everything else waits for the answer.
 */
export const useUpdateCoach = (orgId: string) => {
  const queryClient = useQueryClient()
  const toast = useToast()
  const after = useAfterCoachWrite(orgId)

  return useMutation({
    mutationFn: ({ coachId, payload }: { coachId: string; payload: CoachUpdatePayload }) =>
      updateCoachApi(orgId, coachId, payload),
    onMutate: async ({ coachId, payload }) => {
      const keys = Object.keys(payload)
      if (keys.length !== 1 || keys[0] !== "is_visible") return { previous: undefined }
      const key = pageKeys.coaches(orgId)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<PageCoaches>(key)
      if (previous) {
        const visible = Boolean(payload.is_visible)
        queryClient.setQueryData<PageCoaches>(key, {
          ...previous,
          coaches: previous.coaches.map((coach) =>
            coach.id === coachId ? { ...coach, is_visible: visible, is_hidden: !visible } : coach
          ),
        })
      }
      return { previous }
    },
    onError: (err, _vars, context) => {
      if (!context?.previous) return
      queryClient.setQueryData(pageKeys.coaches(orgId), context.previous)
      toast.show({
        title: "Couldn't change that",
        message: pageErrorSentence(err),
        variant: "error",
        position: "top-center",
      })
    },
    onSuccess: (coach) =>
      after((coaches) => coaches.map((existing) => (existing.id === coach.id ? coach : existing))),
  })
}

export const useDeleteCoach = (orgId: string) => {
  const after = useAfterCoachWrite(orgId)
  return useMutation({
    mutationFn: (coachId: string) => deleteCoachApi(orgId, coachId),
    onSuccess: (_answer, coachId) => after((coaches) => coaches.filter((coach) => coach.id !== coachId)),
  })
}

export const useReorderCoaches = (orgId: string) => {
  const queryClient = useQueryClient()
  return useOptimisticReorder<PageCoaches, Coach[]>({
    queryKey: pageKeys.coaches(orgId),
    reorder: (data, ids) => ({ ...data, coaches: inOrder(data.coaches, ids) }),
    send: (ids) => reorderCoachesApi(orgId, ids),
    onAnswer: (coaches) =>
      queryClient.setQueryData<PageCoaches>(pageKeys.coaches(orgId), (old) =>
        old ? { ...old, coaches } : old
      ),
  })
}

// ── Players we developed ──────────────────────────────────────

/** `q` narrows the candidates; "" is the tab's own list. */
export const usePlayers = (orgId: string, q = "") =>
  useQuery({
    queryKey: pageKeys.playersList(orgId, q),
    queryFn: () => getPlayersApi(orgId, q),
    enabled: !!orgId,
    placeholderData: q.trim() ? keepPreviousData : undefined,
  })

/**
 * Every players write answers with the fresh lists: they replace the tab's own
 * cache, any search the add sheet made is marked stale, and the hub follows.
 */
function useStorePlayers(orgId: string) {
  const queryClient = useQueryClient()
  return (data: PagePlayers) => {
    queryClient.setQueryData(pageKeys.playersList(orgId, ""), data)
    queryClient.invalidateQueries({
      queryKey: pageKeys.players(orgId),
      predicate: (query) => query.queryKey[3] !== "",
    })
    queryClient.invalidateQueries({ queryKey: pageKeys.admin(orgId) })
    invalidateShowcases(queryClient)
  }
}

export const useAddPlayer = (orgId: string) => {
  const store = useStorePlayers(orgId)
  return useMutation({
    mutationFn: (payload: { user_id: string; highlight?: string }) => addPlayerApi(orgId, payload),
    onSuccess: store,
  })
}

export const useUpdatePlayer = (orgId: string) => {
  const store = useStorePlayers(orgId)
  return useMutation({
    mutationFn: ({ featuredId, highlight }: { featuredId: string; highlight: string }) =>
      updatePlayerApi(orgId, featuredId, { highlight }),
    onSuccess: store,
  })
}

export const useRemovePlayer = (orgId: string) => {
  const store = useStorePlayers(orgId)
  return useMutation({
    mutationFn: (featuredId: string) => removePlayerApi(orgId, featuredId),
    onSuccess: store,
  })
}

export const useReorderPlayers = (orgId: string) => {
  const store = useStorePlayers(orgId)
  return useOptimisticReorder<PagePlayers, PagePlayers>({
    queryKey: pageKeys.playersList(orgId, ""),
    reorder: (data, ids) => ({ ...data, players: inOrder(data.players, ids) }),
    send: (ids) => reorderPlayersApi(orgId, ids),
    onAnswer: store,
  })
}
