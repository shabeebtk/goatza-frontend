import axios from "axios"
import { useAuthStore } from "@/store/auth.store"

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

    // prevent infinite loop
    if (
      error.response?.status === 401 &&
      !originalRequest._retry
    ) {
      originalRequest._retry = true

      try {
        const res = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/user/token/refresh`,
          {},
          { withCredentials: true }
        )

        const newToken = res.data.data.access_token

        // update only token (user remains same)
        useAuthStore.getState().setAuth({
          token: newToken,
        })

        // retry original request
        originalRequest.headers.Authorization = `Bearer ${newToken}`

        return api(originalRequest)
      } catch (err) {
        // refresh failed → logout
        useAuthStore.getState().clearAuth()
      }
    }

    return Promise.reject(error)
  }
)

export default api