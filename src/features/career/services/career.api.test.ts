import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ post: vi.fn() }))

vi.mock("@/core/api/axios", () => ({ default: { post: mocks.post } }))

import { verifyCareerEntryApi } from "./career.api"

const ENTRY = {
  id: "entry-1",
  organization: null,
  organization_name: "Dream FC",
  sport: { id: "sport-1", name: "Football", icon_name: "mdi:soccer", icon_url: "" },
  title: "Striker",
  entry_type: "club_team",
  squad_level: "",
  age_group: "U17",
  positions: [],
  start_date: "2025-06-01",
  end_date: null,
  is_current: true,
  description: "",
  verification_status: "verified",
  verified_at: "2026-11-13T10:00:00Z",
  // A stint the club made by putting the player in a squad.
  source: "squad",
  created_at: "2026-11-01T10:00:00Z",
  updated_at: "2026-11-13T10:00:00Z",
}

beforeEach(() => {
  mocks.post.mockReset()
  mocks.post.mockResolvedValue({ data: { data: { ...ENTRY, squad_member: { id: "m-1" } } } })
})

describe("verifyCareerEntryApi", () => {
  it("sends {} exactly for a plain verify", async () => {
    await verifyCareerEntryApi("entry-1")

    expect(mocks.post).toHaveBeenCalledTimes(1)
    expect(mocks.post).toHaveBeenCalledWith("/careers/entry-1/verify", {})
  })

  it("sends the squad body for verify and add to squad", async () => {
    await verifyCareerEntryApi("entry-1", {
      squad_id: "sq-1",
      position_id: "pos-st",
      jersey_number: 9,
    })

    expect(mocks.post).toHaveBeenCalledWith("/careers/entry-1/verify", {
      squad_id: "sq-1",
      position_id: "pos-st",
      jersey_number: 9,
    })
  })

  it("parses an entry whose source is squad and drops squad_member", async () => {
    const entry = await verifyCareerEntryApi("entry-1", { squad_id: "sq-1" })

    expect(entry.source).toBe("squad")
    expect(entry.id).toBe("entry-1")
    expect("squad_member" in entry).toBe(false)
  })
})
