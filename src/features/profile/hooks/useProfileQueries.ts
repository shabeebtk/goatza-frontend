import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  getMyProfileApi,
  getUserProfileApi,
  updateProfileApi,
  updatePhotoApi,
  followUserApi,
  unfollowUserApi,
  type UpdateProfilePayload,
  type UpdatePhotoPayload,
  type UserProfile,
} from "../services/profile.api"

// ── Query keys ───────────────────────────────────────────────

export const profileKeys = {
  me:   ()           => ["profile", "me"]       as const,
  user: (u: string)  => ["profile", "user", u]  as const,
}

// ── My profile ───────────────────────────────────────────────

export const useMyProfile = () =>
  useQuery({
    queryKey: profileKeys.me(),
    queryFn:  getMyProfileApi,
    staleTime: 1000 * 60 * 5,
  })

// ── Any user's profile ───────────────────────────────────────

export const useUserProfile = (username: string) =>
  useQuery({
    queryKey: profileKeys.user(username),
    queryFn:  () => getUserProfileApi(username),
    enabled:  !!username,
    staleTime: 1000 * 60 * 2,
  })

// ── Update profile text ──────────────────────────────────────

export const useUpdateProfile = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: UpdateProfilePayload) => updateProfileApi(data),
    onSuccess: (updated) => {
      qc.setQueryData<UserProfile>(profileKeys.me(), updated)
    },
  })
}

// ── Upload photo ─────────────────────────────────────────────

export const useUpdatePhoto = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: UpdatePhotoPayload) => updatePhotoApi(data),
    onSuccess: (updated) => {
      qc.setQueryData<UserProfile>(profileKeys.me(), updated)
    },
  })
}

// ── Follow / Unfollow ────────────────────────────────────────
// Optimistic update: flip relationship.is_following instantly,
// then revert on error so the UI never shows a stale state.

export const useFollowUser = (username: string) => {
  const qc = useQueryClient()
  const key = profileKeys.user(username)

  const follow = useMutation({
    mutationFn: (targetId: string) =>
      followUserApi({ target_type: "user", target_id: targetId }),

    onMutate: async () => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<UserProfile>(key)
      // Optimistically set is_following = true + bump followers_count
      qc.setQueryData<UserProfile>(key, (old) =>
        old
          ? {
              ...old,
              followers_count: String(Number(old.followers_count) + 1),
              relationship: old.relationship
                ? { ...old.relationship, is_following: true }
                : undefined,
            }
          : old
      )
      return { prev }
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: key })
    },
  })

  const unfollow = useMutation({
    mutationFn: (targetId: string) =>
      unfollowUserApi({ target_type: "user", target_id: targetId }),

    onMutate: async () => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<UserProfile>(key)
      // Optimistically set is_following = false + decrement followers_count
      qc.setQueryData<UserProfile>(key, (old) =>
        old
          ? {
              ...old,
              followers_count: String(Math.max(0, Number(old.followers_count) - 1)),
              relationship: old.relationship
                ? { ...old.relationship, is_following: false }
                : undefined,
            }
          : old
      )
      return { prev }
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: key })
    },
  })

  return { follow, unfollow }
}