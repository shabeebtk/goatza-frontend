import { formatAges } from "@/features/orgPage/format"
import type { Program } from "@/features/orgPage/types"

import { firstName } from "./contactLinks"
import { BEST_TIME_LABELS } from "./enquiryFormat"
import type { BestTime, EnquirySent, EnquirySubmitBody } from "./types"

/**
 * The enquiry form's rules, with no React in them: what it holds, the checks
 * that mirror the server's, the payload, and the lines "Enquiry sent" shows.
 * Nothing here is stored anywhere: the form lives in memory and is reset after
 * a send.
 */

export const NAME_MIN = 2
export const NAME_MAX = 80
export const AGE_MIN = 3
export const AGE_MAX = 80
export const ADULT_AGE = 18
export const MESSAGE_MAX = 500

export const UNDERAGE_NOTE = "If you're under 18, ask a parent or guardian to send this for you."

export type ForWhom = "child" | "self"

export type EnquiryForm = {
  forWhom: ForWhom
  childName: string
  childAge: string
  guardianName: string
  selfName: string
  selfAge: string
  /** "" = Not sure yet. */
  programId: string
  /** "" = Not sure yet. */
  locationId: string
  phone: string
  whatsapp: boolean
  email: string
  bestTime: BestTime
  message: string
  /** The honeypot. A person never fills it; whatever it holds is sent. */
  website: string
}

/** Every field a check or the server can point at, in the order they are drawn. */
export type EnquiryField =
  | "childName"
  | "childAge"
  | "guardianName"
  | "selfName"
  | "selfAge"
  | "programId"
  | "locationId"
  | "phone"
  | "email"
  | "bestTime"
  | "message"

export const FIELD_ORDER: readonly EnquiryField[] = [
  "childName",
  "childAge",
  "guardianName",
  "selfName",
  "selfAge",
  "programId",
  "locationId",
  "phone",
  "email",
  "bestTime",
  "message",
]

export type FieldErrors = Partial<Record<EnquiryField, string>>

/**
 * A fresh form. A signed-in visitor gets "Your name" from their display name
 * (the parent's for a child, their own for self), and nothing else.
 */
export function emptyEnquiry({
  programId = "",
  locationId = "",
  viewerName = "",
}: { programId?: string; locationId?: string; viewerName?: string } = {}): EnquiryForm {
  const name = viewerName.trim()
  return {
    forWhom: "child",
    childName: "",
    childAge: "",
    guardianName: name,
    selfName: name,
    selfAge: "",
    programId,
    locationId,
    phone: "",
    whatsapp: true,
    email: "",
    bestTime: "",
    message: "",
    website: "",
  }
}

/** Whether closing would throw something the visitor typed away. */
export function hasTyped(form: EnquiryForm, start: EnquiryForm): boolean {
  const keys: (keyof EnquiryForm)[] = [
    "childName",
    "childAge",
    "guardianName",
    "selfName",
    "selfAge",
    "phone",
    "email",
    "message",
  ]
  return (
    keys.some((key) => String(form[key]).trim() !== String(start[key]).trim()) ||
    form.bestTime !== start.bestTime ||
    form.programId !== start.programId ||
    form.locationId !== start.locationId ||
    form.whatsapp !== start.whatsapp ||
    form.forWhom !== start.forWhom
  )
}

/** A whole number from what was typed, or null. */
export function parseAge(value: string): number | null {
  const trimmed = value.trim()
  if (!/^\d{1,3}$/.test(trimmed)) return null
  return Number(trimmed)
}

/** "Me" with an age under 18: the note shows and sending is blocked. */
export function isUnderageSelf(form: EnquiryForm): boolean {
  if (form.forWhom !== "self") return false
  const age = parseAge(form.selfAge)
  return age !== null && age < ADULT_AGE
}

/**
 * "Switch to My child": what they typed as themselves becomes the child's. A
 * guardian name that was only their own prefilled name is cleared, because it
 * is the parent who now has to give one.
 */
