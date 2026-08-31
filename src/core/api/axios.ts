import axios from "axios"
import { useAuthStore } from "@/store/auth.store"
import { getFreshAccessToken, SessionExpiredError } from "@/core/auth/refreshManager"
import { requireLegalConsent } from "@/features/legal/store/legalConsent.store"

/** The backend's machine-readable marker (legal/permissions.py). */
const TERMS_REQUIRED_CODE = "TERMS_ACCEPTANCE_REQUIRED"

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

    /*  Terms went stale under a live session.

        The gate only refuses WRITES, so a user can browse for as long as they
        like after a version bump and only meet this when they try to do
        something — which is exactly when telling them is useful. Raising the
        modal from here means every caller in the app gets the re-consent flow
        without any of them knowing this rule exists.

        The error is still rejected: the request genuinely failed, and the
        caller's own error handling should run. Once consent is recorded the
        user retries the action, deliberately — silently replaying a write
        somebody made before agreeing is not a retry, it is a decision made on
        their behalf. */
    if (error.response?.status === 403) {
      const body = error.response.data as
        | { code?: string; pending_documents?: string[] }
        | undefined

      if (body?.code === TERMS_REQUIRED_CODE) {
        requireLegalConsent(body.pending_documents ?? [])
      }
    }

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