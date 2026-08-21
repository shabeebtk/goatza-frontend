import { describe, expect, it } from "vitest"

import {
  RESERVED_USERNAMES,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  validateUsernameFormat,
} from "./username"

/**
 * This file is a MIRROR of the backend's `validate_username_format`
 * (utils/validations.py), and drift is the failure mode: a form that accepts
 * what the API refuses tells the user "Choose a different username" with no
 * reason. The cases here are the same ones
 * usernames/tests/test_username_namespace.py::ValidatorTests asserts.
 */
describe("validateUsernameFormat", () => {
  it("accepts an ordinary handle", () => {
    expect(validateUsernameFormat("kochi_fc")).toBeNull()
    expect(validateUsernameFormat("  Kochi_FC  ")).toBeNull()
  })

  it("rejects dots — the charset organizations used to have", () => {
    expect(validateUsernameFormat("kochi.fc")).toBe(
      "Only letters, numbers, and underscores allowed"
    )
  })

  it("rejects a purely numeric handle", () => {
    expect(validateUsernameFormat("12345")).toBe("Username cannot be only numbers")
  })

  it("enforces the same bounds as the backend", () => {
    expect(USERNAME_MIN_LENGTH).toBe(3)
    expect(USERNAME_MAX_LENGTH).toBe(30)
    expect(validateUsernameFormat("ab")).toContain("at least 3")
    expect(validateUsernameFormat("a".repeat(31))).toContain("longer than 30")
    expect(validateUsernameFormat("a".repeat(30))).toBeNull()
  })

  it("enforces the underscore rules", () => {
    expect(validateUsernameFormat("_kochi")).toContain("underscore")
    expect(validateUsernameFormat("kochi_")).toContain("underscore")
    expect(validateUsernameFormat("ko__chi")).toContain("consecutive")
  })

  it("reserves every live route segment", () => {
    for (const segment of [
      "auth", "card", "chat", "coaching", "cv", "explore", "highlights",
      "home", "join", "matches", "messages", "notifications", "organization",
      "posts", "recruitments", "scouting", "search",
    ]) {
      expect(RESERVED_USERNAMES.has(segment)).toBe(true)
    }
  })

  it("rejects a reserved name regardless of case", () => {
    expect(validateUsernameFormat("Matches")).toBe("This username is not allowed")
  })
})
