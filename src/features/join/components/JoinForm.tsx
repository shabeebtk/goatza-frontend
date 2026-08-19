"use client"

/**
 * State 2 — the form.
 *
 * Name and phone are the only fields that can stop a submit. Everything else
 * goes through empty without a word, and none of it is labelled "optional":
 * marking eight of nine fields optional reads as "most of this does not
 * matter", which is the opposite of what it is for. The two that ARE required
 * carry the asterisk the design system already uses, and that is the whole
 * signal.
 *
 * Date of birth sits outside react-hook-form, the same way DetailsStep handles
 * it — DateOfBirthPicker is three selects behind one `onChange(string | null)`,
 * not an input RHF can register. The city picker is outside it for the same
 * reason: LocationPicker holds a MapboxCity object, not a string, and RHF has
 * nothing to register against a component that never renders a named input.
 */

import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Icon } from "@iconify/react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import LocationPicker from "@/shared/components/LocationPicker/LocationPicker"
import { Button, DateOfBirthPicker, Input, Select } from "@/shared/components/ui"
import type { MapboxCity } from "@/shared/services/mapbox.service"

import { useJoinWaitlist } from "../hooks/useJoinWaitlist"
import { JoinApiError } from "../services/join.api"
import type { SignupPayload, SignupResult } from "../types"
import { LEVELS, POSITIONS, toSignupLocation } from "../types"
import styles from "./JoinPage.module.css"

// Deliberately loose. This gate exists to catch "not an email", not to
// adjudicate RFC 5322 — the field is optional and a false rejection here costs
// a signup, while a typo'd address costs nothing we depend on.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Oldest we accept, mirroring the backend serializer's MAX_AGE_YEARS. Checked
// here as well so a 1955 birth year is corrected in place rather than coming
// back as a 400 against a field the picker cannot show an error on.
const MAX_AGE_YEARS = 60

/**
 * Whatever somebody typed → the 10 local digits, or null if it cannot be one.
 *
 * The field already shows "+91", so 10 digits is what it asks for — but people
 * paste. A pasted "+91 98470 12345", "0984 701 2345" or "919847012345" is the
 * same number and is accepted as one; anything that is not 10 digits after
 * that is not.
 */
function toTenDigits(raw: string): string | null {
  let digits = raw.replace(/\D/g, "")

  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2)
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1)

  return digits.length === 10 ? digits : null
}

/** Age in whole years on a given date, from a "YYYY-MM-DD" string. */
function ageFrom(iso: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return null

  const [, year, month, day] = match
  const today = new Date()

  let age = today.getFullYear() - Number(year)
  const hadBirthday =
    today.getMonth() + 1 > Number(month) ||
    (today.getMonth() + 1 === Number(month) && today.getDate() >= Number(day))

  if (!hadBirthday) age -= 1

  return age
}

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Please enter your full name")
    .max(150, "That name is too long"),

  phone: z
    .string()
    .refine((value) => toTenDigits(value) !== null, "Enter a 10-digit number"),

  email: z
    .string()
    .refine(
      (value) => value.trim() === "" || EMAIL_RE.test(value.trim()),
      "Enter a valid email",
    ),

  position: z.string(),
  level: z.string(),
  instagram: z.string().max(200, "That link is too long"),
  club_or_academy: z.string().max(150, "That name is too long"),

  // The honeypot. Never validated and never read here — the backend decides
  // what a filled one means, and it answers a bot with the ordinary success
  // shape rather than telling it what gave the game away.
  website: z.string(),
})

type FormFields = z.infer<typeof schema>

/** The payload keys whose value is a plain string filled in by the form. */
type TextPayloadField =
  | "email"
  | "position"
  | "level"
  | "instagram"
  | "club_or_academy"

