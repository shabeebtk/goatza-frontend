"use client"

import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"
import { Icon } from "@iconify/react"
import { z } from "zod"

import { Button, Input } from "@/shared/components/ui"
import DateOfBirthInput, {
  parseIsoDate,
  EARLIEST_BIRTH_YEAR,
} from "@/shared/components/DateOfBirthInput"

import {
  APPROVE_MEANING,
  CONFIRM_18_LABEL,
  PARENT_DOB_HINT,
} from "../../guardianCopy"
import type { GuardianApprovalPayload } from "../../types"
import styles from "./ParentApprovalForm.module.css"

/**
 * The three questions an approval asks, wherever it is asked.
 *
 * TWO SURFACES, ONE FORM. A parent standing next to their child answers this on
 * the child's phone (HandToParentStep); a parent who got an email answers it on
 * a page with no account behind it (the public consent page). Those screens
 * frame it differently and reach different endpoints, but the questions, the
 * wording, the validation and what counts as consent must be identical — a
 * second copy would eventually ask for something slightly different, and then
 * the two records would mean slightly different things.
 *
 * So the surfaces own the framing and the submit; this owns the fields.
 */

/**
 * Optional, unlike everywhere else this component appears in the app.
 *
 * The parent's own date of birth is a nice-to-have — it corroborates the tick
 * above it — and a required field here would stop an approval that is otherwise
 * complete and honest. So "" passes, and anything typed has to be a real past
 * date, which is exactly the set of mistakes the person can see for themselves.
 */
const optionalBirthdate = z
  .string()
  .refine(
    (value) => value === "" || parseIsoDate(value) !== null,
    { message: "That date doesn't exist — check the day and month" },
  )
  .refine(
    (value) => {
      if (value === "") return true
      const parts = parseIsoDate(value)
      return parts === null || parts.year >= EARLIEST_BIRTH_YEAR
    },
    { message: "Check the year" },
  )
  .refine(
    (value) => {
      if (value === "") return true
      const parts = parseIsoDate(value)
      if (parts === null) return true

      const today = new Date()
      today.setHours(0, 0, 0, 0)
      return new Date(parts.year, parts.month - 1, parts.day) <= today
    },
    { message: "Date of birth can't be in the future" },
  )

const approvalSchema = z.object({
  parentName: z.string().trim().min(1, "Enter your name"),

  // z.literal(true), not z.boolean(): an unticked box is `false`, which is a
  // perfectly valid boolean and would sail through. The only value that passes
  // is a deliberate tick — same rule as the signup consent box.
  confirm18: z.literal(true, {
    error: "Please confirm this to continue",
  }),

  birthdate: optionalBirthdate,
})

type ApprovalFields = z.infer<typeof approvalSchema>

interface ParentApprovalFormProps {
  /**
   * Throw to show an error; the form stays filled in so nothing has to be
   * retyped. Resolving is the surface's cue to move on.
   */
  onApprove: (payload: GuardianApprovalPayload) => Promise<void>
  /** "Approve" on both surfaces today; a prop so a third one can differ. */
  submitLabel?: string
  /** Decline, on the surfaces that offer it. Rendered under the button. */
  secondaryAction?: React.ReactNode
  /** Set while a sibling action (decline) is running, to lock this one out. */
  busy?: boolean
}

/** The backend's message, or something plain. */
function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message === "network") {
    return "You seem to be offline. Check your connection and try again."
  }

  if (err instanceof Error && err.message) return err.message

  const data = (err as { response?: { data?: { message?: string } } })?.response
    ?.data

  return data?.message || "That didn't go through. Please try again."
}

export default function ParentApprovalForm({
  onApprove,
  submitLabel = "Approve",
  secondaryAction,
  busy = false,
}: ParentApprovalFormProps) {
  const [apiError, setApiError] = useState<string | null>(null)

  const {
    control,
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ApprovalFields>({
    resolver: zodResolver(approvalSchema),
    defaultValues: {
      parentName: "",
      // Starts false and is never seeded from anywhere. A pre-ticked box is
      // not consent.
      confirm18: false as unknown as true,
      birthdate: "",
    },
  })

  // Watched so the button un-dims the instant the box is ticked, rather than
  // on the next submit attempt.
  const hasConfirmed = watch("confirm18") === true
  const locked = isSubmitting || busy

  const onSubmit = handleSubmit(async (values) => {
    setApiError(null)

    try {
      await onApprove({
        parent_name: values.parentName.trim(),
        confirm_18_plus: true,
        // Absent, not empty. An empty string is a value the server would have
        // to interpret; leaving the key off says plainly that it was not given.
        ...(values.birthdate ? { parent_birthdate: values.birthdate } : {}),
      })
    } catch (err) {
      setApiError(errorMessage(err))
    }
  })

  return (
    <form onSubmit={onSubmit} className={styles.form} noValidate>
      <Input
        label="Your name"
        placeholder="Your full name"
        autoComplete="name"
        disabled={locked}
        leftIcon={<Icon icon="mdi:account-outline" width={18} height={18} />}
        {...register("parentName")}
        error={errors.parentName?.message}
      />

      <div className={styles.confirmField}>
        <label className={styles.confirmLabel}>
          <input
            type="checkbox"
            className={styles.confirmBox}
            disabled={locked}
            {...register("confirm18")}
          />
          <span className={styles.confirmText}>{CONFIRM_18_LABEL}</span>
        </label>

        {errors.confirm18 && (
          <p className={styles.fieldError} role="alert">
            {errors.confirm18.message}
          </p>
        )}
      </div>

      <Controller
        control={control}
        name="birthdate"
        render={({ field, fieldState }) => (
          <DateOfBirthInput
            value={field.value ?? ""}
            onChange={field.onChange}
            onBlur={field.onBlur}
            disabled={locked}
            error={fieldState.error?.message}
            hint={PARENT_DOB_HINT}
          />
        )}
      />

      {apiError && (
        <p className={styles.apiError} role="alert">
          <Icon icon="mdi:alert-circle-outline" width={15} height={15} />
          {apiError}
        </p>
      )}

      <p className={styles.meaning}>{APPROVE_MEANING}</p>

      <Button
        variant="brand"
        size="lg"
        fullWidth
        type="submit"
        loading={isSubmitting}
        // The visible half of the schema rule above, not the enforcement.
        disabled={!hasConfirmed || locked}
      >
        {submitLabel}
      </Button>

      {secondaryAction}
    </form>
  )
}
