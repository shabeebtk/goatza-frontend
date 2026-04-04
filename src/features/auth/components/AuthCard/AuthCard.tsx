"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { useSearchParams } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Icon } from "@iconify/react"
import { Button, Input, Select, Divider } from "@/shared/components/ui"
import { useLogin, useSignup, useVerifyOtp } from "@/features/auth/hooks/useAuthMutations"
import styles from "./AuthCard.module.css"
import { getGoogleLoginUrl } from "../../services/auth.api"


// ── Zod schemas ──────────────────────────────────────────────

const signInSchema = z.object({
    email: z.string().min(1, "Email is required").email("Enter a valid email"),
    password: z.string().min(1, "Password is required"),
})

const signUpSchema = z.object({
    Name: z.string().min(1, "Please enter your name"),
    email: z.string().min(1, "Email is required").email("Enter a valid email"),
    password: z
        .string()
        .min(8, "Password must be at least 8 characters")
        .regex(/[^a-zA-Z0-9]/, "Include at least one special character"),
    role: z.string().min(1, "Please select your role"),
})

const otpSchema = z.object({
    otp: z
        .string()
        .min(4, "Enter the OTP")
        .max(8, "OTP too long")
        .regex(/^\d+$/, "OTP must be numeric"),
})

type SignInFields = z.infer<typeof signInSchema>
type SignUpFields = z.infer<typeof signUpSchema>
type OtpFields = z.infer<typeof otpSchema>

type AuthMode = "signin" | "signup"

// ── Helpers ──────────────────────────────────────────────────

/** Extract a human-readable message from an Axios error or unknown throw */
function extractErrorMessage(err: unknown): string {
    if (err && typeof err === "object") {
        // Axios shape: err.response.data.message or .detail or .error
        const axiosErr = err as {
            response?: { data?: { message?: string; detail?: string; error?: string } }
        }
        const d = axiosErr.response?.data
        if (d?.message) return d.message
        if (d?.detail) return d.detail
        if (d?.error) return d.error
        // network / timeout
        const anyErr = err as { message?: string }
        if (anyErr.message) return anyErr.message
    }
    return "Something went wrong. Please try again."
}

// ── Component ────────────────────────────────────────────────

