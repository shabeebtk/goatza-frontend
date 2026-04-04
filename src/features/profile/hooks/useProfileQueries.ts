import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import {
  getMyProfileApi,
  getUserProfileApi,
  updateProfileApi,
  updateProfileDataApi,
  checkUsernameApi,
  followUserApi,
  unfollowUserApi,
  type UpdateProfileLegacyPayload,
  type UpdateProfileDataPayload,
  type UserProfile,
} from "../services/profile.api"

// ── Query keys ───────────────────────────────────────────────

export const profileKeys = {
  me:   ()           => ["profile", "me"]       as const,
  user: (u: string)  => ["profile", "user", u]  as const,
}

// ── Queries ──────────────────────────────────────────────────

export const useMyProfile = () =>
  useQuery({
    queryKey: profileKeys.me(),
    queryFn:  getMyProfileApi,
    staleTime: 1000 * 60 * 5,
  })

export const useUserProfile = (username: string) =>
  useQuery({
    queryKey: profileKeys.user(username),
    queryFn:  () => getUserProfileApi(username),
    enabled:  !!username,
    staleTime: 1000 * 60 * 2,
  })

// ── Legacy text update ───────────────────────────────────────

export const useUpdateProfile = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: UpdateProfileLegacyPayload) => updateProfileApi(data),
    onSuccess:  (updated) => {
      qc.setQueryData<UserProfile>(profileKeys.me(), updated)
    },
  })
}

// ── Full profile data update (new) ───────────────────────────

export const useUpdateProfileData = (username: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: UpdateProfileDataPayload) => updateProfileDataApi(data),
    onSuccess: (updated) => {
      // Update both cache keys — username may have changed
      qc.setQueryData<UserProfile>(profileKeys.me(), updated)
      qc.setQueryData<UserProfile>(profileKeys.user(username), updated)
      // Also seed the new username key if it changed
      if (updated.username !== username) {
        qc.setQueryData<UserProfile>(profileKeys.user(updated.username), updated)
      }
    },
  })
}

// ── Username availability (debounced externally) ─────────────
// Returns a regular async function — call from form's onChange after debounce.
// We don't use useQuery here because it's imperative / on-demand.

export const useCheckUsername = () =>
  useMutation({
    mutationFn: checkUsernameApi,
  })

// ── Photo upload ─────────────────────────────────────────────
// (stays in usePhotoUpload.ts — no change needed)

// ── Follow / Unfollow ────────────────────────────────────────

export const useFollowUser = (username: string) => {
  const qc  = useQueryClient()
  const key = profileKeys.user(username)

  const follow = useMutation({
    mutationFn: (targetId: string) =>
      followUserApi({ target_type: "user", target_id: targetId }),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<UserProfile>(key)
      qc.setQueryData<UserProfile>(key, (old) =>
        old ? {
          ...old,
          followers_count: String(Number(old.followers_count) + 1),
          relationship: old.relationship
            ? { ...old.relationship, is_following: true }
            : undefined,
        } : old
      )
      return { prev }
    },
    onError:   (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(key, ctx.prev) },
    onSettled: ()             => { qc.invalidateQueries({ queryKey: key }) },
  })

  const unfollow = useMutation({
    mutationFn: (targetId: string) =>
      unfollowUserApi({ target_type: "user", target_id: targetId }),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<UserProfile>(key)
      qc.setQueryData<UserProfile>(key, (old) =>
        old ? {
          ...old,
          followers_count: String(Math.max(0, Number(old.followers_count) - 1)),
          relationship: old.relationship
            ? { ...old.relationship, is_following: false }
            : undefined,
        } : old
      )
      return { prev }
    },
    onError:   (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(key, ctx.prev) },
    onSettled: ()             => { qc.invalidateQueries({ queryKey: key }) },
  })

  return { follow, unfollow }
}