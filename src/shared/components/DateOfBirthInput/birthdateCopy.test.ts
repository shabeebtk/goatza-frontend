import { describe, expect, it } from "vitest"

import {
  birthdateConfirmMessage,
  birthdateFieldError,
  formatBirthdate,
} from "./birthdateCopy"

describe("formatBirthdate", () => {
  it("writes the date out", () => {
    expect(formatBirthdate("2008-03-12")).toBe("12 March 2008")
    expect(formatBirthdate("2008-03-12", "short")).toBe("12 Mar 2008")
  })

  it("does not move a date across a time zone", () => {
    // new Date("2008-01-01") is midnight UTC, the 31st anywhere west of Greenwich.
    expect(formatBirthdate("2008-01-01")).toBe("1 January 2008")
  })

  it("gives back something it cannot read rather than inventing a date", () => {
    expect(formatBirthdate("soon")).toBe("soon")
  })
})

describe("birthdateConfirmMessage", () => {
  it("asks with the date in it", () => {
    expect(birthdateConfirmMessage("2008-03-12")).toBe(
      "Is 12 March 2008 your correct date of birth? You won't be able to change it later."
    )
  })
})

describe("birthdateFieldError", () => {
  it("reads the sentence out of a 400 on birthdate", () => {
    const err = {
      response: { data: { data: { birthdate: ["Your date of birth can't be changed."] } } },
    }

    expect(birthdateFieldError(err)).toBe("Your date of birth can't be changed.")
  })

  it("has nothing to say about any other failure", () => {
    expect(birthdateFieldError(new Error("offline"))).toBeUndefined()
    expect(birthdateFieldError({ response: { data: { data: {} } } })).toBeUndefined()
  })
})