/** Drops every empty value, so an unanswered field is absent rather than "". */
function buildPayload(
  values: FormFields,
  birthdate: string | null,
  city: MapboxCity | null,
): SignupPayload {
  const payload: SignupPayload = {
    name: values.name.trim(),
    // Always E.164. The backend would default a bare 10-digit number to +91
    // anyway, but the country code belongs to whoever showed it on the label.
    phone: `+91${toTenDigits(values.phone)}`,
  }

  // The TEXT fields only. `location` is on the payload too but is an object,
  // and typing this list as `keyof SignupPayload` would let a string be written
  // into it — the compiler caught exactly that when the district string became
  // a location object.
  const optional: Array<[TextPayloadField, string]> = [
    ["email", values.email.trim()],
    ["position", values.position],
    ["level", values.level],
    ["instagram", values.instagram.trim()],
    ["club_or_academy", values.club_or_academy.trim()],
  ]

  for (const [key, value] of optional) {
    if (value) payload[key] = value
  }

  if (birthdate) payload.date_of_birth = birthdate

  // Nested, and only when a city was actually picked. Not `location: null` and
  // not `{}` — the backend treats an absent key as "not answered", which is
  // exactly what an untouched picker means.
  if (city) payload.location = toSignupLocation(city)

  if (values.website.trim()) payload.website = values.website

  return payload
}

// Server field names that map onto a form input. Anything else the backend
// complains about (or a bare `non_field_errors`) surfaces above the button,
// because there is nowhere better to put it.
const FORM_FIELDS = [
  "name",
  "phone",
  "email",
  "position",
  "level",
  "instagram",
  "club_or_academy",
] as const

