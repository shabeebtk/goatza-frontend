import { refreshApi, getUserApi } from "@/features/auth/services/auth.api"
import { useAuthStore } from "@/store/auth.store"

export const initAuth = async () => {
  const { setAuth, clearAuth, setLoading } = useAuthStore.getState()

  setLoading(true)

  try {
    const { access_token } = await refreshApi()

    // ✅ set token first
    setAuth({ token: access_token })

    // ✅ then get user
    const user = await getUserApi()

    setAuth({
      token: access_token,
      user,
    })
  } catch {
    clearAuth()
  }

  setLoading(false)
}