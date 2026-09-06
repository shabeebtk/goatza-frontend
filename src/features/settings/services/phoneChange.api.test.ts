/**
 * The client-side phone format check, and the error split.
 *
 * `isValidPhone` is a MIRROR of utils/validations.py::is_valid_phone, and a
 * mirror that drifts is worse than no mirror: it either rejects numbers the
 * server would take, or sends ones it will not. The cases below are the edges
 * where the two could come apart — chiefly that the "+" counts against the
 * column's max_length of 15.
 */

import { AxiosError, AxiosHeaders } from "axios"
import { describe, expect, it } from "vitest"

import {
  THROTTLED_MESSAGE,
  isValidPhone,
  readPhoneChangeError,
} from "./phoneChange.api"

describe("isValidPhone", () => {
  it("accepts a number with and without the country prefix", () => {
    expect(isValidPhone("+919876543210")).toBe(true)
    expect(isValidPhone("9876543210")).toBe(true)
  })

  it("accepts the shortest and longest storable numbers", () => {
    expect(isValidPhone("12345678")).toBe(true)          // 8 digits
    expect(isValidPhone("123456789012345")).toBe(true)   // 15 digits, no "+"
    expect(isValidPhone("+12345678901234")).toBe(true)   // 15 chars WITH the "+"
  })

  it("rejects a number that would not fit the column", () => {
    // 16 characters — the "+" counts, and User.phone is max_length=15.
    expect(isValidPhone("+123456789012345")).toBe(false)
  })

  it("rejects too-short, non-numeric and mis-placed separators", () => {
    expect(isValidPhone("1234567")).toBe(false)
    expect(isValidPhone("abcdefghij")).toBe(false)
    expect(isValidPhone("98765+43210")).toBe(false)
    expect(isValidPhone("+91 9876543210")).toBe(false)
    expect(isValidPhone("")).toBe(false)
  })
})

function apiError(status: number, body: unknown) {
  const config = { headers: new AxiosHeaders() }
  return new AxiosError(
    `Request failed with status code ${status}`,
    String(status),
    config,
    {},
    { status, statusText: "", headers: {}, config, data: body }
  )
}

describe("readPhoneChangeError", () => {
  it("reads the code for a value the server refused", () => {
    const failure = readPhoneChangeError(
      apiError(400, {
        message: "This phone number is already in use.",
        data: { code: "phone_taken" },
      })
    )

    expect(failure).toEqual({
      kind: "code",
      code: "phone_taken",
      message: "This phone number is already in use.",
    })
  })

  it("reads phone_required — the constraint, not a bad value", () => {
    const failure = readPhoneChangeError(
      apiError(400, {
        message: "You can't remove your phone number...",
        data: { code: "phone_required" },
      })
    )

    expect(failure.kind === "code" && failure.code).toBe("phone_required")
  })

  it("classifies 429 on status alone", () => {
    const failure = readPhoneChangeError(apiError(429, { detail: "throttled" }))

    expect(failure).toEqual({ kind: "throttled", message: THROTTLED_MESSAGE })
  })

  it("falls back to a plain message when there is no known code", () => {
    const failure = readPhoneChangeError(apiError(500, { message: "Server error" }))

    expect(failure).toEqual({ kind: "message", message: "Server error" })
  })
})
