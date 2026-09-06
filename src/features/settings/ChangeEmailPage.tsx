"use client"

/**
 * ChangeEmailPage — move the account to a different sign-in address.
 *
 * Two server round trips, and this screen sequences them: step 1 proves the
 * current password and has a code mailed to the NEW address, step 2 spends the
 * code. Nothing is written until step 2 succeeds, so abandoning halfway leaves
 * the account exactly as it was.
 *
 * Both calls draw on ONE budget of five per hour
 * (accounts/throttles.py::EmailChangeThrottle) — which is why resend sits
 * behind a cooldown, and why a 429 puts the screen into a state that stops
 * offering buttons that cannot succeed.
 *
 * The confirm call sends ONLY the code. The address it applies to is held
 * server-side; this screen has no way to change it after step 1, which is the
 * point.
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Icon } from "@iconify/react"
import { toast } from "sonner"

import { BackHeader, Button, Input } from "@/shared/components/ui"
import { useMyProfile } from "@/features/profile/hooks/useProfileQueries"
import {
  useConfirmEmailChange,
  useInitiateEmailChange,
} from "./hooks/useEmailChange"
import {
  OTP_MAX_LENGTH,
  OTP_MIN_LENGTH,
  readEmailChangeError,
  type EmailChangeErrorCode,
  type EmailChangeFailure,
} from "./services/emailChange.api"
import styles from "./ChangeEmailPage.module.css"

// ── Schemas ──────────────────────────────────────────────────

const requestSchema = z.object({
  password: z.string().min(1, "Enter your current password"),
  new_email: z
    .string()
    .min(1, "Enter your new email")
    .email("Enter a valid email"),
})

const codeSchema = z.object({
  otp: z
    .string()
    .min(OTP_MIN_LENGTH, "Enter the code")
    .max(OTP_MAX_LENGTH, "Code too long")
    .regex(/^\d+$/, "Code must be numeric"),
})

type RequestFields = z.infer<typeof requestSchema>
type CodeFields = z.infer<typeof codeSchema>

// ── Error codes → where they belong ──────────────────────────
// Same shape as CHANGE_PASSWORD_ERRORS next door: the API owns a stable code,
// the human wording lives here. `password_not_set` is absent on purpose — it
// is not a field error, it is a redirect to the forgot-password flow.

type FieldRefusal = { field: keyof RequestFields; message: string }

const REQUEST_FIELD_ERRORS: Partial<
  Record<EmailChangeErrorCode, FieldRefusal>
> = {
  invalid_password: {
    field: "password",
    message: "Current password is incorrect",
  },
  invalid_email: { field: "new_email", message: "Enter a valid email" },
  same_email: {
    field: "new_email",
    message: "This is already your email address",
  },
  email_taken: {
    field: "new_email",
    message: "That email is already in use on another account",
  },
}

/**
 * Seconds between resends.
 *
 * Under the server's five-an-hour, deliberately: the limit is not what this
 * guards against. A code takes a few seconds to arrive, and a button that can
 * be hit three times while waiting mails three codes and invalidates the first
 * two — the user then types the one that came first and is told it is wrong.
 */
const RESEND_COOLDOWN_SECONDS = 60

// ── The permanent caution ────────────────────────────────────

/**
 * Shown on BOTH steps, and never dismissed.
 *
 * Google sign-in matches accounts by email (get_or_create in the backend's
 * user_google_auth_views.py), so after this change the Google button no longer
 * finds this account. That is not an error state to surface once — it is a
 * lasting fact about how they sign in from now on.
 */
function GoogleCaution() {
  return (
    <p className={styles.caution}>
      <span className={styles.cautionIcon} aria-hidden="true">
        <Icon icon="mdi:information-outline" width={15} height={15} />
      </span>
      <span>
        Signed in with Google? Google sign-in is tied to your email — after
        changing it, sign in with your new email and password.
      </span>
    </p>
  )
}

/**
 * The API-level banner.
 *
 * `password_not_set` gets a link rather than a sentence: that account has no
 * password to type, so the only useful thing the screen can do is send them to
 * the flow that gives them one.
 */
function ApiErrorBanner({ failure }: { failure: EmailChangeFailure }) {
  const needsPassword =
    failure.kind === "code" && failure.code === "password_not_set"

  return (
    <p className={styles.apiError} role="alert">
      <span className={styles.apiErrorIcon} aria-hidden="true">
        <Icon icon="mdi:alert-circle-outline" width={15} height={15} />
      </span>
      <span>
        {failure.message}
        {needsPassword && (
          <>
            {" "}
            <Link href="/auth/forgot-password" className={styles.apiErrorLink}>
              Set a password
            </Link>
          </>
        )}
      </span>
    </p>
  )
}

// ── Page ─────────────────────────────────────────────────────

type Step = "request" | "verify"

