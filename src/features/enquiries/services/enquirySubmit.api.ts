import { isAxiosError } from "axios"

import api from "@/core/api/axios"
import { postPublic } from "@/features/profile/services/publicProfile.api"

import type { EnquirySent, EnquirySubmitBody, EnquirySubmitOutcome } from "../types"

/**
 * Sending the enquiry form. Two transports, one answer:
 *
 * - anonymous: `postPublic`, a plain fetch with no credentials, no JWT and no
 *   actor headers;
 * - signed in: axios as the PERSON, whatever account is active, so the server
 *   records who sent it even while they act as an org.
 */

const asPerson = { actor: { type: "user" as const } }

export const enquirySubmitPath = (orgUsername: string) =>
  `/enquiries/submit/${encodeURIComponent(orgUsername)}`

type Envelope = {
  success?: boolean
  message?: string
  data?: {
    ok?: boolean
    enquiry?: Partial<EnquirySent>
    code?: string
    errors?: Record<string, unknown>
    retry_after?: number
  } | null
  /** A body that isn't in the envelope (DRF's own throttle answer). */
  ok?: boolean
  enquiry?: Partial<EnquirySent>
  code?: string
  detail?: string
  retry_after?: number
}

const text = (value: unknown): string => (typeof value === "string" ? value : "")

/** The first sentence of each field's errors: the server sends a string or a list. */
function fieldErrors(errors: Record<string, unknown> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [field, value] of Object.entries(errors ?? {})) {
    const sentence = Array.isArray(value) ? text(value[0]) : text(value)
    if (sentence) out[field] = sentence
  }
  return out
}

/** Reads one answer. Exported for the tests: both transports end here. */
export function readSubmitAnswer(status: number, body: unknown): EnquirySubmitOutcome {
  if (status === 0) return { kind: "network" }
  const envelope = (body && typeof body === "object" ? body : {}) as Envelope
  const data = envelope.data ?? {}
  const message = text(envelope.message) || text(envelope.detail)

  if (status >= 200 && status < 300) {
    const enquiry = data.enquiry ?? envelope.enquiry ?? {}
    return {
      kind: "sent",
      enquiry: {
        program_name: text(enquiry.program_name),
        location_name: text(enquiry.location_name),
        phone_masked: text(enquiry.phone_masked),
      },
    }
  }

  const code = text(data.code) || text(envelope.code)
  if (status === 404) return { kind: "closed" }
  if (status === 429) {
    const retry = data.retry_after ?? envelope.retry_after
    return { kind: "throttled", retryAfter: typeof retry === "number" ? retry : null }
  }
  if (status === 400) {
    const errors = fieldErrors(data.errors)
    if (code === "guardian_needed") {
      return { kind: "guardian_needed", message: errors.for_whom || message }
    }
    if (code === "too_many_enquiries") return { kind: "too_many", message }
    if (Object.keys(errors).length > 0) return { kind: "invalid", errors, message }
  }
  return { kind: "failed", message: status >= 500 ? "" : message }
}

export async function submitEnquiry(
  orgUsername: string,
  body: EnquirySubmitBody,
  { anonymous }: { anonymous: boolean }
): Promise<EnquirySubmitOutcome> {
  const path = enquirySubmitPath(orgUsername)

  if (anonymous) {
    const answer = await postPublic(path, body)
    return readSubmitAnswer(answer.status, answer.data)
  }

  try {
    const res = await api.post(path, body, asPerson)
    return readSubmitAnswer(res.status, res.data)
  } catch (error) {
    if (isAxiosError(error) && error.response) {
      return readSubmitAnswer(error.response.status, error.response.data)
    }
    return { kind: "network" }
  }
}