function AuthCard() {
    const router = useRouter()
    const searchParams = useSearchParams()

    const initialMode =
        searchParams.get("mode") === "signup" ? "signup" : "signin"
    const [mode, setMode] = useState<AuthMode>(initialMode)

    // OTP step state
    const [otpPending, setOtpPending] = useState(false)
    const [pendingEmail, setPendingEmail] = useState("")
    // API-level error (separate from field errors)
    const [apiError, setApiError] = useState<string | null>(null)

    const login = useLogin()
    const signup = useSignup()
    const verifyOtp = useVerifyOtp()

    const isSignUp = mode === "signup"
    const isLoading = login.isPending || signup.isPending || verifyOtp.isPending


    // useEffects
    useEffect(() => {
        const modeParam = searchParams.get("mode")

        if (modeParam === "signup" || modeParam === "signin") {
            setMode(modeParam)
        }
    }, [searchParams])


    // ── Forms ──────────────────────────────────────────────────

    const signInForm = useForm<SignInFields>({
        resolver: zodResolver(signInSchema),
        defaultValues: { email: "", password: "" },
    })

    const signUpForm = useForm<SignUpFields>({
        resolver: zodResolver(signUpSchema),
        defaultValues: { Name: "", email: "", password: "", role: "" },
    })

    const otpForm = useForm<OtpFields>({
        resolver: zodResolver(otpSchema),
        defaultValues: { otp: "" },
    })

    // ── Tab switch ─────────────────────────────────────────────

    const switchMode = (next: AuthMode) => {
        setMode(next)
        setOtpPending(false)
        setApiError(null)
        signInForm.reset()
        signUpForm.reset()
        otpForm.reset()
    }

    // ── Submit: sign in ────────────────────────────────────────

    const handleSignIn = signInForm.handleSubmit(async (values) => {
        setApiError(null)
        try {
            const res = await login.mutateAsync({
                email: values.email,
                password: values.password,
            })
            // CASE 1: OTP required
            if ("verification_required" in res && res.verification_required) {
                setPendingEmail(res.email)
                setOtpPending(true)
                return
            }
            // CASE 2: Normal login
            router.push("/home")

        } catch (err) {
            const msg = extractErrorMessage(err)
            // If login also requires OTP (edge case), handle it
            if (
                err &&
                typeof err === "object" &&
                (err as { response?: { data?: { data?: { verification_required?: boolean } } } })
                    .response?.data?.data?.verification_required
            ) {
                setPendingEmail(values.email)
                setOtpPending(true)
            } else {
                setApiError(msg)
            }
        }
    })

    // ── Submit: sign up ────────────────────────────────────────

    const handleSignUp = signUpForm.handleSubmit(async (values) => {
        setApiError(null)
        try {
            const result = await signup.mutateAsync({
                name: `${values.Name}`.trim(),
                email: values.email,
                password: values.password,
                role: values.role,
            })
            if (result.verification_required) {
                setPendingEmail(result.email)
                setOtpPending(true)
            }
        } catch (err) {
            setApiError(extractErrorMessage(err))
        }
    })

    // ── Submit: OTP ────────────────────────────────────────────

    const handleOtp = otpForm.handleSubmit(async (values) => {
        setApiError(null)
        try {
            await verifyOtp.mutateAsync({ email: pendingEmail, otp: values.otp })
            router.push("/home")
        } catch (err) {
            setApiError(extractErrorMessage(err))
        }
    })


    // ___ google oauth ____________

    const handleGoogleLogin = async () => {
        try {
            const res = await getGoogleLoginUrl()
            window.location.href = res.auth_url // redirect to Google
        } catch (err) {
            setApiError("Failed to start Google login")
        }
    }

    // ── Render ─────────────────────────────────────────────────

    return (
        <div className={styles.heroAuthCard}>

            {/* ── OTP step ── */}
            {otpPending ? (
                <>
                    <button
                        className={styles.authBack}
                        onClick={() => { setOtpPending(false); setApiError(null); otpForm.reset() }}
                        type="button"
                        aria-label="Back"
                    >
                        <Icon icon="mdi:arrow-left" width={16} height={16} />
                        Back
                    </button>

                    <p className={styles.authCardTitle}>Verify Email</p>
                    <p className={styles.authCardSubtitle}>
                        We sent a code to <strong>{pendingEmail}</strong>. Enter it below.
                    </p>

                    <form onSubmit={handleOtp} className={styles.authForm} noValidate>
                        <Input
                            label="One-time password"
                            placeholder="Enter OTP"
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={8}
                            leftIcon={<Icon icon="mdi:shield-key-outline" width={18} height={18} />}
                            {...otpForm.register("otp")}
                            error={otpForm.formState.errors.otp?.message}
                        />

                        {apiError && (
                            <p className={styles.authApiError} role="alert">
                                <Icon icon="mdi:alert-circle-outline" width={15} height={15} />
                                {apiError}
                            </p>
                        )}

                        <Button
                            variant="brand"
                            size="lg"
                            fullWidth
                            loading={verifyOtp.isPending}
                            type="submit"
                            style={{ marginTop: "var(--space-2)" } as React.CSSProperties}
                        >
                            Verify & Continue →
                        </Button>
                    </form>
                </>
            ) : (
                <>
                    {/* ── Title ── */}
                    <p className={styles.authCardTitle}>
                        {isSignUp ? "Join the Game" : "Welcome Back"}
                    </p>
                    <p className={styles.authCardSubtitle}>
                        {isSignUp
                            ? "Create your free account and get discovered."
                            : "Sign in to your Goatza account."}
                    </p>

                    {/* ── Tabs ── */}
                    <div className={styles.authTabs} role="tablist">
                        <button
                            role="tab"
                            aria-selected={!isSignUp}
                            className={`${styles.authTab} ${!isSignUp ? styles.authTabActive : ""}`}
                            onClick={() => switchMode("signin")}
                            type="button"
                        >
                            Sign In
                        </button>
                        <button
                            role="tab"
                            aria-selected={isSignUp}
                            className={`${styles.authTab} ${isSignUp ? styles.authTabActive : ""}`}
                            onClick={() => switchMode("signup")}
                            type="button"
                        >
                            Sign Up
                        </button>
                    </div>

                    {/* ── Social ── */}
                    <div className={styles.authSocialRow}>
                        <button
                            className={styles.authSocialBtn}
                            type="button"
                            onClick={handleGoogleLogin}
                        >
                            <Icon icon="logos:google-icon" width={18} height={18} />
                            Continue with Google
                        </button>
                    </div>

                    <Divider label="or" style={{ marginBlock: "var(--space-4)" } as React.CSSProperties} />

                    {/* ── API-level error ── */}
                    {apiError && (
                        <p className={styles.authApiError} role="alert">
                            <Icon icon="mdi:alert-circle-outline" width={15} height={15} />
                            {apiError}
                        </p>
                    )}

                    {/* ── Sign in form ── */}
                    {!isSignUp && (
                        <form onSubmit={handleSignIn} className={styles.authForm} noValidate>
                            <Input
                                label="Email"
                                type="email"
                                placeholder="you@example.com"
                                autoComplete="email"
                                leftIcon={<Icon icon="mdi:email-outline" width={18} height={18} />}
                                {...signInForm.register("email")}
                                error={signInForm.formState.errors.email?.message}
                            />

                            <Input
                                label="Password"
                                type="password"
                                placeholder="Your password"
                                autoComplete="current-password"
                                leftIcon={<Icon icon="mdi:lock-outline" width={18} height={18} />}
                                {...signInForm.register("password")}
                                error={signInForm.formState.errors.password?.message}
                            />

                            <div style={{ textAlign: "right", marginTop: "calc(-1 * var(--space-2))" }}>
                                <a
                                    href="/auth/forgot-password"
                                    className={styles.authFooterLink}
                                    style={{ fontSize: "var(--text-xs)" }}
                                >
                                    Forgot password?
                                </a>
                            </div>

                            <Button
                                variant="brand"
                                size="lg"
                                fullWidth
                                loading={isLoading}
                                type="submit"
                                style={{ marginTop: "var(--space-2)" } as React.CSSProperties}
                            >
                                Sign In →
                            </Button>
                        </form>
                    )}

                    {/* ── Sign up form ── */}
                    {isSignUp && (
                        <form onSubmit={handleSignUp} className={styles.authForm} noValidate>
                            <div className={styles.authFormRow}>
                                <Input
                                    label="Name"
                                    placeholder="Rahul"
                                    autoComplete="given-name"
                                    leftIcon={<Icon icon="mdi:account-outline" width={18} height={18} />}
                                    {...signUpForm.register("Name")}
                                    error={signUpForm.formState.errors.Name?.message}
                                />
                            </div>

                            <Input
                                label="Email"
                                type="email"
                                placeholder="you@example.com"
                                autoComplete="email"
                                leftIcon={<Icon icon="mdi:email-outline" width={18} height={18} />}
                                {...signUpForm.register("email")}
                                error={signUpForm.formState.errors.email?.message}
                            />

                            <Input
                                label="Password"
                                type="password"
                                placeholder="Create a strong password"
                                autoComplete="new-password"
                                leftIcon={<Icon icon="mdi:lock-outline" width={18} height={18} />}
                                {...signUpForm.register("password")}
                                error={signUpForm.formState.errors.password?.message}
                            />

                            <Select
                                label="I am a…"
                                placeholder="Select your role"
                                {...signUpForm.register("role")}
                                error={signUpForm.formState.errors.role?.message}
                                options={[
                                    { value: "player", label: "Athlete / Player" },
                                    { value: "team", label: "Team / Club" },
                                    { value: "scout", label: "Scout" },
                                    { value: "academy", label: "Academy" },
                                    { value: "coach", label: "Coach" },
                                ]}
                            />

                            <Button
                                variant="brand"
                                size="lg"
                                fullWidth
                                loading={isLoading}
                                type="submit"
                                style={{ marginTop: "var(--space-2)" } as React.CSSProperties}
                            >
                                Create Free Account →
                            </Button>
                        </form>
                    )}

                    <p className={styles.authFooterText} style={{ marginTop: "var(--space-4)" }}>
                        {isSignUp ? (
                            <>Already have an account?{" "}
                                <button
                                    className={styles.authFooterLink}
                                    onClick={() => switchMode("signin")}
                                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit" }}
                                    type="button"
                                >
                                    Sign in
                                </button>
                            </>
                        ) : (
                            <>Don't have an account?{" "}
                                <button
                                    className={styles.authFooterLink}
                                    onClick={() => switchMode("signup")}
                                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit" }}
                                    type="button"
                                >
                                    Sign up free
                                </button>
                            </>
                        )}
                    </p>
                </>
            )}
        </div>
    )
}

export default AuthCard