"use client"

import { useEffect, useRef, useState } from "react"
import { useForm, type SubmitHandler, type Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Icon } from "@iconify/react"
import { Input } from "@/shared/components/ui"
import LocationPicker from "@/shared/components/LocationPicker/LocationPicker"
import { useUpdateProfileData, useCheckUsername } from "@/features/profile/hooks/useProfileQueries"
import { useAuthStore } from "@/store/auth.store"
import type { UserProfile, LocationPayload } from "@/features/profile/services/profile.api"
import type { MapboxCity } from "@/shared/services/mapbox.service"
import styles from "./EditProfileModal.module.css"

// ── Zod schema ────────────────────────────────────────────────

const schema = z.object({
  name: z.string().min(1, "Name is required").max(60),
  username: z
    .string()
    .min(3, "At least 3 characters")
    .max(30, "Max 30 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Only letters, numbers and _"),
  headline: z.string().max(120).optional(),
  about: z.string().max(600).optional(),
  gender: z.enum(["male", "female", "other", ""]).optional(),
  height_cm: z.coerce.number().min(50).max(300).nullable().optional(),
  weight_kg: z.coerce.number().min(20).max(400).nullable().optional(),
})

type FormValues = z.infer<typeof schema>

// ── Username status ───────────────────────────────────────────

type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid"

function UsernameStatusIndicator({ status }: { status: UsernameStatus }) {
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
  return (
    <span className={`${styles.usernameStatus} ${styles.statusTaken}`}>
      <Icon icon="mdi:close-circle-outline" width={13} height={13} />
      {status === "taken" ? "Already taken" : "Not allowed"}
    </span>
  )
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
  onSaved?: (updated: UserProfile) => void
}

