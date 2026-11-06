import { describe, expect, it } from "vitest"

import { canShareRecruitment } from "./canShareRecruitment"

const FUTURE = "2999-01-01T00:00:00Z"
const PAST = "2000-01-01T00:00:00Z"

describe("canShareRecruitment", () => {
  it("takes the server's word when it sent one", () => {
    expect(canShareRecruitment({ can_share: true, status: "closed" })).toBe(true)
    expect(canShareRecruitment({ can_share: false, status: "active" })).toBe(false)
  })

  it("nothing to share is no", () => {
    expect(canShareRecruitment(null)).toBe(false)
    expect(canShareRecruitment(undefined)).toBe(false)
  })

  describe("without a server answer", () => {
    const live = { status: "active", event_date: FUTURE }

    it("a live one can be shared", () => {
      expect(canShareRecruitment(live)).toBe(true)
    })

    it.each(["draft", "closed", "cancelled"])("%s cannot", (status) => {
      expect(canShareRecruitment({ ...live, status })).toBe(false)
    })

    it("nor one with no status at all", () => {
      expect(canShareRecruitment({ event_date: FUTURE })).toBe(false)
    })

    it("nor one that stopped taking applications", () => {
      expect(canShareRecruitment({ ...live, is_accepting_applications: false })).toBe(false)
    })

    it("nor one whose trial is over", () => {
      expect(canShareRecruitment({ ...live, is_trial_over: true })).toBe(false)
      expect(canShareRecruitment({ status: "active", event_date: PAST })).toBe(false)
    })

    it("nor a deleted one", () => {
      expect(canShareRecruitment({ ...live, is_deleted: true })).toBe(false)
    })
  })
})
