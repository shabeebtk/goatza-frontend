// @vitest-environment jsdom
/**
 * Sending the enquiry: every server answer read into one outcome, and the two
 * transports. Anonymous is a plain fetch with no credentials and no auth
 * header; signed in is axios as the PERSON, whatever account is active.
 */

import { AxiosError, AxiosHeaders } from "axios"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { EnquirySubmitBody } from "../types"
import { enquirySubmitPath, readSubmitAnswer, submitEnquiry } from "./enquirySubmit.api"

const mocks = vi.hoisted(() => ({ post: vi.fn() }))
vi.mock("@/core/api/axios", () => ({ default: { post: mocks.post } }))

const BODY: EnquirySubmitBody = {
  for_whom: "child",
  player_name: "Aditya Menon",
  player_age: 11,
  guardian_name: "Meera Menon",
  phone: "9876543210",
  phone_is_whatsapp: true,
  email: "",
  best_time: "",
  message: "",
  website: "",
}

const SENT = { program_name: "U12 Football Foundation", location_name: "Main Ground", phone_masked: "+91 98•••• 3210" }

const refusal = (code: string, message: string, errors: Record<string, unknown> = {}) => ({
  success: false,
  message,
  data: { code, errors },
})

describe("readSubmitAnswer", () => {
  it("reads a 201 in the envelope and bare", () => {
    expect(readSubmitAnswer(201, { success: true, data: { ok: true, enquiry: SENT } })).toEqual({
      kind: "sent",
      enquiry: SENT,
    })
    expect(readSubmitAnswer(201, { ok: true, enquiry: SENT })).toEqual({ kind: "sent", enquiry: SENT })
  })

  it("maps each refusal", () => {
    const guardian = "If you're under 18, ask a parent or guardian to send this for you."
    expect(readSubmitAnswer(400, refusal("guardian_needed", "Refused.", { for_whom: [guardian] }))).toEqual({
      kind: "guardian_needed",
      message: guardian,
    })
    expect(readSubmitAnswer(400, refusal("too_many_enquiries", "You've already sent a few enquiries today."))).toEqual(
      { kind: "too_many", message: "You've already sent a few enquiries today." }
    )
    expect(readSubmitAnswer(400, refusal("invalid", "Check the form.", { phone: ["Enter a valid phone."] }))).toEqual({
      kind: "invalid",
      errors: { phone: "Enter a valid phone." },
      message: "Check the form.",
    })
    expect(readSubmitAnswer(404, refusal("not_found", "Not found."))).toEqual({ kind: "closed" })
    expect(readSubmitAnswer(429, { success: false, data: { code: "throttled", retry_after: 1800 } })).toEqual({
      kind: "throttled",
      retryAfter: 1800,
    })
    expect(readSubmitAnswer(0, null)).toEqual({ kind: "network" })
    expect(readSubmitAnswer(503, { message: "Down" })).toEqual({ kind: "failed", message: "" })
  })
})

describe("submitEnquiry", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "/api")
    vi.stubGlobal("fetch", fetchMock)
    fetchMock.mockReset()
    mocks.post.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("posts anonymously with a plain fetch: JSON, no credentials, no auth header", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: true, data: { ok: true, enquiry: SENT } }), {
      status: 201,
    }))

    const outcome = await submitEnquiry("kannurfa", BODY, { anonymous: true })

    expect(outcome).toEqual({ kind: "sent", enquiry: SENT })
    expect(mocks.post).not.toHaveBeenCalled()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/enquiries/submit/kannurfa")
    expect(init.method).toBe("POST")
    expect(init.credentials).toBe("omit")
    expect(Object.keys(init.headers).map((key) => key.toLowerCase())).not.toContain("authorization")
    expect(JSON.parse(init.body)).toEqual(BODY)
  })

  it("reads an anonymous 4xx as an answer and a dropped request as no answer", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(refusal("not_found", "Nope")), { status: 404 }))
    expect(await submitEnquiry("kannurfa", BODY, { anonymous: true })).toEqual({ kind: "closed" })

    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"))
    expect(await submitEnquiry("kannurfa", BODY, { anonymous: true })).toEqual({ kind: "network" })
  })

  it("posts signed in through axios as the person, never fetch", async () => {
    mocks.post.mockResolvedValue({ status: 201, data: { success: true, data: { ok: true, enquiry: SENT } } })

    const outcome = await submitEnquiry("kannurfa", BODY, { anonymous: false })

    expect(outcome.kind).toBe("sent")
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mocks.post).toHaveBeenCalledWith(enquirySubmitPath("kannurfa"), BODY, { actor: { type: "user" } })
  })

  it("reads a signed-in refusal from the axios error", async () => {
    const response = {
      status: 400,
      statusText: "Bad Request",
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: refusal("too_many_enquiries", "You've already sent a few enquiries today. They'll be in touch."),
    }
    mocks.post.mockRejectedValue(new AxiosError("400", "ERR_BAD_REQUEST", undefined, undefined, response))

    expect(await submitEnquiry("kannurfa", BODY, { anonymous: false })).toEqual({
      kind: "too_many",
      message: "You've already sent a few enquiries today. They'll be in touch.",
    })

    mocks.post.mockRejectedValue(new AxiosError("Network Error", "ERR_NETWORK"))
    expect(await submitEnquiry("kannurfa", BODY, { anonymous: false })).toEqual({ kind: "network" })
  })
})
