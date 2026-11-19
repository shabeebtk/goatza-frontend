/**
 * The enquiry form's rules: the client checks mirror the server's, the
 * under-18 rule on "Me", "Switch to My child", the payload (honeypot
 * included), and the lines "Enquiry sent" shows.
 */

import { describe, expect, it } from "vitest"

import {
  buildEnquiryPayload,
  emptyEnquiry,
  firstErrorField,
  hasTyped,
  isUnderageSelf,
  programOptionLabel,
  sentSummary,
  serverFieldErrors,
  switchToChild,
  validateEnquiry,
  type EnquiryForm,
} from "./enquiryForm"

const filled = (overrides: Partial<EnquiryForm> = {}): EnquiryForm => ({
  ...emptyEnquiry(),
  childName: "Aditya Menon",
  childAge: "11",
  guardianName: "Meera Menon",
  phone: "98765 43210",
  ...overrides,
})

describe("emptyEnquiry", () => {
  it("starts on My child, WhatsApp ticked, and prefills only Your name", () => {
    const form = emptyEnquiry({ programId: "prog-1", locationId: "loc-2", viewerName: " Meera Menon " })

    expect(form.forWhom).toBe("child")
    expect(form.whatsapp).toBe(true)
    expect(form.guardianName).toBe("Meera Menon")
    expect(form.selfName).toBe("Meera Menon")
    expect(form.childName).toBe("")
    expect(form.phone).toBe("")
    expect(form.email).toBe("")
    expect(form.programId).toBe("prog-1")
    expect(form.locationId).toBe("loc-2")
  })
})

describe("validateEnquiry", () => {
  it("passes a complete child enquiry", () => {
    expect(validateEnquiry(filled())).toEqual({})
  })

  it("asks for the child's name, age and the parent's name, in that order", () => {
    const errors = validateEnquiry(emptyEnquiry())

    expect(Object.keys(errors)).toEqual(["childName", "childAge", "guardianName", "phone"])
    expect(firstErrorField(errors)).toBe("childName")
  })

  it("holds names to 2–80 characters and ages to 3–80", () => {
    expect(validateEnquiry(filled({ childName: "A" })).childName).toMatch(/at least 2/)
    expect(validateEnquiry(filled({ childName: "A".repeat(81) })).childName).toMatch(/80/)
    expect(validateEnquiry(filled({ childAge: "2" })).childAge).toBe("Enter an age from 3 to 80.")
    expect(validateEnquiry(filled({ childAge: "81" })).childAge).toBe("Enter an age from 3 to 80.")
    expect(validateEnquiry(filled({ childAge: "3" })).childAge).toBeUndefined()
  })

  it("checks only the self fields for Me", () => {
    const errors = validateEnquiry(filled({ forWhom: "self", selfName: "", selfAge: "" }))
    expect(Object.keys(errors)).toEqual(["selfName", "selfAge"])
  })

  it("needs a phone, and an email only when one is given", () => {
    expect(validateEnquiry(filled({ phone: "" })).phone).toBe("Enter a phone number.")
    expect(validateEnquiry(filled({ phone: "123" })).phone).toBe("Enter a valid phone number.")
    expect(validateEnquiry(filled({ email: "meera@" })).email).toBe("Enter a valid email address.")
    expect(validateEnquiry(filled({ email: "meera@example.in" })).email).toBeUndefined()
  })
})

describe("the under-18 rule", () => {
  it("applies to Me under 18 only", () => {
    expect(isUnderageSelf(filled({ forWhom: "self", selfAge: "15" }))).toBe(true)
    expect(isUnderageSelf(filled({ forWhom: "self", selfAge: "18" }))).toBe(false)
    expect(isUnderageSelf(filled({ forWhom: "self", selfAge: "" }))).toBe(false)
    expect(isUnderageSelf(filled({ forWhom: "child", childAge: "11" }))).toBe(false)
  })

  it("moves the typed name and age into the child's, and clears a guardian name that was theirs", () => {
    const form = switchToChild({
      ...emptyEnquiry({ viewerName: "Rahul" }),
      forWhom: "self",
      selfName: "Rahul",
      selfAge: "15",
    })

    expect(form.forWhom).toBe("child")
    expect(form.childName).toBe("Rahul")
    expect(form.childAge).toBe("15")
    expect(form.guardianName).toBe("")
  })
})

describe("buildEnquiryPayload", () => {
  it("sends a child enquiry with the honeypot and leaves out empty ids", () => {
    const body = buildEnquiryPayload(filled({ bestTime: "evening", website: "" }))

    expect(body).toEqual({
      for_whom: "child",
      player_name: "Aditya Menon",
      player_age: 11,
      guardian_name: "Meera Menon",
      phone: "98765 43210",
      phone_is_whatsapp: true,
      email: "",
      best_time: "evening",
      message: "",
      website: "",
    })
  })

  it("sends what the honeypot holds, the chosen program and branch, and no guardian for Me", () => {
    const body = buildEnquiryPayload(
      filled({
        forWhom: "self",
        selfName: "Rahul",
        selfAge: "19",
        programId: "prog-1",
        locationId: "loc-2",
        website: "spam",
      })
    )

    expect(body.guardian_name).toBe("")
    expect(body.player_name).toBe("Rahul")
    expect(body.player_age).toBe(19)
    expect(body.program_id).toBe("prog-1")
    expect(body.location_id).toBe("loc-2")
    expect(body.website).toBe("spam")
  })
})

describe("serverFieldErrors", () => {
  it("puts the server's player fields on whoever the enquiry is for", () => {
    expect(serverFieldErrors({ player_name: "Too short.", email: "Bad." }, "child").fields).toEqual({
      childName: "Too short.",
      email: "Bad.",
    })
    expect(serverFieldErrors({ player_age: "Too young." }, "self").fields).toEqual({ selfAge: "Too young." })
    expect(serverFieldErrors({ for_whom: "Nope." }, "self").rest).toEqual(["Nope."])
  })
})

describe("hasTyped", () => {
  it("ignores the prefill and sees anything typed or picked", () => {
    const start = emptyEnquiry({ viewerName: "Meera" })
    expect(hasTyped(start, start)).toBe(false)
    expect(hasTyped({ ...start, phone: "9" }, start)).toBe(true)
    expect(hasTyped({ ...start, bestTime: "morning" }, start)).toBe(true)
    expect(hasTyped({ ...start, forWhom: "self" }, start)).toBe(true)
  })
})

describe("the program option and the sent summary", () => {
  it("reads the program as its name and ages", () => {
    expect(programOptionLabel({ name: "U12 Football Foundation", age_min: 8, age_max: 12 })).toBe(
      "U12 Football Foundation · Ages 8 – 12"
    )
  })

  it("says who, what, where and when, each part only when there is one", () => {
    const snapshot = {
      playerName: "Aditya Menon",
      playerAge: 11,
      bestTime: "evening" as const,
      programName: "",
      locationName: "",
    }

    expect(
      sentSummary(snapshot, { program_name: "U12 Football Foundation", location_name: "Main Ground", phone_masked: "" })
    ).toEqual({ who: "Aditya, 11 · U12 Football Foundation", when: "Main Ground · Best time: Evening" })

    expect(sentSummary({ ...snapshot, bestTime: "" }, { program_name: "", location_name: "", phone_masked: "" })).toEqual({
      who: "Aditya, 11 · General enquiry",
      when: "",
    })
  })
})