export default function JoinForm({
  onJoined,
}: {
  onJoined: (result: SignupResult) => void
}) {
  const join = useJoinWaitlist()

  // Outside RHF (three selects, one composed value) — and so are its errors.
  const [birthdate, setBirthdate] = useState<string | null>(null)
  const [birthdateError, setBirthdateError] = useState<string | null>(null)

  // Also outside RHF: an object, not a string. Null until a city is picked,
  // and picking one is never required.
  const [city, setCity] = useState<MapboxCity | null>(null)
  const [locationError, setLocationError] = useState<string | null>(null)

  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormFields>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      phone: "",
      email: "",
      position: "",
      level: "",
      instagram: "",
      club_or_academy: "",
      website: "",
    },
  })

  const onSubmit = async (values: FormFields) => {
    setFormError(null)
    setBirthdateError(null)
    setLocationError(null)

    if (birthdate) {
      const age = ageFrom(birthdate)
      if (age !== null && age > MAX_AGE_YEARS) {
        setBirthdateError("Please check your date of birth.")
        return
      }
    }

    try {
      const result = await join.mutateAsync(
        buildPayload(values, birthdate, city),
      )
      onJoined(result)
    } catch (error) {
      // Nothing is cleared and nothing is reset. Whatever failed, the form is
      // still exactly as it was typed — on a phone, that is the difference
      // between a retry and an abandoned signup.
      if (!(error instanceof JoinApiError)) {
        // Network failure. The mutation already raised the toast; there is no
        // field to blame and no server message to show.
        return
      }

      const { fieldErrors } = error
      let placed = false

      for (const field of FORM_FIELDS) {
        const message = fieldErrors[field]
        if (message) {
          setError(field, { type: "server", message })
          placed = true
        }
      }

      if (fieldErrors.date_of_birth) {
        setBirthdateError(fieldErrors.date_of_birth)
        placed = true
      }

      // The backend drops a location it cannot use rather than refusing the
      // signup, so this should never arrive. Placed anyway: a field error with
      // nowhere to land becomes a generic line above the button, which is the
      // one thing this form does not do.
      if (fieldErrors.location) {
        setLocationError(fieldErrors.location)
        placed = true
      }

      // 429 is already a toast — repeating it above the button says the same
      // thing twice.
      if (!placed && error.status !== 429) setFormError(error.message)
    }
  }

  const busy = isSubmitting || join.isPending

  return (
    <section className={styles.state}>
      <header className={styles.formHead}>
        <h1 className={styles.formTitle}>Register as a player</h1>
        <p className={styles.formSub}>
          Name and number is all we need. The rest helps scouts find you.
        </p>
      </header>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className={styles.form}>
        <Input
          label="Full name"
          required
          placeholder="Arjun Menon"
          autoComplete="name"
          autoCapitalize="words"
          enterKeyHint="next"
          {...register("name")}
          error={errors.name?.message}
        />

        <Input
          label="WhatsApp number"
          required
          type="tel"
          inputMode="numeric"
          placeholder="98470 12345"
          autoComplete="tel-national"
          enterKeyHint="next"
          leftIcon={<span className={styles.phonePrefix}>+91</span>}
          {...register("phone")}
          error={errors.phone?.message}
        />

        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          autoCapitalize="none"
          enterKeyHint="next"
          {...register("email")}
          error={errors.email?.message}
        />

        <div>
          <label className={styles.fieldLabel} htmlFor="join-dob">
            Date of birth
          </label>
          <DateOfBirthPicker
            id="join-dob"
            value={birthdate}
            onChange={setBirthdate}
            disabled={busy}
          />
          {birthdateError && (
            <p className={styles.errorMsg} role="alert">
              <Icon icon="mdi:alert-circle-outline" width={12} height={12} />
              {birthdateError}
            </p>
          )}
        </div>

        {/*
          The city, geocoded. LocationPicker is the app's existing Mapbox
          search — the same component the post composer and profile editing
          use — so a city picked here is the same Location row the player's
          profile will point at after launch.

          Wrapped in `.locationField` rather than styled: the dropdown is
          absolutely positioned inside the picker's own root, and the wrapper
          only supplies the label and the stacking context that keeps the list
          above the fields below it.
        */}
        <div className={styles.locationField}>
          <label className={styles.fieldLabel} htmlFor="join-location">
            Where do you play?
          </label>
          <LocationPicker
            inputId="join-location"
            value={city}
            onChange={(picked) => {
              setCity(picked)
              setLocationError(null)
            }}
            placeholder="Search your city"
            disabled={busy}
            error={locationError ?? undefined}
          />
        </div>

        <Select
          label="Position"
          placeholder="Select your position"
          options={[...POSITIONS]}
          {...register("position")}
          error={errors.position?.message}
        />

        <Select
          label="Level"
          placeholder="Where you've played"
          options={[...LEVELS]}
          {...register("level")}
          error={errors.level?.message}
        />

        <div>
          <Input
            label="Instagram"
            placeholder="@yourhandle"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="next"
            {...register("instagram")}
            error={errors.instagram?.message}
          />
          {!errors.instagram && (
            <p className={styles.helper}>So we can match your clips to you.</p>
          )}
        </div>

        <Input
          label="Club or academy"
          placeholder="Kozhikode FC"
          autoComplete="organization"
          enterKeyHint="done"
          {...register("club_or_academy")}
          error={errors.club_or_academy?.message}
        />

        {/*
          Honeypot — hidden from people, left in the DOM for the things that
          fill every input they find. Off-screen (not `display: none`), out of
          the tab order, hidden from screen readers, and autofill told to leave
          it alone so a browser cannot trip it on somebody's behalf.
        */}
        <div className={styles.honeypot} aria-hidden="true">
          <label htmlFor="website">Website</label>
          <input
            id="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            {...register("website")}
          />
        </div>

        {formError && (
          <p className={styles.errorMsg} role="alert">
            <Icon icon="mdi:alert-circle-outline" width={12} height={12} />
            {formError}
          </p>
        )}

        <div className={styles.formCta}>
          <Button
            type="submit"
            variant="brand"
            size="lg"
            fullWidth
            loading={busy}
            disabled={busy}
          >
            {busy ? "Registering…" : "Register"}
          </Button>
        </div>

        <p className={styles.formFoot}>
          We&apos;ll only message you about Goatza. No spam, ever.
        </p>
      </form>
    </section>
  )
}
