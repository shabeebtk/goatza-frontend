"use client"

/**
 * EditProfileModal
 *
 * Desktop: centered modal (max 600px wide)
 * Mobile:  full-screen sheet
 *
 * Sections (expandable for future):
 *   - Basic Info: name, username (with availability check), headline, about
 *   - Physical: height, weight
 *
 * Only changed fields are sent in the PATCH request.
 */

import { useEffect, useRef, useState, useCallback } from "react"
import { useForm, Controller, SubmitHandler } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Icon } from "@iconify/react"
import { Input, Button } from "@/shared/components/ui"
import { useUpdateProfileData, useCheckUsername } from "@/features/profile/hooks/useProfileQueries"
import type { UserProfile } from "@/features/profile/services/profile.api"
import styles from "./EditProfileModal.module.css"
import { useAuthStore } from "@/store/auth.store"


// ── Zod schema ───────────────────────────────────────────────
const schema = z.object({
    name: z.string().min(1, "Name is required").max(60),

    username: z
        .string()
        .min(3, "At least 3 characters")
        .max(30, "Max 30 characters")
        .regex(/^[a-zA-Z0-9_]+$/, "Only letters, numbers and _"),

    headline: z.string().max(120).optional(),
    about: z.string().max(600).optional(),

    height_cm: z.coerce.number().min(50).max(300).nullable().optional(),
    weight_kg: z.coerce.number().min(20).max(400).nullable().optional(),
})

type FormValues = z.infer<typeof schema>

// ── Username status indicator ─────────────────────────────────

type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid"

function UsernameStatus({ status }: { status: UsernameStatus }) {
    if (status === "idle") return null
    if (status === "checking") return (
        <span className={`${styles.usernameStatus} ${styles.statusChecking}`}>
            <span className={styles.miniSpinner} /> Checking…
        </span>
    )
    if (status === "available") return (
        <span className={`${styles.usernameStatus} ${styles.statusAvailable}`}>
            <Icon icon="mdi:check-circle-outline" width={13} height={13} />
            Available
        </span>
    )
    if (status === "taken") return (
        <span className={`${styles.usernameStatus} ${styles.statusTaken}`}>
            <Icon icon="mdi:close-circle-outline" width={13} height={13} />
            Already taken
        </span>
    )
    if (status === "invalid") return (
        <span className={`${styles.usernameStatus} ${styles.statusTaken}`}>
            <Icon icon="mdi:alert-circle-outline" width={13} height={13} />
            Not allowed
        </span>
    )
    return null
}

// ── Section header ────────────────────────────────────────────

function SectionHeader({ icon, title }: { icon: string; title: string }) {
    return (
        <div className={styles.sectionHeader}>
            <Icon icon={icon} width={16} height={16} aria-hidden="true" />
            <h3 className={styles.sectionTitle}>{title}</h3>
        </div>
    )
}

// ── Field wrapper ─────────────────────────────────────────────

function Field({
    label, required, error, hint, children,
}: {
    label: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode
}) {
    return (
        <div className={`${styles.field} ${error ? styles.fieldError : ""}`}>
            <label className={styles.fieldLabel}>
                {label}
                {required && <span className={styles.fieldRequired} aria-hidden="true">*</span>}
            </label>
            {children}
            {error && (
                <p className={styles.fieldErrorMsg} role="alert">
                    <Icon icon="mdi:alert-circle-outline" width={11} height={11} />
                    {error}
                </p>
            )}
            {hint && !error && <p className={styles.fieldHint}>{hint}</p>}
        </div>
    )
}

// ── Main component ────────────────────────────────────────────

interface EditProfileModalProps {
    profile: UserProfile
    onClose: () => void
    /** Called with updated profile after successful save */
    onSaved?: (updated: UserProfile) => void
}

