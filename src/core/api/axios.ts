import axios from "axios"
import { useAuthStore } from "@/store/auth.store"
import { getFreshAccessToken, SessionExpiredError } from "@/core/auth/refreshManager"

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  withCredentials: true,
})

/* Attach access token */
api.interceptors.request.use((config) => {
  const { accessToken, actorType, actorId } = useAuthStore.getState()

  // Auth header
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }

  // Actor headers
  config.headers["X-Actor-Type"] = actorType

  if (actorType === "organization" && actorId) {
    config.headers["X-Actor-Id"] = actorId
  }

  return config
})


/*  Refresh on 401 */
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config

    const isRefreshCall = originalRequest?.url?.includes("/user/token/refresh")

    if (error.response?.status === 401 && !originalRequest._retry && !isRefreshCall) {
      originalRequest._retry = true
      try {
        const token = await getFreshAccessToken()
        originalRequest.headers.Authorization = `Bearer ${token}`
        return api(originalRequest)
      } catch (err) {
        // SessionExpiredError → store already cleared; AuthGuard redirects.
        // Retryable error → user stays logged in; surface the original 401
        // so React Query / the caller can retry the action.
        return Promise.reject(err instanceof SessionExpiredError ? error : error)
      }
    }

    return Promise.reject(error)
  }
)

export default api