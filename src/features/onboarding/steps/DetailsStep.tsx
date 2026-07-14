"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Icon } from "@iconify/react"
import { Input } from "@/shared/components/ui"
import { useMyProfile, useUpdateProfileData } from "@/features/profile/hooks/useProfileQueries"
import type { UserProfile, UpdateProfileDataPayload } from "@/features/profile/services/profile.api"
import { useSportsList } from "@/features/profile/hooks/useSportsQueries"
import { useAuthStore } from "@/store/auth.store"
import { useOnboardingStore } from "../store/onboarding.store"
import { generateHeadlineSuggestions } from "../constants/headlineSuggestions"
import StepScaffold from "./StepScaffold"
import modal from "../components/OnboardingModal.module.css"
import styles from "./DetailsStep.module.css"

const ABOUT_SOFT_CAP = 600

// Bounds mirror the backend model validators (UserProfile.height_cm / weight_kg)
// and the serializer's validate_* checks.
const HEIGHT_MIN = 50
const HEIGHT_MAX = 300
const WEIGHT_MIN = 20
const WEIGHT_MAX = 300

// Optional numeric field kept as a string in the form (concrete RHF types, no
// coercion surprises). Empty passes; otherwise it must parse within [min, max].
const numberInRange = (min: number, max: number, unit: string) =>
  z
    .string()
    .optional()
    .refine(
      (v) => {
        if (!v || v.trim() === "") return true
        const n = Number(v)
        return !Number.isNaN(n) && n >= min && n <= max
      },
      { message: `Must be ${min}–${max} ${unit}` }
    )

const schema = z.object({
  headline: z.string().max(255, "Max 255 characters").optional(),
  about: z.string().max(ABOUT_SOFT_CAP, `Max ${ABOUT_SOFT_CAP} characters`).optional(),
  height_cm: numberInRange(HEIGHT_MIN, HEIGHT_MAX, "cm"),
  weight_kg: numberInRange(WEIGHT_MIN, WEIGHT_MAX, "kg"),
})

type FormValues = z.infer<typeof schema>

type DetailsDraft = {
  headline: string
  about: string
  height: string
  weight: string
}

// The sports draft only stores ids; names are resolved from the master list.
type SportsDraftLike = {
  activeSportId: string | null
  positions: [string, boolean][]
}

// UserFullSerializer emits height/weight as strings — normalise to number|null.
function toNum(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const n = Number(value)
  return Number.isNaN(n) ? null : n
}

export default function DetailsStep({ onNext }: { onNext: () => void }) {
  const { data: profile, isLoading } = useMyProfile()

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

  return <DetailsForm profile={profile} onNext={onNext} />
}