export default function EditProfileModal({
    profile,
    onClose,
    onSaved,
}: EditProfileModalProps) {
    const updateProfileData = useUpdateProfileData(profile.username)
    const checkUsername = useCheckUsername()

    const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle")
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const setAuth = useAuthStore.getState().setAuth


    useEffect(() => {
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = "";
        };
    }, []);

    const {
        register,
        handleSubmit,
        watch,
        control,
        setError,
        formState: { errors, isDirty, dirtyFields, isSubmitting },
    } = useForm<FormValues, unknown, FormValues>({
        resolver: zodResolver(schema),
        defaultValues: {
            name: profile.name ?? "",
            username: profile.username ?? "",
            headline: profile.headline ?? "",
            about: profile.about ?? "",
            height_cm: profile.height_cm ?? undefined,
            weight_kg: profile.weight_kg ?? undefined,
        },
    })
    const watchedUsername = watch("username")

    // ── Username debounce check ───────────────────────────────────
    useEffect(() => {
        const current = watchedUsername?.trim()
        if (!current || current === profile.username) {
            setUsernameStatus("idle")
            return
        }
        // Basic format check before hitting API
        if (!/^[a-zA-Z0-9_]{3,30}$/.test(current)) {
            setUsernameStatus("idle")
            return
        }
        setUsernameStatus("checking")
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(async () => {
            const result = await checkUsername.mutateAsync(current).catch(() => null)
            if (!result) setUsernameStatus("invalid")
            else if (result.available) setUsernameStatus("available")
            else setUsernameStatus("taken")
        }, 500)
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [watchedUsername, profile.username])

    // ── Submit: only send changed fields ─────────────────────────
    const onSubmit: SubmitHandler<FormValues> = async (values) => {
        // Block save if username invalid
        if (usernameStatus === "taken" || usernameStatus === "invalid") {
            setError("username", { message: "Choose a different username" })
            return
        }

        const payload: Record<string, unknown> = {}

        if (dirtyFields.name) payload.name = values.name
        if (dirtyFields.username) payload.username = values.username
        if (dirtyFields.headline) payload.headline = values.headline ?? ""
        if (dirtyFields.about) payload.about = values.about ?? ""
        if (dirtyFields.height_cm) payload.height_cm = values.height_cm ?? null
        if (dirtyFields.weight_kg) payload.weight_kg = values.weight_kg ?? null

        if (Object.keys(payload).length === 0) { onClose(); return }

        try {
            const updated = await updateProfileData.mutateAsync(payload)

            // update auth store if username changed
            setAuth({
                token: useAuthStore.getState().accessToken!,
                user: {
                    ...useAuthStore.getState().user!,
                    username: updated.username,
                },
            })

            onSaved?.(updated)
            onClose()

        } catch (err: unknown) {
            const msg =
                err && typeof err === "object"
                    ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
                    : undefined
            if (msg?.toLowerCase().includes("username")) {
                setError("username", { message: msg })
            }
        }
    }

    // ── Close on backdrop click ───────────────────────────────────
    const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) onClose()
    }

    // ── Char counters ─────────────────────────────────────────────
    const headlineLen = watch("headline")?.length ?? 0
    const aboutLen = watch("about")?.length ?? 0

    return (
        <div className={styles.backdrop} onClick={handleBackdrop} role="dialog"
            aria-modal="true" aria-label="Edit profile">

            <div className={styles.modal}>

                {/* ── Header ── */}
                <div className={styles.header}>
                    <h2 className={styles.headerTitle}>Edit Profile</h2>
                    <button className={styles.closeBtn} onClick={onClose} type="button" aria-label="Close">
                        <Icon icon="mdi:close" width={20} height={20} />
                    </button>
                </div>

                {/* ── Scrollable body ── */}
                <form
                    onSubmit={handleSubmit(onSubmit)}
                    noValidate
                    className={styles.form}
                >
                    <div className={styles.body}>

                        {/* ── SECTION: Basic Info ── */}
                        <div className={styles.section}>
                            <SectionHeader icon="mdi:account-outline" title="Basic Info" />

                            <Field label="Full Name" required error={errors.name?.message}>
                                <Input
                                    {...register("name")}
                                    required
                                    placeholder="Your full name"
                                />
                            </Field>

                            <Field
                                label="Username"
                                required
                                error={errors.username?.message}
                                hint="Letters, numbers, _ and . only. Changing this updates your profile URL."
                            >
                                <div className={styles.inputWithStatus}>
                                    <Input
                                        as="input"
                                        {...register("username")}
                                        placeholder="username"
                                        leftIcon={<span>@</span>}
                                    />

                                    <div className={styles.inputStatusSlot}>
                                        <UsernameStatus status={usernameStatus} />
                                    </div>
                                </div>
                            </Field>

                            <Field
                                label="Headline"
                                error={errors.headline?.message}
                                hint={`${headlineLen}/60`}
                            >
                                <Input
                                    {...register("headline")}
                                    placeholder="e.g. Striker | Football Enthusiast"
                                    maxLength={60}
                                />
                            </Field>

                            <Field
                                label="About"
                                error={errors.about?.message}
                                hint={`${aboutLen}/600`}
                            >
                                <Input
                                    as="textarea"
                                    {...register("about")}
                                    placeholder="Tell the world about yourself…"
                                    rows={5}
                                    maxLength={600}
                                />
                            </Field>
                        </div>

                        {/* ── SECTION: Physical ── */}
                        <div className={styles.section}>
                            <SectionHeader icon="mdi:human-male-height" title="Physical" />
                            <div className={styles.row2}>
                                <Field label="Height (cm)" error={errors.height_cm?.message}>
                                    <Input
                                        {...register("height_cm")}
                                        type="number"
                                        min={50}
                                        max={250}
                                        step={1}
                                        placeholder="178"
                                    />
                                </Field>
                                <Field label="Weight (kg)" error={errors.weight_kg?.message}>
                                    <Input
                                        {...register("weight_kg")}
                                        type="number"
                                        min={20}
                                        max={120}
                                        step={0.1}
                                        placeholder="72.5"
                                    />
                                </Field>
                            </div>
                        </div>

                        {/* Future sections placeholder */}
                        <div className={styles.comingSoon}>
                            <Icon icon="mdi:clock-outline" width={14} height={14} />
                            Sports, career &amp; achievements — coming soon
                        </div>

                    </div>

                    {/* ── Footer / Save ── */}
                    <div className={styles.footer}>
                        <button
                            type="button"
                            className={styles.cancelBtn}
                            onClick={onClose}
                            disabled={isSubmitting}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className={styles.saveBtn}
                            disabled={!isDirty || isSubmitting}
                        >
                            {isSubmitting ? (
                                <>
                                    <span className={styles.miniSpinner} aria-hidden="true" />
                                    Saving…
                                </>
                            ) : (
                                "Save Changes"
                            )}
                        </button>
                    </div>
                </form>

            </div>
        </div>
    )
}