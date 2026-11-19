import { isAxiosError } from "axios"

import { getApiErrorMessage } from "@/core/api/getApiErrorMessage"

/**
 * A page refusal: `data.code` is the stable code (apps/orgpages/errors.py), the
 * message is the server's sentence, and a field error is `data.errors[field]`. A
 * sentence tied to no field is `errors.non_field_errors`.
 */
type PageErrorBody = {
  message?: string
  data?: { code?: string; errors?: Record<string, unknown> }
}

function body(err: unknown): PageErrorBody | undefined {
  if (!isAxiosError(err)) return undefined
  return err.response?.data as PageErrorBody | undefined
}

/** No answer at all: the request never reached the server. */
function isNetworkFailure(err: unknown): boolean {
  return isAxiosError(err) && !err.response
}

export function pageErrorCode(err: unknown): string | undefined {
  return body(err)?.data?.code
}

/** Every field the server named, `{field: sentence}`; empty when it named none. */
export function pageFieldErrors(err: unknown): Record<string, string> {
  const errors = body(err)?.data?.errors
  const out: Record<string, string> = {}
  if (!errors || typeof errors !== "object") return out
  for (const [field, message] of Object.entries(errors)) {
    if (typeof message === "string" && message.trim()) out[field] = message
  }
  return out
}

export const PAGE_FORBIDDEN_SENTENCE = "Only owners and staff can edit the page."
export const ENQUIRIES_FORBIDDEN_SENTENCE = "Only owners and staff can handle enquiries."
export const PAGE_NETWORK_SENTENCE = "Couldn't reach Goatza. Check your connection and try again."

/**
 * The sentence for a code, or null to use the server's own message.
 *
 * Left to the server on purpose: invalid, no_sport, not_eligible, invalid_photo,
 * already_added and the limits. Each is written for people and the server's
 * sentence says which field or which number.
 */
function sentenceFor(code: string | undefined): string | null {
  switch (code) {
    case "switch_to_org":
      return "Switch to your page's account to do that."
    case "forbidden":
      return PAGE_FORBIDDEN_SENTENCE
    case "not_found":
      return "This wasn't found. It may have been removed."
    default:
      return null
  }
}

/** A refusal in a sentence: ours for the few above, else the server's, else `fallback`. */
export function pageErrorSentence(
  err: unknown,
  fallback = "Something went wrong. Please try again."
): string {
  if (isNetworkFailure(err)) return PAGE_NETWORK_SENTENCE
  return sentenceFor(pageErrorCode(err)) ?? getApiErrorMessage(err, fallback)
}
