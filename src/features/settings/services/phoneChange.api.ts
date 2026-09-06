import { isAxiosError } from "axios"

import api from "@/core/api/axios"
import { getApiErrorMessage } from "@/core/api/getApiErrorMessage"

/**
 * The phone number — one read for the prefill, one write to change it.
 *
 * Unlike the email flow next door there is no verification step: phone is not
 * a login identifier, so v1 is a plain authenticated update (see the backend's
 * accounts/services/phone_change_service.py for the whole argument). The one
 * thing to know is that every save resets `is_phone_verified` server-side.
 *
 * The GET exists because `phone` is deliberately in NO user serializer — the
 * profile payloads render other people's profiles, and a phone number is not
 * something the app publishes. So it cannot be prefilled from useMyProfile.
 */

// ── Types ────────────────────────────────────────────────────

export type PhoneResponse = {
  /** null when the account has no number on file. */
  phone: string | null
  /** Always false after a write. Nothing sets it true yet — SMS OTP is not built. */
  is_phone_verified: boolean
}

/** Codes the write returns under `data.code`. */
export type PhoneChangeErrorCode =
  | "invalid_phone"
  | "phone_taken"
  | "phone_required"

// ── Format ───────────────────────────────────────────────────

/**
 * Mirrors utils/validations.py::is_valid_phone — an optional leading "+" and
 * 8-15 digits, with the WHOLE string capped at the column's max_length=15
 * (the "+" counts). Keep the two in step: anything the backend rejects should
 * never get sent.
 */
export const PHONE_MAX_LENGTH = 15
export const PHONE_REGEX = /^\+?\d{8,15}$/

export const isValidPhone = (phone: string): boolean =>
  phone.length <= PHONE_MAX_LENGTH && PHONE_REGEX.test(phone)

// ── API calls ────────────────────────────────────────────────

/** The number currently on file, for the settings screen's prefill. */
export const getPhoneApi = async (): Promise<PhoneResponse> => {
  const res = await api.get("/user/phone/change")
  return res.data.data
}

/** Set, replace, or — with `null` — remove the number. */
export const updatePhoneApi = async (
  phone: string | null
): Promise<PhoneResponse> => {
  const res = await api.post("/user/phone/change", { phone })
  return res.data.data
}

// ── Failures ─────────────────────────────────────────────────

export type PhoneChangeFailure =
  | { kind: "throttled"; message: string }
  | { kind: "code"; code: PhoneChangeErrorCode; message: string }
  | { kind: "message"; message: string }

export const THROTTLED_MESSAGE =
  "Too many changes. Please try again in an hour."

const KNOWN_CODES: readonly PhoneChangeErrorCode[] = [
  "invalid_phone",
  "phone_taken",
  "phone_required",
]

/**
 * Classify a thrown error from the write.
 *
 * `phone_required` is the interesting one — it is not a bad value, it is the
 * DB constraint saying this account would be left with no way to sign in. It
 * belongs in a banner, not under the field.
 */
export function readPhoneChangeError(err: unknown): PhoneChangeFailure {
  if (isAxiosError(err) && err.response?.status === 429) {
    return { kind: "throttled", message: THROTTLED_MESSAGE }
  }

  const message = getApiErrorMessage(err)
  const code = (
    err as { response?: { data?: { data?: { code?: string } } } }
  )?.response?.data?.data?.code

  return KNOWN_CODES.includes(code as PhoneChangeErrorCode)
    ? { kind: "code", code: code as PhoneChangeErrorCode, message }
    : { kind: "message", message }
}