export default function ChangeEmailPage() {
  const router = useRouter()
  const { data: profile } = useMyProfile()

  const initiate = useInitiateEmailChange()
  const confirm = useConfirmEmailChange()

  const [step, setStep] = useState<Step>("request")
  const [sentTo, setSentTo] = useState("")
  const [failure, setFailure] = useState<EmailChangeFailure | null>(null)

  /**
   * The credentials step 1 was accepted with, kept so resend can repeat the
   * same call — initiate takes the password every time, by design.
   *
   * In component state, and nowhere else: it lives exactly as long as this
   * mounted screen, the same as the form field it came from.
   */
  const [credentials, setCredentials] = useState<RequestFields | null>(null)

  const [cooldown, setCooldown] = useState(0)

  // Out of attempts for the hour. Both steps' buttons stay down rather than
  // inviting a retry that cannot succeed.
  const throttled = failure?.kind === "throttled"

  const requestForm = useForm<RequestFields>({
    resolver: zodResolver(requestSchema),
    defaultValues: { password: "", new_email: "" },
  })

  const codeForm = useForm<CodeFields>({
    resolver: zodResolver(codeSchema),
    defaultValues: { otp: "" },
  })

  // One interval for the whole cooldown, cleared when it reaches zero or the
  // screen goes.
  useEffect(() => {
    if (cooldown <= 0) return

    const timer = setInterval(
      () => setCooldown((seconds) => Math.max(0, seconds - 1)),
      1000
    )
    return () => clearInterval(timer)
  }, [cooldown])

  // ── Step 1 ─────────────────────────────────────────────────

  /**
   * Mail a code, returning the refusal that belongs on an INPUT rather than
   * writing it: step 1 has those inputs on screen, resend does not, and a
   * message written to a form nobody is looking at is a resend that silently
   * does nothing. Everything else (the banner cases) is handled here, because
   * the banner is on both steps.
   */
  const sendCode = async (
    values: RequestFields
  ): Promise<FieldRefusal | null | "sent"> => {
    setFailure(null)

    try {
      const data = await initiate.mutateAsync({
        new_email: values.new_email.trim(),
        password: values.password,
      })

      setCredentials(values)
      setSentTo(data.sent_to)
      setCooldown(RESEND_COOLDOWN_SECONDS)
      setStep("verify")
      return "sent"
    } catch (err) {
      const next = readEmailChangeError(err)

      if (next.kind === "code") {
        const onField = REQUEST_FIELD_ERRORS[next.code]
        if (onField) return onField
      }

      // password_not_set, throttled, offline, 5xx — all banner cases.
      setFailure(next)
      return null
    }
  }

  const onRequest = requestForm.handleSubmit(async (values) => {
    const refusal = await sendCode(values)

    if (refusal && refusal !== "sent") {
      requestForm.setError(refusal.field, {
        type: "server",
        message: refusal.message,
      })
    }
  })

  // ── Resend ─────────────────────────────────────────────────

  const onResend = async () => {
    if (!credentials || cooldown > 0 || initiate.isPending) return

    const refusal = await sendCode(credentials)

    if (refusal === "sent") {
      // The previous code is dead the moment a new one is issued, so clearing
      // the field is the honest state rather than a courtesy.
      codeForm.reset({ otp: "" })
      toast.success("We sent a new code")
      return
    }

    // The address stopped being available while the user was mid-flow (someone
    // else claimed it). There is no field on this step to hang that on, so it
    // goes in the banner, next to the button that sends them back to pick
    // another one.
    if (refusal) setFailure({ kind: "message", message: refusal.message })
  }

  // ── Step 2 ─────────────────────────────────────────────────

  const onVerify = codeForm.handleSubmit(async (values) => {
    setFailure(null)

    try {
      await confirm.mutateAsync(values.otp)

      toast.success("Email address updated")
      router.push("/settings")
    } catch (err) {
      const next = readEmailChangeError(err)

      if (next.kind === "code" && next.code === "invalid_code") {
        codeForm.setError("otp", {
          type: "server",
          message: "That code is incorrect or has expired",
        })
        return
      }

      setFailure(next)
    }
  })

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      <BackHeader title="Change email" fallback="/settings" />

      {step === "request" ? (
        <p className={styles.intro}>
          You sign in with{" "}
          <span className={styles.currentEmail}>
            {profile?.email ?? "your email"}
          </span>
          . We&apos;ll send a code to your new address to confirm it&apos;s
          yours before anything changes.
        </p>
      ) : (
        <p className={styles.sentTo}>
          <Icon
            icon="mdi:email-outline"
            width={15}
            height={15}
            aria-hidden="true"
          />
          We sent a code to <strong>{sentTo}</strong>
        </p>
      )}

      <GoogleCaution />

      {failure && <ApiErrorBanner failure={failure} />}

      {step === "request" ? (
        <form onSubmit={onRequest} className={styles.form} noValidate>
          <Input
            label="Current password"
            type="password"
            placeholder="Enter your current password"
            autoComplete="current-password"
            leftIcon={<Icon icon="mdi:lock-outline" width={18} height={18} />}
            {...requestForm.register("password")}
            error={requestForm.formState.errors.password?.message}
          />

          <Input
            label="New email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            leftIcon={<Icon icon="mdi:email-outline" width={18} height={18} />}
            {...requestForm.register("new_email")}
            error={requestForm.formState.errors.new_email?.message}
          />

          <Button
            variant="brand"
            size="lg"
            fullWidth
            type="submit"
            loading={initiate.isPending}
            disabled={throttled}
          >
            Send code
          </Button>
        </form>
      ) : (
        <form onSubmit={onVerify} className={styles.form} noValidate>
          <Input
            label="One-time password"
            type="text"
            placeholder="Enter OTP"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={OTP_MAX_LENGTH}
            leftIcon={
              <Icon icon="mdi:shield-key-outline" width={18} height={18} />
            }
            {...codeForm.register("otp")}
            error={codeForm.formState.errors.otp?.message}
          />

          <div className={styles.resendRow}>
            <span>Didn&apos;t get it?</span>
            <button
              type="button"
              className={styles.resendBtn}
              onClick={onResend}
              disabled={cooldown > 0 || initiate.isPending || throttled}
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
            </button>
          </div>

          <Button
            variant="brand"
            size="lg"
            fullWidth
            type="submit"
            loading={confirm.isPending}
            disabled={throttled}
          >
            Confirm new email
          </Button>

          <button
            type="button"
            className={styles.backBtn}
            onClick={() => {
              setFailure(null)
              setStep("request")
            }}
          >
            Use a different email
          </button>
        </form>
      )}
    </div>
  )
}
