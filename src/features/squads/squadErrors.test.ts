import { describe, expect, it } from "vitest"

import {
  squadErrorCode,
  squadErrorSentence,
  squadFailureSentence,
  squadFieldError,
} from "./squadErrors"

const refusal = (code?: string, message = "The server's own words.", errors?: Record<string, string>) => ({
  isAxiosError: true,
  response: { status: 400, data: { message, data: { ...(code ? { code } : {}), errors } } },
})

describe("squadErrorCode", () => {
  it("reads the stable code, and nothing from something that isn't an axios error", () => {
    expect(squadErrorCode(refusal("jersey_taken"))).toBe("jersey_taken")
    expect(squadErrorCode(refusal())).toBeUndefined()
    expect(squadErrorCode(new Error("boom"))).toBeUndefined()
  })
})

describe("squadErrorSentence", () => {
  it.each([
    ["jersey_taken", "Another player in this squad has that number."],
    ["already_member", "They're already in this squad."],
    ["already_invited", "They already have an invite to this squad."],
    ["member_limit", "This squad is full (100 players)."],
    ["squad_limit", "You can have up to 50 squads."],
    ["name_taken", "You already have a squad with this name."],
    ["sport_locked", "The sport can't change once the squad has players."],
    ["cannot_add", "Couldn't add this player."],
    ["not_a_player", "Only player accounts can join squads."],
    ["invite_closed", "This invite isn't available any more."],
    ["throttled", "Too many tries. Try again later."],
  ])("%s → %s", (code, sentence) => {
    expect(squadErrorSentence(refusal(code))).toBe(sentence)
  })

  it("borrows the sport's own words for its members", () => {
    const ctx = { memberNoun: "athlete", memberNounPlural: "athletes" }
    expect(squadErrorSentence(refusal("jersey_taken"), ctx)).toBe(
      "Another athlete in this squad has that number."
    )
    expect(squadErrorSentence(refusal("member_limit"), ctx)).toBe("This squad is full (100 athletes).")
    expect(squadErrorSentence(refusal("sport_locked"), ctx)).toBe(
      "The sport can't change once the squad has athletes."
    )
  })

  it("falls back to the server's message for codes whose meaning depends on the screen", () => {
    expect(squadErrorSentence(refusal("not_found", "That squad wasn't found."))).toBe(
      "That squad wasn't found."
    )
    expect(
      squadErrorSentence(refusal("invite_limit", "A squad can have up to 50 open invites."))
    ).toBe("A squad can have up to 50 open invites.")
    expect(squadErrorSentence(refusal(undefined, "Something specific."))).toBe("Something specific.")
  })

  it("says so when nothing came back at all", () => {
    expect(squadErrorSentence({ isAxiosError: true })).toBe(
      "Check your internet connection and try again"
    )
  })
})

describe("squadFailureSentence", () => {
  it("maps a batch failure's code, else keeps its message", () => {
    expect(squadFailureSentence({ code: "jersey_taken", message: "x" })).toBe(
      "Another player in this squad has that number."
    )
    expect(
      squadFailureSentence({ code: "not_pending", message: "This request is no longer pending." })
    ).toBe("This request is no longer pending.")
  })
})

describe("squadFieldError", () => {
  it("returns the server's message for one named field", () => {
    const err = refusal("invalid_field", "Bad.", { season: "Season can be up to 20 characters." })
    expect(squadFieldError(err, "season")).toBe("Season can be up to 20 characters.")
    expect(squadFieldError(err, "age_group")).toBeUndefined()
    expect(squadFieldError(refusal("invalid_field", "Bad.", { season: "  " }), "season")).toBeUndefined()
    expect(squadFieldError(new Error("x"), "season")).toBeUndefined()
  })
})
