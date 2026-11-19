import { z } from "zod"

import type { OrgLocation, OrgSport } from "@/features/organization/types"
import {
  WEEK_DAYS,
  type FeeMode,
  type FeePer,
  type Program,
  type ProgramLevel,
  type ProgramSpots,
  type ProgramWritePayload,
  type WeekDay,
} from "./types"

/**
 * The program editor's form: its values, the server's rules mirrored in zod, and
 * the payload a save sends. Kept apart from the screen so it can be tested alone.
 */

// The server's numbers (apps/orgpages/constants.py).
export const PROGRAM_NAME_MIN = 2
export const PROGRAM_NAME_MAX = 80
export const PROGRAM_AGE_MIN = 3
export const PROGRAM_AGE_MAX = 80
export const FEE_AMOUNT_MIN = 1
export const FEE_AMOUNT_MAX = 1_000_000

/** Inputs hold text; the payload turns it into numbers. */
export type ProgramFormValues = {
  name: string
  sport_id: string
  age_min: string
  age_max: string
  level: ProgramLevel
  days: WeekDay[]
  start_time: string
  end_time: string
  /** "" = no branch. */
  location_id: string
  fee_mode: FeeMode
  fee_amount: string
  fee_per: FeePer
  free_trial: boolean
  spots: ProgramSpots
}

const LEVELS = ["beginner", "intermediate", "advanced", "all_levels"] as const
const FEE_MODES = ["amount", "contact"] as const
const FEE_PERS = ["month", "term", "year", "session"] as const
const SPOTS = ["open", "few", "full"] as const

const TIME = /^\d{2}:\d{2}/
const WHOLE = /^\d+$/

/** "16:30" from what a time input gives ("16:30", or "16:30:00" with seconds). */
export function hhmm(value: string): string {
  return (value ?? "").trim().slice(0, 5)
}

const age = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `Enter the ${label} age.`)
    .refine(
      (value) => WHOLE.test(value) && Number(value) >= PROGRAM_AGE_MIN && Number(value) <= PROGRAM_AGE_MAX,
      `Ages go from ${PROGRAM_AGE_MIN} to ${PROGRAM_AGE_MAX}.`
    )

/** The server's rules. `needsSport`: the org has more than one, so one must be chosen. */
export function programSchema({ needsSport }: { needsSport: boolean }) {
  return z
    .object({
      name: z
        .string()
        .trim()
        .min(PROGRAM_NAME_MIN, "Give the program a name of 2 to 80 characters.")
        .max(PROGRAM_NAME_MAX, "Give the program a name of 2 to 80 characters."),
      sport_id: z.string(),
      age_min: age("youngest"),
      age_max: age("oldest"),
      level: z.enum(LEVELS),
      days: z.array(z.enum(WEEK_DAYS as unknown as [WeekDay, ...WeekDay[]])).min(1, "Choose at least one day."),
      start_time: z.string().regex(TIME, "Choose a start time."),
      end_time: z.string().regex(TIME, "Choose an end time."),
      location_id: z.string(),
      fee_mode: z.enum(FEE_MODES),
      fee_amount: z.string(),
      fee_per: z.enum(FEE_PERS),
      free_trial: z.boolean(),
      spots: z.enum(SPOTS),
    })
    .superRefine((values, ctx) => {
      if (needsSport && !values.sport_id) {
        ctx.addIssue({ code: "custom", path: ["sport_id"], message: "Choose a sport." })
      }
      const min = Number(values.age_min)
      const max = Number(values.age_max)
      if (WHOLE.test(values.age_min.trim()) && WHOLE.test(values.age_max.trim()) && min > max) {
        ctx.addIssue({
          code: "custom",
          path: ["age_max"],
          message: "The oldest age can't be below the youngest.",
        })
      }
      if (TIME.test(values.start_time) && TIME.test(values.end_time)) {
        if (hhmm(values.end_time) <= hhmm(values.start_time)) {
          ctx.addIssue({
            code: "custom",
            path: ["end_time"],
            message: "The end time must be after the start time.",
          })
        }
      }
      if (values.fee_mode === "amount") {
        const amount = values.fee_amount.replace(/[,\s]/g, "")
        if (!amount) {
          ctx.addIssue({
            code: "custom",
            path: ["fee_amount"],
            message: "Enter the fee, or choose Contact for fees.",
          })
        } else if (!WHOLE.test(amount) || Number(amount) < FEE_AMOUNT_MIN || Number(amount) > FEE_AMOUNT_MAX) {
          ctx.addIssue({
            code: "custom",
            path: ["fee_amount"],
            message: "Enter a fee from ₹1 to ₹10,00,000, in whole rupees.",
          })
        }
      }
    })
}