function DetailsForm({
  profile,
  onNext,
}: {
  profile: UserProfile
  onNext: () => void
}) {
  const draft = useOnboardingStore((s) => s.drafts.details) as DetailsDraft | undefined
  const sportsDraft = useOnboardingStore((s) => s.drafts.sports) as SportsDraftLike | undefined
  const setDraft = useOnboardingStore((s) => s.setDraft)

  const updateProfileData = useUpdateProfileData(profile.username)
  const updateUser = useAuthStore((s) => s.updateUser)
  const { data: sports } = useSportsList()

  const profHeight = toNum(profile.height_cm)
  const profWeight = toNum(profile.weight_kg)

  // Initial values: saved draft wins (returning via Back), else the profile.
  const initial: DetailsDraft = draft ?? {
    headline: profile.headline ?? "",
    about: profile.about ?? "",
    height: profHeight != null ? String(profHeight) : "",
    weight: profWeight != null ? String(profWeight) : "",
  }

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      headline: initial.headline,
      about: initial.about,
      height_cm: initial.height,
      weight_kg: initial.weight,
    },
  })

  // ── Headline suggestions (sport + primary position from the sports draft) ──
  const suggestionContext = useMemo(() => {
    const sport = sports?.find((s) => s.id === sportsDraft?.activeSportId) ?? null
    const primaryPosId = sportsDraft?.positions.find(([, isPrimary]) => isPrimary)?.[0]
    const position = sport?.positions.find((p) => p.id === primaryPosId)?.name
    return { sport: sport?.name, position }
  }, [sports, sportsDraft])

  const [seed, setSeed] = useState(0)
  const suggestions = useMemo(
    () => generateHeadlineSuggestions(suggestionContext, seed),
    [suggestionContext, seed]
  )

  const applySuggestion = (text: string) => {
    setValue("headline", text, { shouldValidate: true, shouldDirty: true })
  }

  // ── About autosize ──
  const aboutRef = useRef<HTMLTextAreaElement | null>(null)
  const autosize = () => {
    const el = aboutRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }
  useEffect(() => {
    autosize()
  }, [])
  const aboutReg = register("about")

  const aboutLen = watch("about")?.length ?? 0

  // ── Persist draft on unmount (Back → Sports keeps state) ──
  const latestRef = useRef<DetailsDraft>(initial)
  latestRef.current = {
    headline: watch("headline") ?? "",
    about: watch("about") ?? "",
    height: String(watch("height_cm") ?? ""),
    weight: String(watch("weight_kg") ?? ""),
  }
  useEffect(() => {
    return () => setDraft("details", latestRef.current)
  }, [setDraft])

  const [apiError, setApiError] = useState<string | null>(null)

  const onSubmit = async (values: FormValues) => {
    setApiError(null)

    const payload: UpdateProfileDataPayload = {}

    const headline = (values.headline ?? "").trim()
    if (headline !== (profile.headline ?? "")) payload.headline = headline

    const about = (values.about ?? "").trim()
    if (about !== (profile.about ?? "")) payload.about = about

    const height = values.height_cm?.trim() ? Number(values.height_cm) : null
    if (height !== profHeight) payload.height_cm = height

    const weight = values.weight_kg?.trim() ? Number(values.weight_kg) : null
    if (weight !== profWeight) payload.weight_kg = weight

    if (Object.keys(payload).length === 0) {
      onNext()
      return
    }

    try {
      const updated = await updateProfileData.mutateAsync(payload)

      // Keep chrome-relevant fields in sync (name/username/photo unchanged here,
      // but seed defensively in case the response carries fresher values).
      const currentUser = useAuthStore.getState().user
      if (currentUser) {
        updateUser({
          ...currentUser,
          name: updated.name,
          username: updated.username,
          profile_photo: updated.profile_photo,
        })
      }

      onNext()
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object"
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined
      setApiError(msg ?? "Couldn't save your details. Please try again.")
    }
  }

  const busy = isSubmitting

  return (
    <StepScaffold
      icon="mdi:tune-variant"
      title="A few more details"
      subtitle="Add a headline and stats so people get the full picture. All optional."
      footer={
        <div className={styles.footerCol}>
          <button
            type="submit"
            form="onboarding-details-form"
            className={styles.continueBtn}
            disabled={busy}
          >
            {busy ? (
              <>
                <span className={styles.miniSpinner} aria-hidden="true" /> Saving…
              </>
            ) : (
              "Continue →"
            )}
          </button>
          <button type="button" className={styles.skipLink} onClick={onNext} disabled={busy}>
            Skip for now
          </button>
        </div>
      }
    >
      <form
        id="onboarding-details-form"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className={styles.form}
      >
        {/* ── Headline ── */}
        <div className={styles.field}>
          <label className={styles.label} htmlFor="onb-headline">
            Headline
          </label>
          <Input
            id="onb-headline"
            {...register("headline")}
            placeholder="e.g. Striker | Finishing & movement | Open to trials"
            maxLength={255}
            aria-invalid={!!errors.headline}
          />
          {errors.headline && (
            <p className={styles.errorMsg} role="alert">
              <Icon icon="mdi:alert-circle-outline" width={11} height={11} />
              {errors.headline.message}
            </p>
          )}

          {/* Suggestion chips */}
          <div className={styles.suggestRow}>
            <span className={styles.suggestLabel}>Suggestions</span>
            <button
              type="button"
              className={styles.shuffleBtn}
              onClick={() => setSeed((s) => s + 1)}
              aria-label="Show different suggestions"
            >
              <Icon icon="mdi:shuffle-variant" width={14} height={14} />
            </button>
          </div>
          <div className={styles.chipWrap}>
            {suggestions.map((text) => (
              <button
                key={text}
                type="button"
                className={styles.suggestChip}
                onClick={() => applySuggestion(text)}
                title="Tap to use — you can edit after"
              >
                {text}
              </button>
            ))}
          </div>
        </div>

        {/* ── About ── */}
        <div className={styles.field}>
          <label className={styles.label} htmlFor="onb-about">
            About
          </label>
          <textarea
            id="onb-about"
            className={styles.textarea}
            {...aboutReg}
            ref={(el) => {
              aboutReg.ref(el)
              aboutRef.current = el
            }}
            onChange={(e) => {
              aboutReg.onChange(e)
              autosize()
            }}
            placeholder="Tell the world about yourself…"
            rows={3}
            maxLength={ABOUT_SOFT_CAP}
            aria-invalid={!!errors.about}
          />
          <div className={styles.aboutMeta}>
            {errors.about ? (
              <p className={styles.errorMsg} role="alert">
                <Icon icon="mdi:alert-circle-outline" width={11} height={11} />
                {errors.about.message}
              </p>
            ) : (
              <span />
            )}
            <span className={styles.counter}>
              {aboutLen}/{ABOUT_SOFT_CAP}
            </span>
          </div>
        </div>

        {/* ── Height / Weight ── */}
        <div className={styles.row2}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="onb-height">
              Height (cm)
            </label>
            <Input
              id="onb-height"
              type="number"
              {...register("height_cm")}
              placeholder="178"
              min={HEIGHT_MIN}
              max={HEIGHT_MAX}
              step={1}
              aria-invalid={!!errors.height_cm}
            />
            {errors.height_cm && (
              <p className={styles.errorMsg} role="alert">
                <Icon icon="mdi:alert-circle-outline" width={11} height={11} />
                {errors.height_cm.message}
              </p>
            )}
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="onb-weight">
              Weight (kg)
            </label>
            <Input
              id="onb-weight"
              type="number"
              {...register("weight_kg")}
              placeholder="72.5"
              min={WEIGHT_MIN}
              max={WEIGHT_MAX}
              step={0.1}
              aria-invalid={!!errors.weight_kg}
            />
            {errors.weight_kg && (
              <p className={styles.errorMsg} role="alert">
                <Icon icon="mdi:alert-circle-outline" width={11} height={11} />
                {errors.weight_kg.message}
              </p>
            )}
          </div>
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
