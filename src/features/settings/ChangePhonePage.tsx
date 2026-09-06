"use client"

/**
 * ChangePhonePage — one field and a save.
 *
 * No verification step, deliberately: phone is not a login identifier, so
 * there is nothing to prove yet (see the backend's phone_change_service.py).
 * What the screen DOES have to be honest about is that clearing the field
 * removes the number, and that the server will refuse to remove it from an
 * account that has no email — a rule that comes from a DB constraint, not
 * from anything the form can see.
 */

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Icon } from "@iconify/react"
import { toast } from "sonner"

import { BackHeader, Button, Input } from "@/shared/components/ui"
import { useMyPhone, useUpdatePhone } from "./hooks/usePhoneChange"
import {
  PHONE_MAX_LENGTH,
  isValidPhone,
  readPhoneChangeError,
  type PhoneChangeFailure,
} from "./services/phoneChange.api"
import styles from "./ChangePhonePage.module.css"

// ── Schema ───────────────────────────────────────────────────
// Mirrors utils/validations.py::is_valid_phone. An EMPTY field is valid and
// means "remove it" — the only refusal for that comes from the server, which
// is the only place that knows whether an email remains.

const schema = z.object({
  phone: z
    .string()
    .trim()
    .refine((value) => value === "" || isValidPhone(value), {
      message: `Enter 8–15 digits, optionally starting with + (max ${PHONE_MAX_LENGTH} characters)`,
    }),
})

type PhoneFields = z.infer<typeof schema>

export default function ChangePhonePage() {
  const router = useRouter()
  const { data: current, isPending: loading } = useMyPhone()
  const updatePhone = useUpdatePhone()

  const [failure, setFailure] = useState<PhoneChangeFailure | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<PhoneFields>({
    resolver: zodResolver(schema),
    defaultValues: { phone: "" },
  })

  // The prefill arrives after the first render, so it is seeded here rather
  // than through defaultValues. Only once the query has resolved — resetting
  // on every render would fight anything the user has already typed.
  useEffect(() => {
    if (current) reset({ phone: current.phone ?? "" })
  }, [current, reset])

  const onSubmit = handleSubmit(async (values) => {
    setFailure(null)

    const next = values.phone.trim()

    try {
      // null, not "" — an empty string in a unique column would collide with
      // every other account that cleared its number.
      const saved = await updatePhone.mutateAsync(next === "" ? null : next)

      toast.success(
        saved.phone ? "Phone number updated" : "Phone number removed"
      )
      router.push("/settings")
    } catch (err) {
      const failed = readPhoneChangeError(err)

      // A bad value or a collision belongs under the field; "you'd have no way
      // to sign in" is about the account, so it goes in the banner.
      if (
        failed.kind === "code" &&
        (failed.code === "invalid_phone" || failed.code === "phone_taken")
      ) {
        setError("phone", { type: "server", message: failed.message })
        return
      }

      setFailure(failed)
    }
  })

  return (
    <div className={styles.page}>
      <BackHeader title="Phone number" fallback="/settings" />

      <p className={styles.intro}>
        Used to reach you about your account. Clear the field and save to remove
        it.
      </p>

      {failure && (
        <p className={styles.apiError} role="alert">
          <span className={styles.apiErrorIcon} aria-hidden="true">
            <Icon icon="mdi:alert-circle-outline" width={15} height={15} />
          </span>
          <span>{failure.message}</span>
        </p>
      )}

      <form onSubmit={onSubmit} className={styles.form} noValidate>
        <Input
          label="Phone number"
          type="tel"
          placeholder="+919876543210"
          inputMode="tel"
          autoComplete="tel"
          maxLength={PHONE_MAX_LENGTH}
          disabled={loading}
          leftIcon={<Icon icon="mdi:phone-outline" width={18} height={18} />}
          {...register("phone")}
          error={errors.phone?.message}
        />

        <Button
          variant="brand"
          size="lg"
          fullWidth
          type="submit"
          loading={updatePhone.isPending}
          disabled={loading}
        >
          Save
        </Button>
      </form>
    </div>
  )
}