/** The org's sports, primary first: the order the Select lists them in. */
export function sportsInOrder(sports: readonly OrgSport[]): OrgSport[] {
  return [...sports].sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
}

/** A new program's starting point: the primary sport and branch, Mon/Wed/Fri 4:30–6. */
export function emptyProgramValues({
  sports,
  locations,
}: {
  sports: readonly OrgSport[]
  locations: readonly OrgLocation[]
}): ProgramFormValues {
  const primaryLocation = locations.find((location) => location.is_primary) ?? locations[0]
  return {
    name: "",
    sport_id: sportsInOrder(sports)[0]?.id ?? "",
    age_min: "",
    age_max: "",
    level: "beginner",
    days: [],
    start_time: "16:30",
    end_time: "18:00",
    location_id: primaryLocation?.id ?? "",
    fee_mode: "amount",
    fee_amount: "",
    fee_per: "month",
    free_trial: false,
    spots: "open",
  }
}

/** A saved program, as the form holds it. */
export function programToValues(program: Program): ProgramFormValues {
  return {
    name: program.name,
    sport_id: program.sport.id,
    age_min: String(program.age_min),
    age_max: String(program.age_max),
    level: program.level,
    days: WEEK_DAYS.filter((day) => program.days.includes(day)),
    start_time: hhmm(program.start_time),
    end_time: hhmm(program.end_time),
    location_id: program.location?.id ?? "",
    fee_mode: program.fee.mode,
    fee_amount: program.fee.amount === null ? "" : String(program.fee.amount),
    fee_per: program.fee.per ?? "month",
    free_trial: program.free_trial,
    spots: program.spots,
  }
}

/**
 * What a save sends. "Contact for fees" sends no amount and no period (null), days
 * go in week order, times as "HH:MM", and with ONE sport its id is sent whatever
 * the form holds, so the person never has to choose it.
 */
export function buildProgramPayload(
  values: ProgramFormValues,
  { sports }: { sports: readonly Pick<OrgSport, "id" | "is_primary">[] }
): ProgramWritePayload {
  const ordered = [...sports].sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
  const sportId = sports.length === 1 ? sports[0].id : values.sport_id || ordered[0]?.id || ""
  const amount = values.fee_amount.replace(/[,\s]/g, "")
  const showsFee = values.fee_mode === "amount"

  return {
    name: values.name.trim(),
    sport_id: sportId,
    age_min: Number(values.age_min.trim()),
    age_max: Number(values.age_max.trim()),
    level: values.level,
    days: WEEK_DAYS.filter((day) => values.days.includes(day)),
    start_time: hhmm(values.start_time),
    end_time: hhmm(values.end_time),
    location_id: values.location_id || null,
    fee_mode: values.fee_mode,
    fee_amount: showsFee && amount ? Number(amount) : null,
    fee_per: showsFee ? values.fee_per : null,
    free_trial: values.free_trial,
    spots: values.spots,
  }
}

const same = (a: unknown, b: unknown) =>
  Array.isArray(a) && Array.isArray(b)
    ? a.length === b.length && a.every((item, index) => item === b[index])
    : a === b

/** Only the fields whose value a save would change: the PATCH body. */
export function changedProgramFields(
  next: ProgramWritePayload,
  saved: ProgramWritePayload
): Partial<ProgramWritePayload> {
  const out: Partial<ProgramWritePayload> = {}
  for (const key of Object.keys(next) as (keyof ProgramWritePayload)[]) {
    if (!same(next[key], saved[key])) (out as Record<string, unknown>)[key] = next[key]
  }
  return out
}