export function switchToChild(form: EnquiryForm): EnquiryForm {
  const moved = form.selfName.trim()
  return {
    ...form,
    forWhom: "child",
    childName: form.childName.trim() ? form.childName : form.selfName,
    childAge: form.childAge.trim() ? form.childAge : form.selfAge,
    guardianName: form.guardianName.trim() === moved ? "" : form.guardianName,
  }
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function checkName(value: string, empty: string): string | undefined {
  const name = value.trim()
  if (!name) return empty
  if (name.length < NAME_MIN) return `Use at least ${NAME_MIN} characters.`
  if (name.length > NAME_MAX) return `Keep it to ${NAME_MAX} characters.`
  return undefined
}

function checkAge(value: string, empty: string): string | undefined {
  if (!value.trim()) return empty
  const age = parseAge(value)
  if (age === null || age < AGE_MIN || age > AGE_MAX) return `Enter an age from ${AGE_MIN} to ${AGE_MAX}.`
  return undefined
}

/** The server's rules, checked before sending. Empty when it can go. */
export function validateEnquiry(form: EnquiryForm): FieldErrors {
  const errors: FieldErrors = {}
  const set = (field: EnquiryField, message: string | undefined) => {
    if (message) errors[field] = message
  }

  if (form.forWhom === "child") {
    set("childName", checkName(form.childName, "Enter your child's name."))
    set("childAge", checkAge(form.childAge, "Enter your child's age."))
    set("guardianName", checkName(form.guardianName, "Enter your name."))
  } else {
    set("selfName", checkName(form.selfName, "Enter your name."))
    set("selfAge", checkAge(form.selfAge, "Enter your age."))
  }

  const digits = form.phone.replace(/\D/g, "")
  if (!form.phone.trim()) set("phone", "Enter a phone number.")
  else if (digits.length < 8 || digits.length > 15) set("phone", "Enter a valid phone number.")

  const email = form.email.trim()
  if (email && !EMAIL_SHAPE.test(email)) set("email", "Enter a valid email address.")

  if (form.message.length > MESSAGE_MAX) set("message", `Keep it to ${MESSAGE_MAX} characters.`)

  return errors
}

/** The first field with an error, in the order they are drawn. */
export function firstErrorField(errors: FieldErrors): EnquiryField | null {
  return FIELD_ORDER.find((field) => errors[field]) ?? null
}

/** What the server is sent. Optional ids are left out rather than sent empty. */
export function buildEnquiryPayload(form: EnquiryForm): EnquirySubmitBody {
  const child = form.forWhom === "child"
  return {
    for_whom: form.forWhom,
    player_name: (child ? form.childName : form.selfName).trim(),
    player_age: parseAge(child ? form.childAge : form.selfAge) ?? 0,
    guardian_name: child ? form.guardianName.trim() : "",
    phone: form.phone.trim(),
    phone_is_whatsapp: form.whatsapp,
    email: form.email.trim(),
    ...(form.programId ? { program_id: form.programId } : {}),
    ...(form.locationId ? { location_id: form.locationId } : {}),
    best_time: form.bestTime,
    message: form.message.trim(),
    website: form.website,
  }
}

/**
 * The server's field names on this form's fields. A player's name or age is
 * the child's or the visitor's own, depending on who it is for.
 */
export function serverFieldErrors(errors: Record<string, string>, forWhom: ForWhom): {
  fields: FieldErrors
  rest: string[]
} {
  const child = forWhom === "child"
  const map: Record<string, EnquiryField> = {
    player_name: child ? "childName" : "selfName",
    player_age: child ? "childAge" : "selfAge",
    guardian_name: "guardianName",
    phone: "phone",
    email: "email",
    program_id: "programId",
    location_id: "locationId",
    best_time: "bestTime",
    message: "message",
  }
  const fields: FieldErrors = {}
  const rest: string[] = []
  for (const [name, sentence] of Object.entries(errors)) {
    const field = map[name]
    if (field) fields[field] = sentence
    else if (name !== "website") rest.push(sentence)
  }
  return { fields, rest }
}

// ── Choices ───────────────────────────────────────────────────

/** The chips, in the day's order, with the inbox's words. */
export const BEST_TIMES: { value: Exclude<BestTime, "">; label: string }[] = (
  ["morning", "afternoon", "evening"] as const
).map((value) => ({ value, label: BEST_TIME_LABELS[value] }))

export function bestTimeLabel(value: BestTime): string {
  return value ? BEST_TIME_LABELS[value] : ""
}

/** "U12 Football Foundation · Ages 8 – 12". */
export function programOptionLabel(program: Pick<Program, "name" | "age_min" | "age_max">): string {
  return [program.name, formatAges(program.age_min, program.age_max)].filter(Boolean).join(" · ")
}

// ── Enquiry sent ──────────────────────────────────────────────

/** What "Enquiry sent" remembers of the form once it is reset. */
export type SentSnapshot = {
  playerName: string
  playerAge: number | null
  bestTime: BestTime
  /** The program's name when the server's answer has none. */
  programName: string
  locationName: string
}

export function sentSnapshot(
  form: EnquiryForm,
  { programs, locations }: { programs: Pick<Program, "id" | "name">[]; locations: { id: string; name: string }[] }
): SentSnapshot {
  const child = form.forWhom === "child"
  return {
    playerName: (child ? form.childName : form.selfName).trim(),
    playerAge: parseAge(child ? form.childAge : form.selfAge),
    bestTime: form.bestTime,
    programName: programs.find((program) => program.id === form.programId)?.name ?? "",
    locationName: locations.find((location) => location.id === form.locationId)?.name ?? "",
  }
}

/**
 * The summary card: "Aditya, 11 · U12 Football Foundation" and
 * "Main Ground · Best time: Evening", each part only when there is one.
 */
export function sentSummary(snapshot: SentSnapshot, enquiry: EnquirySent): { who: string; when: string } {
  const name = firstName(snapshot.playerName)
  const person = [name, snapshot.playerAge !== null ? String(snapshot.playerAge) : ""].filter(Boolean).join(", ")
  const program = enquiry.program_name.trim() || snapshot.programName || "General enquiry"
  const place = enquiry.location_name.trim() || snapshot.locationName
  const time = bestTimeLabel(snapshot.bestTime)
  return {
    who: [person, program].filter(Boolean).join(" · "),
    when: [place, time ? `Best time: ${time}` : ""].filter(Boolean).join(" · "),
  }
}
