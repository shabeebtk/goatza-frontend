"use client"

import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { Icon } from "@iconify/react"
import { z } from "zod"

import { Button, Input } from "@/shared/components/ui"

import { APPROVE_MEANING, CONFIRM_18_LABEL } from "../../guardianCopy"
import type { GuardianApprovalPayload } from "../../types"
import styles from "./ParentApprovalForm.module.css"

/**
 * The two questions an approval asks: who are you, and are you their parent
 * or guardian and 18 or older.
 *
 * ONE SURFACE. A parent who got an email answers this on a page with no
 * account behind it (the public consent page), and nowhere else — there is no
 * on-device approval any more. It is still its own component rather than
 * inline in that page: the fields, the wording, the validation and what counts
 * as consent are the record, and keeping them apart from the page's framing
 * (the child's name, the data list, the decline button) is what keeps a layout
 * change from quietly becoming a change to what a parent agreed to.
 *
 * NO DATE OF BIRTH. It was asked for once, optionally, and bought nothing the
 * tick below does not already claim — the server no longer reads it.
 */

const approvalSchema = z.object({
  parentName: z.string().trim().min(1, "Enter your name"),

  // z.literal(true), not z.boolean(): an unticked box is `false`, which is a
  // perfectly valid boolean and would sail through. The only value that passes
  // is a deliberate tick — same rule as the signup consent box.
  confirm18: z.literal(true, {
    error: "Please confirm this to continue",
  }),
})

type ApprovalFields = z.infer<typeof approvalSchema>

interface ParentApprovalFormProps {
  /**
   * Throw to show an error; the form stays filled in so nothing has to be
   * retyped. Resolving is the surface's cue to move on.
   */
  onApprove: (payload: GuardianApprovalPayload) => Promise<void>
  /**
   * Pre-fills "Your name" — the name the child gave for this parent, which the
   * email already greeted them with. Still editable and still required: a
   * pre-filled name is a convenience, and what they submit is what is
   * recorded as what THEY said.
   */
  defaultName?: string
  /** "Approve" today; a prop so a second surface could differ. */
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
  defaultName = "",
  submitLabel = "Approve",
  secondaryAction,
  busy = false,
}: ParentApprovalFormProps) {
  const [apiError, setApiError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ApprovalFields>({
    resolver: zodResolver(approvalSchema),
    defaultValues: {
      parentName: defaultName,
      // Starts false and is never seeded from anywhere. A pre-ticked box is
      // not consent.
      confirm18: false as unknown as true,
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
