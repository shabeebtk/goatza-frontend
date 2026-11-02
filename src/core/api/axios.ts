import axios from "axios"
import { useAuthStore } from "@/store/auth.store"
import { getFreshAccessToken, SessionExpiredError } from "@/core/auth/refreshManager"
import { requireLegalConsent } from "@/features/legal/store/legalConsent.store"
import { lockGuardian } from "@/features/guardian/store/guardian.store"
import type { GuardianConsentStatus } from "@/features/guardian/types"

/** The backend's machine-readable marker (legal/permissions.py). */
const TERMS_REQUIRED_CODE = "TERMS_ACCEPTANCE_REQUIRED"

/** The other gate's marker (guardians/permissions.py). */
const GUARDIAN_REQUIRED_CODE = "GUARDIAN_CONSENT_REQUIRED"

/**
 * The account a request is made AS. Normally the active one, read when the
 * request is sent. Work that outlives the screen that started it — a post
 * uploading in the background, a chat photo still converting — captures it
 * when it starts and passes it on every request, so switching account
 * mid-upload cannot turn an org's post into the person's.
 */
export type RequestActor = {
  type: "user" | "organization"
  /** The org's id; absent for a person. */
  id?: string
}

declare module "axios" {
  interface AxiosRequestConfig {
    /**
     * Who this request is made as, instead of the store's active actor. Kept
     * on the config, so the 401 refresh-and-retry below sends it again.
     */
    actor?: RequestActor
  }
}

/** The active actor, frozen — for work that must keep using it. */
export function captureRequestActor(): RequestActor {
  const { actorType, actorId } = useAuthStore.getState()
  return actorType === "organization" && actorId
    ? { type: "organization", id: actorId }
    : { type: "user" }
}

/** `{ actor }` for a request config, or nothing — the store decides then. */
export const withActor = (actor?: RequestActor) => (actor ? { actor } : {})

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

  // Actor headers — the request's own actor when it carries one.
  const type = config.actor?.type ?? actorType
  const id = config.actor ? config.actor.id : actorId

  config.headers["X-Actor-Type"] = type

  if (type === "organization" && id) {
    config.headers["X-Actor-Id"] = id
  } else {
    // A retried config still has the first send's headers.
    config.headers.delete("X-Actor-Id")
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
        | {
            code?: string
            pending_documents?: string[]
            guardian_consent_status?: GuardianConsentStatus
          }
        | undefined

      if (body?.code === TERMS_REQUIRED_CODE) {
        requireLegalConsent(body.pending_documents ?? [])
      }

      /*
        THE GUARDIAN GATE, and the reason it has to be handled here.

        The server refuses EVERY request from a locked minor except a short
        exempt list (guardians/permissions.py) — reads included, because under
        the DPDP rules reading a child's feed is processing their data. So a
        client that does not recognise this code does not fail in one place: it
        fails everywhere at once, as a wall of generic "something went wrong"
        toasts, with no screen ever explaining why. That is exactly what
        onboarding looked like before this branch existed.

        Recording it here means any request can raise the parent screen, which
        is the safety net under the two paths that are supposed to catch it
        first (the OTP/role responses, and the guardian block on /user/details).

        The error is still rejected — the request genuinely failed and the
        caller's own handling should run.
      */
      if (body?.code === GUARDIAN_REQUIRED_CODE) {
        lockGuardian(body.guardian_consent_status ?? "pending")
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