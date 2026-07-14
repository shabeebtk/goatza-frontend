"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Icon } from "@iconify/react"
import { Button, Input } from "@/shared/components/ui"
import { useForgotPassword, useResetPassword } from "@/features/auth/hooks/useAuthMutations"
import styles from "../AuthCard/AuthCard.module.css"

// ── Zod schemas ──────────────────────────────────────────────

const emailSchema = z.object({
    email: z.string().min(1, "Email is required").email("Enter a valid email"),
})

const resetSchema = z
    .object({
        otp: z
            .string()
            .min(4, "Enter the OTP")
            .max(8, "OTP too long")
            .regex(/^\d+$/, "OTP must be numeric"),
        password: z
            .string()
            .min(8, "Password must be at least 8 characters")
            .regex(/[^a-zA-Z0-9]/, "Include at least one special character"),
        confirmPassword: z.string().min(1, "Please confirm your password"),
    })
    .refine((v) => v.password === v.confirmPassword, {
        message: "Passwords do not match",
        path: ["confirmPassword"],
    })

type EmailFields = z.infer<typeof emailSchema>
type ResetFields = z.infer<typeof resetSchema>

type Step = "request" | "reset" | "done"

// ── Helpers ──────────────────────────────────────────────────

/** Extract a human-readable message from an Axios error or unknown throw */
function extractErrorMessage(err: unknown): string {
    if (err && typeof err === "object") {
        const axiosErr = err as {
            response?: { data?: { message?: string; detail?: string; error?: string } }
        }
        const d = axiosErr.response?.data
        if (d?.message) return d.message
        if (d?.detail) return d.detail
        if (d?.error) return d.error
        const anyErr = err as { message?: string }
        if (anyErr.message) return anyErr.message
    }
    return "Something went wrong. Please try again."
}

// ── Component ────────────────────────────────────────────────

function ForgotPasswordCard() {
    const router = useRouter()

    const [step, setStep] = useState<Step>("request")
    const [email, setEmail] = useState("")
    const [apiError, setApiError] = useState<string | null>(null)

    const forgotPassword = useForgotPassword()
    const resetPassword = useResetPassword()

    const emailForm = useForm<EmailFields>({
        resolver: zodResolver(emailSchema),
        defaultValues: { email: "" },
    })

    const resetForm = useForm<ResetFields>({
        resolver: zodResolver(resetSchema),
        defaultValues: { otp: "", password: "", confirmPassword: "" },
    })

    // Once the password is reset, bounce back to the login page.
    useEffect(() => {
        if (step !== "done") return
        const t = setTimeout(() => router.push("/auth"), 2200)
        return () => clearTimeout(t)
    }, [step, router])

    // ── Step 1: request OTP ────────────────────────────────────

    const handleRequest = emailForm.handleSubmit(async (values) => {
        setApiError(null)
        try {
            const res = await forgotPassword.mutateAsync({ email: values.email })
            setEmail(res.email ?? values.email)
            setStep("reset")
        } catch (err) {
            setApiError(extractErrorMessage(err))
        }
    })

    // ── Step 2: verify OTP + set new password ──────────────────

    const handleReset = resetForm.handleSubmit(async (values) => {
        setApiError(null)
        try {
            await resetPassword.mutateAsync({
                email,
                otp: values.otp,
                new_password: values.password,
            })
            setStep("done")
        } catch (err) {
            setApiError(extractErrorMessage(err))
        }
    })

    // ── Render ─────────────────────────────────────────────────

    return (
        <div className={styles.heroAuthCard}>
            {/* ── Success ── */}
            {step === "done" ? (
                <div style={{ textAlign: "center" }}>
                    <span
                        aria-hidden="true"
                        style={{
                            display: "inline-flex",
                            marginBottom: "var(--space-3)",
                            color: "var(--color-brand)",
                        }}
                    >
                        <Icon icon="mdi:check-circle" width={48} height={48} />
                    </span>
                    <p className={styles.authCardTitle}>Password Reset</p>
                    <p className={styles.authCardSubtitle}>
                        Your password has been changed. Redirecting you to sign in…
                    </p>
                    <Button variant="brand" size="lg" fullWidth href="/auth">
                        Back to Sign In →
                    </Button>
                </div>
            ) : (
                <>
                    <Link href="/auth" className={styles.authBack} aria-label="Back to sign in">
                        <Icon icon="mdi:arrow-left" width={16} height={16} />
                        Back to Sign In
                    </Link>

                    <p className={styles.authCardTitle}>
                        {step === "request" ? "Forgot Password" : "Reset Password"}
                    </p>
                    <p className={styles.authCardSubtitle}>
                        {step === "request"
                            ? "Enter your email and we'll send you a one-time code to reset it."
                            : (
                                <>
                                    Enter the code sent to <strong>{email}</strong> and choose a new password.
                                </>
                            )}
                    </p>

                    {/* ── API-level error ── */}
                    {apiError && (
                        <p className={styles.authApiError} role="alert">
                            <Icon icon="mdi:alert-circle-outline" width={15} height={15} />
                            {apiError}
                        </p>
                    )}

                    {/* ── Step 1: request OTP ── */}
                    {step === "request" && (
                        <form onSubmit={handleRequest} className={styles.authForm} noValidate>
                            <Input
                                label="Email"
                                type="email"
                                placeholder="you@example.com"
                                autoComplete="email"
                                leftIcon={<Icon icon="mdi:email-outline" width={18} height={18} />}
                                {...emailForm.register("email")}
                                error={emailForm.formState.errors.email?.message}
                            />

                            <Button
                                variant="brand"
                                size="lg"
                                fullWidth
                                loading={forgotPassword.isPending}
                                type="submit"
                                style={{ marginTop: "var(--space-2)" } as React.CSSProperties}
                            >
                                Send Code →
                            </Button>
                        </form>
                    )}

                    {/* ── Step 2: verify + reset ── */}
                    {step === "reset" && (
                        <form onSubmit={handleReset} className={styles.authForm} noValidate>
                            <Input
                                label="One-time password"
                                placeholder="Enter OTP"
                                type="text"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                maxLength={8}
                                leftIcon={<Icon icon="mdi:shield-key-outline" width={18} height={18} />}
                                {...resetForm.register("otp")}
                                error={resetForm.formState.errors.otp?.message}
                            />

                            <Input
                                label="New password"
                                type="password"
                                placeholder="Create a strong password"
                                autoComplete="new-password"
                                leftIcon={<Icon icon="mdi:lock-outline" width={18} height={18} />}
                                {...resetForm.register("password")}
                                error={resetForm.formState.errors.password?.message}
                            />

                            <Input
                                label="Confirm new password"
                                type="password"
                                placeholder="Re-enter your password"
                                autoComplete="new-password"
                                leftIcon={<Icon icon="mdi:lock-check-outline" width={18} height={18} />}
                                {...resetForm.register("confirmPassword")}
                                error={resetForm.formState.errors.confirmPassword?.message}
                            />

                            <Button
                                variant="brand"
                                size="lg"
                                fullWidth
                                loading={resetPassword.isPending}
                                type="submit"
                                style={{ marginTop: "var(--space-2)" } as React.CSSProperties}
                            >
                                Reset Password →
                            </Button>
                        </form>
                    )}

                    <p className={styles.authFooterText} style={{ marginTop: "var(--space-3)" }}>
                        Remembered your password?{" "}
                        <Link href="/auth" className={styles.authFooterLink}>
                            Sign in
                        </Link>
                    </p>
                </>
            )}
        </div>
    )
}

export default ForgotPasswordCard
