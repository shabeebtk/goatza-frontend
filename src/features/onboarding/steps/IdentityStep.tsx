"use client"

import { useEffect, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Icon } from "@iconify/react"
import { Input } from "@/shared/components/ui"
import LocationPicker from "@/shared/components/LocationPicker/LocationPicker"
import { useMyProfile, useUpdateProfileData, useCheckUsername } from "@/features/profile/hooks/useProfileQueries"
import type { UserProfile, LocationPayload, UpdateProfileDataPayload } from "@/features/profile/services/profile.api"
import type { MapboxCity } from "@/shared/services/mapbox.service"
import { useAuthStore } from "@/store/auth.store"
import { useOnboardingStore } from "../store/onboarding.store"
import { useCompleteOnboarding } from "../hooks/useCompleteOnboarding"
import { validateUsernameFormat } from "../utils/username"
import StepScaffold from "./StepScaffold"
import modal from "../components/OnboardingModal.module.css"
import styles from "./IdentityStep.module.css"

// ── Gender options (must match backend UserProfile.Gender) ─────
const GENDER_OPTIONS = [
  { value: "male", label: "Male", icon: "mdi:gender-male" },
  { value: "female", label: "Female", icon: "mdi:gender-female" },
  { value: "other", label: "Other", icon: "mdi:gender-non-binary" },
] as const

type GenderValue = (typeof GENDER_OPTIONS)[number]["value"] | ""

// ── Zod schema (name + username; mirrors backend rules) ────────
const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(150, "Name is too long"),
  username: z.string().superRefine((val, ctx) => {
    const err = validateUsernameFormat(val)
    if (err) ctx.addIssue({ code: z.ZodIssueCode.custom, message: err })
  }),
})

type FormValues = z.infer<typeof schema>

type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid"

// Draft persisted between steps so Back → Role → forward keeps identity inputs.
type IdentityDraft = {
  name: string
  username: string
  gender: GenderValue
  city: MapboxCity | null
}

// Rebuild a MapboxCity from the stored profile location (mirrors EditProfileModal).
function cityFromProfile(profile: UserProfile): MapboxCity | null {
  if (!profile.location) return null
  return {
    label: [profile.location.city, profile.location.country_code].filter(Boolean).join(", "),
    name: profile.location.city,
    state: "",
    country_code: profile.location.country_code,
    latitude: profile.location.latitude,
    longitude: profile.location.longitude,
    external_id: "",
  }
}

