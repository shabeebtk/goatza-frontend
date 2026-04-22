import { refreshApi, getUserApi } from "@/features/auth/services/auth.api"
import { useAuthStore } from "@/store/auth.store"

export const initAuth = async () => {
  const {
    setLoading,
    setSession,
    clearAuth,
  } = useAuthStore.getState()

  setLoading(true)

  try {
    // refresh token cookie -> new access token
    const { access_token } = await refreshApi()

    // get user profile
    const user = await getUserApi()

    // set full session
    setSession({
      token: access_token,
      user,
    })
  } catch (error) {
    clearAuth()
  } finally {
    useAuthStore.getState().setLoading(false)
  }
}