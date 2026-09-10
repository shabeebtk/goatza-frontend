"use client"

import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"
import { Icon } from "@iconify/react"
import { z } from "zod"

import { Button, Input } from "@/shared/components/ui"

import {
  HAND_TO_PARENT_SUBHEADING,
  WITHDRAWN_HEADING,
  WITHDRAWN_SUBHEADING,
} from "../../guardianCopy"
import { submitGuardianDetailsApi } from "../../services/guardian.api"
import {
  ENABLED_CONTACT_CHANNELS,
  type GuardianConsentStatus,
  type GuardianContactChannel,
  type GuardianMode,
} from "../../types"
import ParentContactInput from "../ParentContactInput/ParentContactInput"
import styles from "./ParentDetailsStep.module.css"

/**
 * Step one of the guardian flow: who is your parent or guardian, and how do we
 * reach them.
 *
 * Shown straight after the OTP — or straight after the Google callback — to any
 * account the server came back on with `guardian_required`. The child is signed
 * in by this point and gated, so this is not a signup form and there is no way
 * back to one; the only exits are forward or closing the tab.
 *
 * NO AGE IS NAMED ON THIS SCREEN. Not in the heading, not in the body. The
 * account already has a birthdate on file that the user cannot edit, so saying
 * "you are under 18" would buy nothing and would teach the next person which
 * number to type. It says what happens next instead, which is the only part
 * they can act on.
 */

const detailsSchema = z
  .object({
    parentName: z
      .string()
      .trim()
      .min(1, "Enter your parent or guardian's name"),

    // Both channels are valid values even though only one is offered today —
    // the schema must not be the thing that has to change when phone is
    // enabled. See ENABLED_CONTACT_CHANNELS.
    channel: z.enum(["email", "phone"]),

    contact: z.string().trim().min(1, "We need a way to reach them"),
  })
  .superRefine((values, ctx) => {
    if (values.channel === "email") {
      // Parsed rather than regexed here so the message matches every other
      // email field in the app.
      const parsed = z.string().email().safeParse(values.contact)
      if (!parsed.success) {
        ctx.addIssue({
          code: "custom",
          path: ["contact"],
          message: "Enter a valid email address",
        })
      }
      return
    }

    // Deliberately loose: digits, spaces, brackets, dashes and an optional
    // leading +, seven digits or more. Real numbers are written a dozen ways
    // and the server does the authoritative parse — a strict client pattern
    // here would reject valid numbers before they ever reach it.
    const digits = values.contact.replace(/\D/g, "")
    if (digits.length < 7 || !/^\+?[\d\s()-]+$/.test(values.contact)) {
      ctx.addIssue({
        code: "custom",
        path: ["contact"],
        message: "Enter a valid phone number",
      })
    }
  })

type DetailsFields = z.infer<typeof detailsSchema>

/** Extracts the backend's message, falling back to something plain. */
function errorMessage(err: unknown): string {
  const data = (
    err as { response?: { data?: { message?: string; detail?: string } } }
  )?.response?.data

  return (
    data?.message ||
    data?.detail ||
    "That didn't go through. Please try again."
  )
}

interface ParentDetailsStepProps {
  /**
   * Why the account is locked. `withdrawn` gets its own two sentences — see
   * WITHDRAWN_HEADING. Everything below them is the same form either way,
   * because the action is the same: name someone and ask.
   */
  status?: GuardianConsentStatus | null
  /**
   * Handed the mode the server chose, which decides the next screen, plus the
   * masked address a link went to — the waiting screen names it, and this is
   * the same masked string /user/details will return later, so the two screens
   * cannot end up spelling one value two ways.
   */
  onSubmitted: (mode: GuardianMode, maskedContact: string | null) => void
}

export default function ParentDetailsStep({
  onSubmitted,
  status,
}: ParentDetailsStepProps) {
  const relocked = status === "withdrawn"
  const [apiError, setApiError] = useState<string | null>(null)

  const {
    control,
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<DetailsFields>({
    resolver: zodResolver(detailsSchema),
    defaultValues: {
      parentName: "",
      // The first enabled channel, not a hard-coded "email" — so the day the
      // array is reordered this follows.
      channel: ENABLED_CONTACT_CHANNELS[0],
      contact: "",
    },
  })

  const channel = watch("channel")

  const onSubmit = handleSubmit(async (values) => {
    setApiError(null)

    try {
      const { mode, masked_contact } = await submitGuardianDetailsApi({
        parent_name: values.parentName.trim(),
        // EXACTLY ONE of the two. The server 400s on both and on neither, and
        // the unused key is absent rather than empty — an empty string is a
        // value it would have to decide the meaning of.
        ...(values.channel === "email"
          ? { parent_email: values.contact.trim() }
          : { parent_phone: values.contact.trim() }),
      })

      onSubmitted(mode, masked_contact)
    } catch (err) {
      setApiError(errorMessage(err))
    }
  })

  return (
    <div className={styles.step}>
      <p className={styles.title}>
        {relocked ? WITHDRAWN_HEADING : "Ask a parent or guardian"}
      </p>
      {/* The shared sentence, not a second copy of it — this screen and the
          hand-the-phone one say the same thing and must keep saying it. */}
      <p className={styles.subtitle}>
        {relocked
          ? WITHDRAWN_SUBHEADING
          : `${HAND_TO_PARENT_SUBHEADING} Tell us who to ask.`}
      </p>

      <form onSubmit={onSubmit} className={styles.form} noValidate>
        <Input
          label="Parent or guardian's name"
          placeholder="Their full name"
          autoComplete="off"
          leftIcon={<Icon icon="mdi:account-outline" width={18} height={18} />}
          disabled={isSubmitting}
          {...register("parentName")}
          error={errors.parentName?.message}
        />

        <Controller
          control={control}
          name="contact"
          render={({ field }) => (
            <ParentContactInput
              channel={channel}
              onChannelChange={(next: GuardianContactChannel) => {
                setValue("channel", next)
                // The old value belongs to the old channel. Keeping it would
                // put an email address in a phone field and fail validation
                // for a reason the switcher just caused.
                setValue("contact", "")
              }}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              disabled={isSubmitting}
              error={errors.contact?.message}
            />
          )}
        />

        {apiError && (
          <p className={styles.apiError} role="alert">
            <Icon icon="mdi:alert-circle-outline" width={15} height={15} />
            {apiError}
          </p>
        )}

        <Button
          variant="brand"
          size="lg"
          fullWidth
          type="submit"
          loading={isSubmitting}
          style={{ marginTop: "var(--space-2)" } as React.CSSProperties}
        >
          Continue →
        </Button>
      </form>
    </div>
  )
}