export default function EditProfileModal({ profile, onClose, onSaved }: EditProfileModalProps) {
  const updateProfileData = useUpdateProfileData(profile.username)
  const checkUsername = useCheckUsername()
  const updateUser = useAuthStore.getState().updateUser

  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle")
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Location state (managed outside react-hook-form) ─────────
  // We track the MapboxCity separately because it's not a simple
  // scalar value — it gets serialised into LocationPayload on submit.
  const [selectedCity, setSelectedCity] = useState<MapboxCity | null>(() => {
    if (!profile.location) return null
    // Reconstruct a minimal MapboxCity from existing profile location
    return {
      label: [profile.location.city, profile.location.country_code].filter(Boolean).join(", "),
      name: profile.location.city,
      state: "",                        // not stored in profile read response
      country_code: profile.location.country_code,
      latitude: profile.location.latitude,
      longitude: profile.location.longitude,
      external_id: "",                        // not stored, will be fresh from picker
    }
  })

  // Track whether location changed from the initial value
  const originalLocationName = profile.location?.city ?? null
  const locationChanged =
    selectedCity === null
      ? originalLocationName !== null                  // was set, now cleared
      : selectedCity.name !== originalLocationName     // changed to different city

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = "" }
  }, [])

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isDirty, dirtyFields, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema) as Resolver<FormValues>,
    defaultValues: {
      name: profile.name ?? "",
      username: profile.username ?? "",
      headline: profile.headline ?? "",
      about: profile.about ?? "",
      gender: (profile.gender as FormValues["gender"]) ?? "",
      height_cm: profile.height_cm ?? undefined,
      weight_kg: profile.weight_kg ?? undefined,
    },
  })

  const watchedUsername = watch("username")

  // ── Username availability debounce ────────────────────────────
  useEffect(() => {
    const current = watchedUsername?.trim()
    if (!current || current === profile.username) { setUsernameStatus("idle"); return }
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(current)) { setUsernameStatus("idle"); return }

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

  // ── Submit ────────────────────────────────────────────────────
  const onSubmit: SubmitHandler<FormValues> = async (values) => {
    if (usernameStatus === "taken" || usernameStatus === "invalid") {
      setError("username", { message: "Choose a different username" })
      return
    }

    const payload: Record<string, unknown> = {}

    if (dirtyFields.name) payload.name = values.name
    if (dirtyFields.username) payload.username = values.username
    if (dirtyFields.headline) payload.headline = values.headline ?? ""
    if (dirtyFields.about) payload.about = values.about ?? ""
    if (dirtyFields.gender) payload.gender = values.gender || null
    if (dirtyFields.height_cm) payload.height_cm = values.height_cm ?? null
    if (dirtyFields.weight_kg) payload.weight_kg = values.weight_kg ?? null

    // ── Location: only include if changed ──────────────────────
    if (locationChanged) {
      if (selectedCity === null) {
        // User cleared location — send null
        payload.location = null
      } else {
        // Build full LocationPayload from MapboxCity
        const loc: LocationPayload = {
          name: selectedCity.name,
          type: "city",
          city: selectedCity.name,
          state: selectedCity.state,
          country_code: selectedCity.country_code,
          latitude: selectedCity.latitude,
          longitude: selectedCity.longitude,
          external_id: selectedCity.external_id,
        }
        payload.location = loc
      }
    }

    if (Object.keys(payload).length === 0) { onClose(); return }

    try {
      const updated = await updateProfileData.mutateAsync(payload)

      // Sync auth store username if it changed
      const currentUser = useAuthStore.getState().user

      if (currentUser) {
        updateUser({
          ...currentUser,
          username: updated.username,
          name: updated.name,
          profile_photo: updated.profile_photo,
        })
      }

      if (onSaved) onSaved(updated)
      else onClose()
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

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  const headlineLen = watch("headline")?.length ?? 0
  const aboutLen = watch("about")?.length ?? 0

  // Dirty = react-hook-form fields changed OR location changed
  const isFormDirty = isDirty || locationChanged

  return (
    <div
      className={styles.backdrop}
      onClick={handleBackdrop}
      role="dialog"
      aria-modal="true"
      aria-label="Edit profile"
    >
      <div className={styles.modal}>

        {/* ── Header ── */}
        <div className={styles.header}>
          <h2 className={styles.headerTitle}>Edit Profile</h2>
          <button className={styles.closeBtn} onClick={onClose} type="button" aria-label="Close">
            <Icon icon="mdi:close" width={20} height={20} />
          </button>
        </div>

        {/* ── Form ── */}
        <form onSubmit={handleSubmit(onSubmit)} noValidate className={styles.form}>
          <div className={styles.body}>

            {/* ── Basic Info ── */}
            <div className={styles.section}>
              <SectionHeader icon="mdi:account-outline" title="Basic Info" />

              <Field label="Full Name" required error={errors.name?.message}>
                <Input {...register("name")} placeholder="Your full name" required />
              </Field>

              <Field
                label="Username"
                required
                error={errors.username?.message}
                hint="Letters, numbers and _ only."
              >
                <div className={styles.inputWithStatus}>
                  <Input
                    {...register("username")}
                    placeholder="username"
                    leftIcon={<span style={{ color: "var(--color-text-muted)" }}>@</span>}
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                  <div className={styles.inputStatusSlot}>
                    <UsernameStatusIndicator status={usernameStatus} />
                  </div>
                </div>
              </Field>

              <Field label="Headline" error={errors.headline?.message} hint={`${headlineLen}/120`}>
                <Input {...register("headline")} placeholder="e.g. Striker | Football Enthusiast" maxLength={120} />
              </Field>

              <Field label="About" error={errors.about?.message} hint={`${aboutLen}/600`}>
                <Input
                  as="textarea"
                  {...register("about")}
                  placeholder="Tell the world about yourself…"
                  rows={4}
                  maxLength={600}
                />
              </Field>
            </div>

            {/* ── Location ── */}
            <div className={styles.section}>
              <SectionHeader icon="mdi:map-marker-outline" title="Location" />

              <Field
                label="City"
                hint="Search and select your city."
              >
                <LocationPicker
                  value={selectedCity}
                  onChange={setSelectedCity}
                  placeholder="Search city, e.g. Kannur…"
                  disabled={isSubmitting}
                />
              </Field>
            </div>

            {/* ── Physical ── */}
            <div className={styles.section}>
              <SectionHeader icon="mdi:human-male-height" title="Physical" />

              <Field label="Gender" error={errors.gender?.message}>
                <select className={styles.selectField} {...register("gender")}>
                  <option value="">Prefer not to say</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </Field>

              <div className={styles.row2}>
                <Field label="Height (cm)" error={errors.height_cm?.message}>
                  <Input {...register("height_cm")} type="number" min={50} max={250} step={1} placeholder="178" />
                </Field>
                <Field label="Weight (kg)" error={errors.weight_kg?.message}>
                  <Input {...register("weight_kg")} type="number" min={20} max={400} step={0.1} placeholder="72.5" />
                </Field>
              </div>
            </div>

            <div className={styles.comingSoon}>
              <Icon icon="mdi:clock-outline" width={14} height={14} />
              Sports, career &amp; achievements — coming soon
            </div>

          </div>

          {/* ── Footer ── */}
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
              disabled={!isFormDirty || isSubmitting}
            >
              {isSubmitting ? (
                <><span className={styles.miniSpinner} aria-hidden="true" /> Saving…</>
              ) : "Save Changes"}
            </button>
          </div>
        </form>

      </div>
    </div>
  )
}