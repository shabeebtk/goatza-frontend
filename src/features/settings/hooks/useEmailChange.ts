import { useMutation, useQueryClient } from "@tanstack/react-query"

import { useAuthStore } from "@/store/auth.store"
import { profileKeys } from "@/features/profile/hooks/useProfileQueries"
import type { UserProfile } from "@/features/profile/services/profile.api"
import {
  confirmEmailChangeApi,
  initiateEmailChangeApi,
  type EmailChangeInitiatePayload,
} from "../services/emailChange.api"

/**
 * Step 1 — prove the password, have a code mailed to the new address.
 *
 * A plain mutation, unlike the deletion flow's initiate: this one fires from a
 * form submit rather than a mount effect, so there is no StrictMode observer
 * problem to work around.
 *
 * `retry: false` because the call MAILS SOMETHING and spends one of five
 * attempts an hour shared with confirm — a silent retry is a second email to
 * somebody's inbox and half the remaining budget.
 */
export const useInitiateEmailChange = () =>
  useMutation({
    mutationFn: (payload: EmailChangeInitiatePayload) =>
      initiateEmailChangeApi(payload),
    retry: false,
  })

/**
 * Step 2 — spend the code.
 *
 * The session is deliberately NOT rotated server-side (the owner just proved
 * themselves twice), so there is no new token to swap in. What IS stale is
 * every local copy of the user's email: the auth store's, which the header and
 * the settings screen read, and the cached profile. Both are patched in place
 * rather than refetched — the response already carries the only field that
 * changed.
 */
export const useConfirmEmailChange = () => {
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const updateUser = useAuthStore((s) => s.updateUser)

  return useMutation({
    mutationFn: (otp: string) => confirmEmailChangeApi(otp),
    retry: false,
    onSuccess: (data) => {
      if (user) updateUser({ ...user, email: data.email })

      queryClient.setQueryData<UserProfile>(profileKeys.me(), (previous) =>
        previous ? { ...previous, email: data.email } : previous
      )
    },
  })
}
