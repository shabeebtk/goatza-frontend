import { isAxiosError } from "axios"

import api from "@/core/api/axios"
import { getApiErrorMessage } from "@/core/api/getApiErrorMessage"

/**
 * Changing the sign-in email — the two calls behind /settings/email.
 *
 * Kept out of settings.api.ts for the same reason accountDeletion.api.ts is:
 * this is its own contract (two endpoints, one shared throttle budget, and a
 * refusal the UI has to route somewhere else entirely), and the backend
 * separates it the same way (accounts/services/email_change_service.py).
 *
 * The confirm call deliberately does NOT send the address. The server holds
 * the pending one; sending it again would make the binding a client input.
 */

// ── Types ────────────────────────────────────────────────────

export type EmailChangeInitiatePayload = {
  new_email: string
  password: string
}

export type EmailChangeInitiateResponse = {
  /** Masked server-side — "n*****w@gmail.com". */
  sent_to: string
  /** Lifetime of the code AND of the pending binding, in seconds. */
  expires_in: number
}

export type EmailChangeConfirmResponse = {
  /** The address now on the account — the store's copy is stale without it. */
  email: string
  detail: string
}

/**
 * Stable codes the endpoints return under `data.code`. `password_not_set` is
 * the one that is not a form error: it means this account signed up with
 * Google and has to visit forgot-password before it can do this at all.
 */
export type EmailChangeErrorCode =
  | "password_not_set"
  | "invalid_password"
  | "invalid_email"
  | "same_email"
  | "email_taken"
  | "invalid_code"

// ── OTP shape ────────────────────────────────────────────────

/**
 * Matches the OTP inputs everywhere else (AuthCard, ForgotPasswordCard,
 * DeleteAccountModal) so a code field validates the same wherever it appears.
 * The backend mails a 4-digit code today (utils/otp_validation.py); the upper
 * bound is slack, not a second source of truth.
 */
export const OTP_MIN_LENGTH = 4
export const OTP_MAX_LENGTH = 8

// ── API calls ────────────────────────────────────────────────

/**
 * Prove the password, then have a code mailed to the new address.
 *
 * Costs one of the five attempts an hour that BOTH email-change endpoints
 * share (accounts/throttles.py::EmailChangeThrottle) — which is why resending
 * is behind a cooldown rather than a bare button.
 */
export const initiateEmailChangeApi = async (
  payload: EmailChangeInitiatePayload
): Promise<EmailChangeInitiateResponse> => {
  const res = await api.post("/user/email/change/initiate", payload)
  return res.data.data
}

/** Spend the code. The address comes from the server's pending binding. */
export const confirmEmailChangeApi = async (
  otp: string
): Promise<EmailChangeConfirmResponse> => {
  const res = await api.post("/user/email/change/confirm", { otp })
  return res.data.data
}

// ── Failures ─────────────────────────────────────────────────

export type EmailChangeFailure =
  /** 5/hour, shared by both endpoints. Nothing to do but wait. */
  | { kind: "throttled"; message: string }
  /** A recognised refusal — the caller decides which field it belongs on. */
  | { kind: "code"; code: EmailChangeErrorCode; message: string }
  /** Everything else (offline, 5xx), with whatever the backend said. */
  | { kind: "message"; message: string }

/** Shown for both endpoints' 429 — the wait is an hour, not a retry. */
export const THROTTLED_MESSAGE =
  "Too many attempts. Please try again in an hour."

const KNOWN_CODES: readonly EmailChangeErrorCode[] = [
  "password_not_set",
  "invalid_password",
  "invalid_email",
  "same_email",
  "email_taken",
  "invalid_code",
]

function readCode(err: unknown): EmailChangeErrorCode | null {
  const code = (
    err as { response?: { data?: { data?: { code?: string } } } }
  )?.response?.data?.data?.code

  return KNOWN_CODES.includes(code as EmailChangeErrorCode)
    ? (code as EmailChangeErrorCode)
    : null
}

/**
 * Classify a thrown error from either endpoint.
 *
 * Codes rather than message matching (which is what the deletion flow has to
 * do): these endpoints return one, so the copy stays free to change.
 */
export function readEmailChangeError(err: unknown): EmailChangeFailure {
  // DRF's throttle answers before the view, with its own envelope — status is
  // the only reliable signal, and the "try again in N seconds" body it carries
  // is not what we show.
  if (isAxiosError(err) && err.response?.status === 429) {
    return { kind: "throttled", message: THROTTLED_MESSAGE }
  }

  const message = getApiErrorMessage(err)
  const code = readCode(err)

  return code ? { kind: "code", code, message } : { kind: "message", message }
}
