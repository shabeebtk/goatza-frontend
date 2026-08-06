"use client"

/**
 * ChangePasswordPage — set a new password without leaving the app.
 *
 * The backend revokes every OTHER session and re-issues this one, so on
 * success we swap the new access token into the store (see useChangePassword)
 * and simply go back — no re-login, no flash of the auth screen.
 */

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Icon } from "@iconify/react"
import { toast } from "sonner"
import { BackHeader, Button, Input } from "@/shared/components/ui"
import { useChangePassword } from "./hooks/useChangePassword"
import type { ChangePasswordErrorCode } from "./services/settings.api"
import styles from "./ChangePasswordPage.module.css"

// ── Schema ───────────────────────────────────────────────────
// Mirrors utils/validations.py::is_valid_password — non-empty, min 6 chars.
// Keep the two in step: anything the backend rejects should never get sent.

const MIN_PASSWORD_LENGTH = 6

const schema = z
  .object({
    current_password: z.string().min(1, "Enter your current password"),
    new_password: z
      .string()
      .min(
        MIN_PASSWORD_LENGTH,
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
      ),
    confirm_password: z.string().min(1, "Please confirm your new password"),
  })
  .refine((v) => v.new_password !== v.current_password, {
    message: "New password must be different from your current one",
    path: ["new_password"],
  })
  .refine((v) => v.new_password === v.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"],
  })

type ChangePasswordFields = z.infer<typeof schema>

// ── Backend error codes ──────────────────────────────────────
// The endpoint returns a stable `code` under `data`; the human wording lives
// here so the API stays free to reword its own messages.

const CHANGE_PASSWORD_ERRORS: Record<
  ChangePasswordErrorCode,
  { field: keyof ChangePasswordFields; message: string }
> = {
  missing_fields: {
    field: "current_password",
    message: "Please fill in every field",
  },
  invalid_current_password: {
    field: "current_password",
    message: "Current password is incorrect",
  },
  invalid_new_password: {
    field: "new_password",
    message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
  },
  same_password: {
    field: "new_password",
    message: "New password must be different from your current one",
  },
}

type ApiErrorBody = { message?: string; data?: { code?: string } }

function readApiError(err: unknown): { code?: string; message?: string } {
  const response = (err as { response?: { data?: ApiErrorBody } })?.response
  return { code: response?.data?.data?.code, message: response?.data?.message }
}

// ── Page ─────────────────────────────────────────────────────

export default function ChangePasswordPage() {
  const router = useRouter()
  const changePassword = useChangePassword()
  const [apiError, setApiError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ChangePasswordFields>({
    resolver: zodResolver(schema),
    defaultValues: {
      current_password: "",
      new_password: "",
      confirm_password: "",
    },
  })

  const onSubmit = handleSubmit(async (values) => {
    setApiError(null)

    try {
      await changePassword.mutateAsync({
        current_password: values.current_password,
        new_password: values.new_password,
      })

      toast.success("Password changed successfully")
      router.back()
    } catch (err) {
      const { code, message } = readApiError(err)
      const known = code
        ? CHANGE_PASSWORD_ERRORS[code as ChangePasswordErrorCode]
        : undefined

      if (known) {
        setError(known.field, { type: "server", message: known.message })
        return
      }

      // Anything else (throttled, offline, 5xx) — show what the API said.
      setApiError(message ?? "Something went wrong. Please try again.")
    }
  })

  return (
    <div className={styles.page}>
      <BackHeader title="Change password" fallback="/settings" />

      <p className={styles.intro}>
        You&apos;ll stay signed in on this device. Every other device is signed
        out.
      </p>

      {apiError && (
        <p className={styles.apiError} role="alert">
          <Icon icon="mdi:alert-circle-outline" width={15} height={15} />
          {apiError}
        </p>
      )}

      <form onSubmit={onSubmit} className={styles.form} noValidate>
        <div className={styles.field}>
          <Input
            label="Current password"
            type="password"
            placeholder="Enter your current password"
            autoComplete="current-password"
            leftIcon={<Icon icon="mdi:lock-outline" width={18} height={18} />}
            {...register("current_password")}
            error={errors.current_password?.message}
          />
          {/* Google sign-ups were given a random password they have never seen —
              the OTP reset flow is how they set one they know. */}
          <Link href="/auth/forgot-password" className={styles.forgotLink}>
            Forgot your current password?
          </Link>
        </div>

        <Input
          label="New password"
          type="password"
          placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
          autoComplete="new-password"
          leftIcon={<Icon icon="mdi:lock-plus-outline" width={18} height={18} />}
          {...register("new_password")}
          error={errors.new_password?.message}
        />

        <Input
          label="Confirm new password"
          type="password"
          placeholder="Re-enter your new password"
          autoComplete="new-password"
          leftIcon={<Icon icon="mdi:lock-check-outline" width={18} height={18} />}
          {...register("confirm_password")}
          error={errors.confirm_password?.message}
        />

        <Button
          variant="brand"
          size="lg"
          fullWidth
          type="submit"
          loading={changePassword.isPending}
        >
          Update password
        </Button>
      </form>
    </div>
  )
}
