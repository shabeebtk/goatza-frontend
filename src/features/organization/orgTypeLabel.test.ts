import { describe, expect, it } from "vitest"

import { orgTypeLabel } from "./orgTypeLabel"

describe("orgTypeLabel", () => {
  it("labels the three page types", () => {
    expect(orgTypeLabel("club")).toBe("Club")
    expect(orgTypeLabel("team")).toBe("Team")
    expect(orgTypeLabel("academy")).toBe("Academy")
  })

  it("has no label for the retired school type, or anything else it does not know", () => {
    expect(orgTypeLabel("school")).toBe("")
    expect(orgTypeLabel("franchise")).toBe("")
    expect(orgTypeLabel("toString")).toBe("")
  })

  it("has no label for a missing type", () => {
    expect(orgTypeLabel("")).toBe("")
    expect(orgTypeLabel(null)).toBe("")
    expect(orgTypeLabel(undefined)).toBe("")
  })
})