// ── Username status pill ───────────────────────────────────────
function UsernameStatusIndicator({ status }: { status: UsernameStatus }) {
  if (status === "idle") return null
  if (status === "checking")
    return (
      <span className={`${styles.usernameStatus} ${styles.statusChecking}`}>
        <span className={styles.miniSpinner} /> Checking…
      </span>
    )
  if (status === "available")
    return (
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

/**
 * Step 2 — Identity. Prefills from the current user's profile (or the saved draft
 * when returning via Back). Only name + username are mandatory; gender + location
 * are optional. Saves changed fields on Continue, then branches: player → next
 * step; coach/scout/org_user → complete onboarding and show Success.
 */
export default function IdentityStep({ onNext }: { onNext: () => void }) {
  const { data: profile, isLoading } = useMyProfile()

  // We always need the profile as the source of truth for change detection.
  if (isLoading || !profile) {
    return (
      <div className={modal.stepScaffold}>
        <div className={`${modal.stepBody} ${styles.loadingBody}`}>
          <span className={styles.miniSpinner} aria-hidden="true" />
          <span className={styles.loadingText}>Loading your details…</span>
        </div>
      </div>
    )
  }

  return <IdentityForm profile={profile} onNext={onNext} />
}

function IdentityForm({
  profile,
  onNext,
}: {
  profile: UserProfile
  onNext: () => void
}) {
  const branch = useOnboardingStore((s) => s.branch)
  const draft = useOnboardingStore((s) => s.drafts.identity) as IdentityDraft | undefined
  const setDraft = useOnboardingStore((s) => s.setDraft)

  const updateProfileData = useUpdateProfileData(profile.username)
  const checkUsername = useCheckUsername()
  const completeOnboarding = useCompleteOnboarding()
  const updateUser = useAuthStore((s) => s.updateUser)

  // Initial values: saved draft wins (returning via Back), else the profile.
  const initialGender: GenderValue = draft?.gender ?? ((profile.gender as GenderValue) ?? "")
  const [gender, setGender] = useState<GenderValue>(initialGender)
  const [selectedCity, setSelectedCity] = useState<MapboxCity | null>(
    draft?.city ?? cityFromProfile(profile)
  )
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle")
  const [apiError, setApiError] = useState<string | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    getValues,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: {
      name: draft?.name ?? profile.name ?? "",
      username: draft?.username ?? profile.username ?? "",
    },
  })

  const watchedUsername = watch("username")

  // Persist the draft on unmount so Back → Role → forward restores everything.
  const latestRef = useRef<IdentityDraft>({
    name: getValues("name"),
    username: getValues("username"),
    gender,
    city: selectedCity,
  })
  latestRef.current = {
    name: watch("name"),
    username: watchedUsername,
    gender,
    city: selectedCity,
  }
  useEffect(() => {
    return () => {
      setDraft("identity", latestRef.current)
    }
  }, [setDraft])

  const usernameChanged =
    (watchedUsername ?? "").trim().toLowerCase() !==
    (profile.username ?? "").toLowerCase()

  // ── Debounced availability check ─────────────────────────────
  useEffect(() => {
    const current = (watchedUsername ?? "").trim()

    // Unchanged from the user's own username — nothing to check.
    if (!usernameChanged) {
      setUsernameStatus("idle")
      return
    }
    // Let Zod surface the format error; don't hit the API for invalid input.
    if (validateUsernameFormat(current)) {
      setUsernameStatus("idle")
      return
    }

    setUsernameStatus("checking")
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const result = await checkUsername.mutateAsync(current).catch(() => null)
      if (!result) setUsernameStatus("invalid")
      else setUsernameStatus(result.available ? "available" : "taken")
    }, 400)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedUsername, usernameChanged])

  const genderChanged = gender !== ((profile.gender as GenderValue) ?? "")

  const originalCity = profile.location?.city ?? null
  const locationChanged =
    selectedCity === null
      ? originalCity !== null
      : selectedCity.name !== originalCity

  // Deterministic validity (independent of RHF's isValid mount timing) so a valid
  // prefill enables Continue immediately.
  const nameVal = (watch("name") ?? "").trim()
  const nameValid = nameVal.length >= 1 && nameVal.length <= 150
  const usernameFormatValid = validateUsernameFormat(watchedUsername ?? "") === null
  const usernameOk = !usernameChanged || usernameStatus === "available"
  const canContinue = nameValid && usernameFormatValid && usernameOk && !isSubmitting

  const advance = async () => {
    // coach / scout / org_user finish onboarding right here.
    if (branch === "player") {
      onNext()
      return
    }
    try {
      await completeOnboarding.mutateAsync()
      onNext()
    } catch {
      setApiError("Couldn't finish setup. Please try again.")
    }
  }

  const onSubmit = async (values: FormValues) => {
    setApiError(null)

    if (usernameChanged && usernameStatus !== "available") {
      setError("username", { message: "Choose an available username" })
      return
    }

    const payload: UpdateProfileDataPayload = {}
    if (values.name.trim() !== (profile.name ?? "")) payload.name = values.name.trim()
    if (usernameChanged) payload.username = values.username.trim()
    if (genderChanged) payload.gender = gender || "" // "" clears (ChoiceField allow_blank)
    if (locationChanged) {
      payload.location = selectedCity
        ? ({
            name: selectedCity.name,
            type: "city",
            city: selectedCity.name,
            state: selectedCity.state,
            country_code: selectedCity.country_code,
            latitude: selectedCity.latitude,
            longitude: selectedCity.longitude,
            external_id: selectedCity.external_id,
          } satisfies LocationPayload)
        : null
    }

    // Nothing changed — skip the write, just move on.
    if (Object.keys(payload).length === 0) {
      await advance()
      return
    }

    try {
      const updated = await updateProfileData.mutateAsync(payload)

      // Keep the auth store's user in sync (name/username/photo drive the app chrome).
      const currentUser = useAuthStore.getState().user
      if (currentUser) {
        updateUser({
          ...currentUser,
          username: updated.username,
          name: updated.name,
          profile_photo: updated.profile_photo,
        })
      }

      await advance()
    } catch (err: unknown) {
      // Race: username got taken between the check and submit → surface inline, stay.
      const detail = (
        err as { response?: { data?: { data?: Record<string, string[] | string> } } }
      )?.response?.data?.data
      const usernameErr = detail?.username
      const nameErr = detail?.name

      if (usernameErr) {
        const msg = Array.isArray(usernameErr) ? usernameErr[0] : String(usernameErr)
        setError("username", { message: msg })
        setUsernameStatus("taken")
        return
      }
      if (nameErr) {
        const msg = Array.isArray(nameErr) ? nameErr[0] : String(nameErr)
        setError("name", { message: msg })
        return
      }
      setApiError("Couldn't save your details. Please try again.")
    }
  }

  const busy = isSubmitting || completeOnboarding.isPending

  return (
    <StepScaffold
      icon="mdi:card-account-details-outline"
      title="Your identity"
      subtitle="Tell people who you are. Only your name and username are required."
      footer={
        <button
          type="submit"
          form="onboarding-identity-form"
          className={styles.continueBtn}
          disabled={!canContinue || busy}
        >
          {busy ? (
            <>
              <span className={styles.miniSpinner} aria-hidden="true" /> Saving…
            </>
          ) : (
            "Continue →"
          )}
        </button>
      }
    >
      <form
        id="onboarding-identity-form"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className={styles.form}
      >
        {/* ── Name ── */}
        <div className={styles.field}>
          <label className={styles.label} htmlFor="onb-name">
            Full name<span className={styles.req} aria-hidden="true">*</span>
          </label>
          <Input
            id="onb-name"
            {...register("name")}
            placeholder="Your full name"
            aria-invalid={!!errors.name}
          />
          {errors.name && (
            <p className={styles.errorMsg} role="alert">
              <Icon icon="mdi:alert-circle-outline" width={11} height={11} />
              {errors.name.message}
            </p>
          )}
        </div>

        {/* ── Username ── */}
        <div className={styles.field}>
          <label className={styles.label} htmlFor="onb-username">
            Username<span className={styles.req} aria-hidden="true">*</span>
          </label>
          <div className={styles.inputWithStatus}>
            <Input
              id="onb-username"
              {...register("username")}
              placeholder="username"
              leftIcon={<span style={{ color: "var(--color-text-muted)" }}>@</span>}
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={!!errors.username}
            />
            <div className={styles.inputStatusSlot}>
              {!errors.username && <UsernameStatusIndicator status={usernameStatus} />}
            </div>
          </div>
          {errors.username && (
            <p className={styles.errorMsg} role="alert">
              <Icon icon="mdi:alert-circle-outline" width={11} height={11} />
              {errors.username.message}
            </p>
          )}
          {!errors.username && (
            <p className={styles.hint}>Letters, numbers and _ only.</p>
          )}
        </div>

        {/* ── Gender (optional, deselectable) ── */}
        <div className={styles.field}>
          <span className={styles.label}>Gender</span>
          <div className={styles.genderGrid} role="group" aria-label="Gender">
            {GENDER_OPTIONS.map((opt) => {
              const checked = gender === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={checked}
                  className={`${styles.genderCard} ${checked ? styles.genderCardOn : ""}`}
                  onClick={() => setGender(checked ? "" : opt.value)}
                >
                  <Icon icon={opt.icon} width={20} height={20} aria-hidden="true" />
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Location (optional) ── */}
        <div className={styles.field}>
          <span className={styles.label}>Location</span>
          <LocationPicker
            value={selectedCity}
            onChange={setSelectedCity}
            placeholder="Search your city…"
            disabled={busy}
          />
        </div>

        {apiError && (
          <p className={modal.apiError} role="alert">
            <Icon icon="mdi:alert-circle-outline" width={15} height={15} />
            {apiError}
          </p>
        )}
      </form>
    </StepScaffold>
  )
}
