/** What a program save sends, and the client's copy of the server's rules. */

import { describe, expect, it } from "vitest"

import {
  buildProgramPayload,
  changedProgramFields,
  emptyProgramValues,
  programSchema,
  type ProgramFormValues,
} from "./programForm"

const FOOTBALL = { id: "sport-f", is_primary: true }
const CRICKET = { id: "sport-c", is_primary: false }

const values = (overrides: Partial<ProgramFormValues> = {}): ProgramFormValues => ({
  name: "  U12 Football Foundation ",
  sport_id: "sport-c",
  age_min: "8",
  age_max: "12",
  level: "beginner",
  days: ["sat", "tue", "thu"],
  start_time: "16:30",
  end_time: "18:00:00",
  location_id: "loc-1",
  fee_mode: "amount",
  fee_amount: "1,500",
  fee_per: "month",
  free_trial: true,
  spots: "few",
  ...overrides,
})

describe("buildProgramPayload", () => {
  it("sends the amount and the period when the fee is shown", () => {
    expect(buildProgramPayload(values(), { sports: [FOOTBALL, CRICKET] })).toEqual({
      name: "U12 Football Foundation",
      sport_id: "sport-c",
      age_min: 8,
      age_max: 12,
      level: "beginner",
      days: ["tue", "thu", "sat"],
      start_time: "16:30",
      end_time: "18:00",
      location_id: "loc-1",
      fee_mode: "amount",
      fee_amount: 1500,
      fee_per: "month",
      free_trial: true,
      spots: "few",
    })
  })

  it("sends a null amount and period for Contact for fees, whatever the fields hold", () => {
    const payload = buildProgramPayload(values({ fee_mode: "contact" }), { sports: [FOOTBALL] })
    expect(payload.fee_mode).toBe("contact")
    expect(payload.fee_amount).toBeNull()
    expect(payload.fee_per).toBeNull()
  })

  it("sends the only sport silently, and the primary when none was chosen", () => {
    expect(buildProgramPayload(values({ sport_id: "" }), { sports: [FOOTBALL] }).sport_id).toBe("sport-f")
    expect(buildProgramPayload(values({ sport_id: "stale" }), { sports: [FOOTBALL] }).sport_id).toBe("sport-f")
    expect(buildProgramPayload(values({ sport_id: "" }), { sports: [CRICKET, FOOTBALL] }).sport_id).toBe("sport-f")
  })

  it("puts days in week order and sends no branch as null", () => {
    const payload = buildProgramPayload(values({ days: ["sun", "mon", "wed"], location_id: "" }), {
      sports: [FOOTBALL],
    })
    expect(payload.days).toEqual(["mon", "wed", "sun"])
    expect(payload.location_id).toBeNull()
  })
})

describe("changedProgramFields", () => {
  it("is the PATCH body: only what differs", () => {
    const saved = buildProgramPayload(values(), { sports: [FOOTBALL] })
    const next = buildProgramPayload(values({ spots: "full", days: ["tue", "thu"] }), { sports: [FOOTBALL] })
    expect(changedProgramFields(next, saved)).toEqual({ spots: "full", days: ["tue", "thu"] })
    expect(changedProgramFields(saved, saved)).toEqual({})
  })

  it("clears the amount and period together when the fee is hidden", () => {
    const saved = buildProgramPayload(values(), { sports: [FOOTBALL] })
    const next = buildProgramPayload(values({ fee_mode: "contact" }), { sports: [FOOTBALL] })
    expect(changedProgramFields(next, saved)).toEqual({ fee_mode: "contact", fee_amount: null, fee_per: null })
  })
})

describe("programSchema", () => {
  const errorsFor = (input: ProgramFormValues, needsSport = false) => {
    const result = programSchema({ needsSport }).safeParse(input)
    return result.success ? {} : Object.fromEntries(result.error.issues.map((issue) => [issue.path[0], issue.message]))
  }

  it("accepts a whole program", () => {
    expect(errorsFor(values())).toEqual({})
  })

  it("refuses what the server refuses, under the right field", () => {
    expect(errorsFor(values({ age_min: "14", age_max: "12" })).age_max).toBe(
      "The oldest age can't be below the youngest."
    )
    expect(errorsFor(values({ end_time: "16:00" })).end_time).toBe("The end time must be after the start time.")
    expect(errorsFor(values({ days: [] })).days).toBe("Choose at least one day.")
    expect(errorsFor(values({ fee_amount: "" })).fee_amount).toBe("Enter the fee, or choose Contact for fees.")
    expect(errorsFor(values({ age_min: "2" })).age_min).toBe("Ages go from 3 to 80.")
    expect(errorsFor(values({ sport_id: "" }), true).sport_id).toBe("Choose a sport.")
    expect(errorsFor(values({ fee_mode: "contact", fee_amount: "" }))).toEqual({})
  })

  it("starts a new program on the primary sport and branch", () => {
    const start = emptyProgramValues({
      sports: [
        { id: "s2", name: "Cricket", icon_name: "", icon_url: "", is_primary: false },
        { id: "s1", name: "Football", icon_name: "", icon_url: "", is_primary: true },
      ],
      locations: [
        { id: "l2", name: "Annex", address: "", city: "", state: "", country_code: "IN", latitude: null, longitude: null, is_primary: false },
        { id: "l1", name: "Main", address: "", city: "", state: "", country_code: "IN", latitude: null, longitude: null, is_primary: true },
      ],
    })
    expect(start.sport_id).toBe("s1")
    expect(start.location_id).toBe("l1")
  })
})
