import { useMutation } from "@tanstack/react-query"
import { changePasswordApi, type ChangePasswordPayload } from "../services/settings.api"
import { useAuthStore } from "@/store/auth.store"

/**
 * Changing the password rotates the whole session server-side: every other
 * device is blacklisted and this one gets a new refresh cookie + access token.
 * Swapping the token in immediately is what keeps this device signed in — the
 * old access token still works until it expires, but its refresh token is dead.
 */
export const useChangePassword = () => {
  const updateAccessToken = useAuthStore((s) => s.updateAccessToken)

  return useMutation({
    mutationFn: (data: ChangePasswordPayload) => changePasswordApi(data),
    onSuccess: (data) => {
      updateAccessToken(data.access_token)
    },
  })
}
