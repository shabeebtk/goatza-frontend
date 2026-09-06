/**
 * Error classification for the email-change flow.
 *
 * This is the half of the contract the UI actually branches on, and it is
 * where a mismatch with the backend goes unnoticed longest: a code that stops
 * being recognised does not throw, it quietly turns a field error into a
 * banner, or — worse — turns "you signed up with Google, set a password
 * first" into a dead-end sentence with no link.
 *
 * The 429 case is separate because DRF answers it BEFORE the view, so the body
 * carries no code of ours at all — only the status is trustworthy.
 */

import { AxiosError, AxiosHeaders } from "axios"
import { describe, expect, it } from "vitest"

import {
  THROTTLED_MESSAGE,
  readEmailChangeError,
} from "./emailChange.api"

/** An axios error shaped like the backend's envelope (utils/response.py). */
function apiError(status: number, body: unknown) {
  const config = { headers: new AxiosHeaders() }
  return new AxiosError(
    `Request failed with status code ${status}`,
    String(status),
    config,
    {},
    {
      status,
      statusText: "",
      headers: {},
      config,
      data: body,
    }
  )
}

function envelope(message: string, code?: string) {
  return {
    success: false,
    message,
    data: { errors: { non_field_errors: message }, code: code ?? null },
  }
}

describe("readEmailChangeError", () => {
  it("reads the stable code the endpoint returns", () => {
    const failure = readEmailChangeError(
      apiError(400, envelope("Your password is incorrect.", "invalid_password"))
    )

    expect(failure).toEqual({
      kind: "code",
      code: "invalid_password",
      message: "Your password is incorrect.",
    })
  })

  it("keeps password_not_set as a code, so the screen can offer the link", () => {
    const failure = readEmailChangeError(
      apiError(400, envelope("Set a password first.", "password_not_set"))
    )

    expect(failure.kind).toBe("code")
    expect(failure.kind === "code" && failure.code).toBe("password_not_set")
  })

  it("classifies 429 on status alone, ignoring the throttle's own body", () => {
    const failure = readEmailChangeError(
      apiError(429, { detail: "Request was throttled. Expected available in 3512 seconds." })
    )

    expect(failure).toEqual({ kind: "throttled", message: THROTTLED_MESSAGE })
  })

  it("falls back to a plain message for a code it does not know", () => {
    const failure = readEmailChangeError(
      apiError(400, envelope("Something new happened.", "not_a_real_code"))
    )

    expect(failure).toEqual({
      kind: "message",
      message: "Something new happened.",
    })
  })

  it("survives a response with no code at all", () => {
    const failure = readEmailChangeError(apiError(500, { message: "Server error" }))

    expect(failure).toEqual({ kind: "message", message: "Server error" })
  })

  it("reports being offline rather than an axios status string", () => {
    const failure = readEmailChangeError(
      new AxiosError("Network Error", "ERR_NETWORK")
    )

    expect(failure.kind).toBe("message")
    expect(failure.message).toBe("Check your internet connection and try again")
  })
})
