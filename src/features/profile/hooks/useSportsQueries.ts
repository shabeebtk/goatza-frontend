import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  getSportsListApi,
  getUserSportsApi,
  getUserSportsByUsernameApi,
  addUserSportApi,
  updateUserSportApi,
  deleteUserSportApi,
  type AddUserSportPayload,
  type UpdateUserSportPayload,
  type UserSport,
} from "../services/sports.api"

// ── Query keys ────────────────────────────────────────────────

export const sportsKeys = {
  masterList:   ()           => ["sports", "masterList"]       as const,
  userSports:   ()           => ["sports", "me"]               as const,
  userSportsByUsername: (u: string) => ["sports", "user", u]  as const,
}

// ── Master sports list (for the add/edit modal) ───────────────

export const useSportsList = () =>
  useQuery({
    queryKey: sportsKeys.masterList(),
    queryFn:  getSportsListApi,
    staleTime: 1000 * 60 * 30,   // sports rarely change
  })

// ── Own user sports ───────────────────────────────────────────

export const useMyUserSports = () =>
  useQuery({
    queryKey: sportsKeys.userSports(),
    queryFn:  getUserSportsApi,
    staleTime: 1000 * 60 * 5,
  })

// ── Another user's sports (view-only) ────────────────────────

export const useUserSportsByUsername = (username: string, enabled = true) =>
  useQuery({
    queryKey: sportsKeys.userSportsByUsername(username),
    queryFn:  () => getUserSportsByUsernameApi(username),
    enabled:  !!username && enabled,
    staleTime: 1000 * 60 * 2,
  })

// ── Add ───────────────────────────────────────────────────────

export const useAddUserSport = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: AddUserSportPayload) => addUserSportApi(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: sportsKeys.userSports() })
    },
  })
}

// ── Update ────────────────────────────────────────────────────

export const useUpdateUserSport = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: UpdateUserSportPayload) => updateUserSportApi(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: sportsKeys.userSports() })
    },
  })
}

// ── Delete (optimistic) ───────────────────────────────────────

export const useDeleteUserSport = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (sportsId: string) => deleteUserSportApi(sportsId),
    onMutate: async (sportsId) => {
      await qc.cancelQueries({ queryKey: sportsKeys.userSports() })
      const prev = qc.getQueryData<UserSport[]>(sportsKeys.userSports())
      qc.setQueryData<UserSport[]>(
        sportsKeys.userSports(),
        (old) => old?.filter((s) => s.id !== sportsId) ?? []
      )
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(sportsKeys.userSports(), ctx.prev)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: sportsKeys.userSports() })
    },
  })
}