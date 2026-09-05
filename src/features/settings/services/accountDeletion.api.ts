import { isAxiosError } from "axios"

import api from "@/core/api/axios"
import { getApiErrorMessage } from "@/core/api/getApiErrorMessage"

/**
 * User-initiated account deletion — the two calls behind the danger zone.
 *
 * Kept out of settings.api.ts on purpose: deletion is its own contract (two
 * endpoints, one shared throttle budget and three distinct failure shapes the
 * UI has to tell apart), and the backend separates it the same way
 * (accounts/services/account_deletion_service.py).
 */

// ── Types ────────────────────────────────────────────────────

/**
 * Which credential THIS account confirms with. Decided by the account, never
 * by the client: a Google-only signup has no password it has ever chosen, so
 * it confirms with a mailed code instead.
 */
export type AccountDeleteMethod = "password" | "otp"

export type AccountDeleteInitiateResponse =
  | { method: "password" }
  /** `sent_to` is masked server-side — "s*****b@gmail.com". */
  | { method: "otp"; sent_to: string }

export type AccountDeleteConfirmPayload =
  | { password: string }
  | { otp: string }

export type AccountDeleteConfirmResponse = {
  detail: string
}

// ── OTP shape ────────────────────────────────────────────────

/**
 * Matches the OTP inputs on the auth surface (AuthCard, ForgotPasswordCard) so
 * a code field looks and validates the same wherever it appears.
 *
 * The backend currently mails a 4-digit code (utils/otp_validation.py), so the
 * upper bound is slack rather than a second source of truth — a code the
 * server issues can never be rejected here.
 */
export const OTP_MIN_LENGTH = 4
export const OTP_MAX_LENGTH = 8

// ── API calls ────────────────────────────────────────────────

/**
 * Ask which credential confirms this account, and — for a code account — send
 * the code.
 *
 * Costs one of the three attempts per hour that BOTH deletion endpoints share
 * (accounts/throttles.py::AccountDeleteThrottle), so it is called once per
 * opened modal and never on a retry loop.
 */
export const initiateAccountDeleteApi = async (): Promise<AccountDeleteInitiateResponse> => {
  const res = await api.post("/user/account/delete/initiate")
  return res.data.data
}

/** Deactivate the account. Every session dies with it, including this one. */
export const confirmAccountDeleteApi = async (
  payload: AccountDeleteConfirmPayload
): Promise<AccountDeleteConfirmResponse> => {
  const res = await api.post("/user/account/delete/confirm", payload)
  return res.data.data
}

// ── Failures ─────────────────────────────────────────────────

/**
 * The sentence the sole-owner guard builds, minus the org names it appends.
 * Verbatim from account_deletion_service.py::_assert_no_orphaned_organizations
 * — there is no error code on that response, so the prefix IS the signal.
 */
const SOLE_OWNER_PREFIX =
  "Transfer ownership of these organizations before deleting your account:"

export type AccountDeleteFailure =
  /** Blocking, and not something a retry fixes — the user has to act elsewhere first. */
  | { kind: "sole_owner"; organizations: string[] }
  /** 3/hour, shared by both endpoints. Nothing to do but wait. */
  | { kind: "throttled" }
  /** Everything else, with whatever the backend said. */
  | { kind: "message"; message: string }

/**
 * The names the guard listed, or null when this is not that error.
 *
 * The backend joins them with ", " (each "Name (@username)", or a bare name
 * when the org has no username), so that is what we split on. An org name
 * containing a comma would split into two list items — cosmetic, and the only
 * alternative is asking the API for a structured list it does not return.
 */
function parseSoleOwnerOrganizations(message: string): string[] | null {
  if (!message.startsWith(SOLE_OWNER_PREFIX)) return null

  const names = message
    .slice(SOLE_OWNER_PREFIX.length)
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)

  return names.length > 0 ? names : null
}

/**
 * Classify a thrown error from either endpoint. Both can raise all three, so
 * both callers run it.
 */
export function readAccountDeleteError(err: unknown): AccountDeleteFailure {
  // DRF's throttle answers before the view, with its own envelope — status is
  // the only reliable signal, and the "try again in N seconds" body it carries
  // is not what we show.
  if (isAxiosError(err) && err.response?.status === 429) {
    return { kind: "throttled" }
  }

  const message = getApiErrorMessage(err)

  const organizations = parseSoleOwnerOrganizations(message)
  if (organizations) return { kind: "sole_owner", organizations }

  return { kind: "message", message }
}
