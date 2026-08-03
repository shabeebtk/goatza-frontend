"use client"

/**
 * AchievementModal — add or edit one achievement.
 *
 * Mirrors CareerEntryModal: full-screen on mobile, centred card on desktop,
 * react-hook-form + Zod, sticky header and footer, portalled to <body>.
 *
 * Three rules here exist to match the backend rather than to be pretty:
 *   - Crediting a real organization sends the award to that org's verification
 *     queue; free text can only ever be self-reported. The combobox is what
 *     decides which, and the hint under it says so.
 *   - Editing a MATERIAL field of an already-verified award drops it back to
 *     pending server-side. That is a real consequence of pressing Save, so the
 *     warning appears before the press, not as a surprise after.
 *   - A linked career entry must be for the same sport. The picker only offers
 *     matching entries and the Zod rule catches the rest, so the owner is told
 *     while both fields are on screen instead of by a 400.
 */

import { useEffect, useMemo, useState } from "react"
import { useForm, type Resolver, type SubmitHandler } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Icon } from "@iconify/react"
import { toast } from "sonner"

import OrganizationCombobox, {
    type SelectedOrganization,
} from "@/features/career/components/OrganizationCombobox/OrganizationCombobox"
import { useUserCareer } from "@/features/career/hooks/useCareerQueries"
import type { CareerEntry } from "@/features/career/types"
import { formatCareerRange } from "@/features/career/utils/careerDates"
import {
    useMyUserSports,
    useSportsList,
} from "@/features/profile/hooks/useSportsQueries"
import type { Sport } from "@/features/profile/services/sports.api"
import Portal from "@/shared/components/ui/Portal/Portal"
import { useAuthStore } from "@/store/auth.store"
import {
    ACHIEVEMENT_LEVEL_LABELS,
    ACHIEVEMENT_TYPE_ICONS,
    ACHIEVEMENT_TYPE_LABELS,
} from "../../achievementMeta"
import {
    useCreateAchievement,
    useUpdateAchievement,
} from "../../hooks/useAchievementQueries"
import {
    toCreateAchievementPayload,
    toUpdateAchievementPayload,
} from "../../services/achievement.api"
import {
    ACHIEVEMENT_LEVELS,
    ACHIEVEMENT_TYPES,
    MAX_ACHIEVEMENT_EVENT_NAME_LENGTH,
    MAX_ACHIEVEMENT_TITLE_LENGTH,
    MAX_PINNED_ACHIEVEMENTS,
    achievementFormSchema,
    achievementToForm,
    emptyAchievementForm,
    type Achievement,
    type AchievementFormValues,
} from "../../types"
import { todayForInput } from "../../utils/achievementDates"
import AchievementImageField from "./AchievementImageField"
import styles from "./AchievementModal.module.css"

// ── Constants ─────────────────────────────────────────────────

/**
 * Fields the backend counts as material (AchievementService.MATERIAL_FIELDS).
 * Changing any of these on a verified award sends it back to pending. Kept in
 * sync by hand — `description`, `reference_link`, `career_entry` and
 * `is_pinned` are deliberately absent from both lists.
 */
const MATERIAL_FIELDS = [
    "title",
    "achievement_type",
    "sport",
    "event_name",
    "level",
    "awarded_by",
    "awarded_by_name",
    "achieved_date",
    "image",
] as const satisfies readonly (keyof AchievementFormValues)[]

type MaterialField = (typeof MATERIAL_FIELDS)[number]

/** True when a material field moved away from what the award was loaded with. */
const hasMaterialChange = (
    before: Pick<AchievementFormValues, MaterialField>,
    after: Pick<AchievementFormValues, MaterialField>
): boolean => MATERIAL_FIELDS.some((field) => before[field] !== after[field])

/** Client-side cap only — the column is a TextField with no server limit. */
const DESCRIPTION_LIMIT = 500

/** One-tap titles, ordered by how often they're the answer. */
const TITLE_SUGGESTIONS = [
    "Player of the Match",
    "Top Scorer",
    "League Winner",
    "Golden Boot",
    "Most Valuable Player",
] as const

// ── Field wrapper ─────────────────────────────────────────────

function Field({
    label,
    required,
    error,
    hint,
    children,
}: {
    label: string
    required?: boolean
    error?: string
    hint?: string
    children: React.ReactNode
}) {
    return (
        <div className={`${styles.field} ${error ? styles.fieldError : ""}`}>
            <label className={styles.fieldLabel}>
                {label}
                {required && (
                    <span className={styles.fieldRequired} aria-hidden="true">
                        *
                    </span>
                )}
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

// ── Shell ─────────────────────────────────────────────────────

interface AchievementModalProps {
    /** Omit to add; pass an achievement to edit it. */
    achievement?: Achievement
    /** How many of the owner's awards are already pinned. */
    pinnedCount: number
    onClose: () => void
}

/**
 * Shell: backdrop, header, and the wait for the data the form needs its
 * defaults from.
 *
 * The form is a separate component mounted only once the sport lists have
 * resolved, so `useForm` gets correct `defaultValues` on its first render.
 * Patching the sport in afterwards with an effect would work too, but it
 * flashes an empty select and makes the component unmemoizable.
 */
export default function AchievementModal({
    achievement,
    pinnedCount,
    onClose,
}: AchievementModalProps) {
    const isEdit = Boolean(achievement)

    const { data: sports, isLoading: sportsLoading } = useSportsList()
    const { data: mySports, isLoading: mySportsLoading } = useMyUserSports()

    useEffect(() => {
        document.body.style.overflow = "hidden"
        return () => {
            document.body.style.overflow = ""
        }
    }, [])

    // An edit already carries its own sport, so it doesn't wait on the user's
    // sports list just to compute a default it will never use.
    const ready = !sportsLoading && (isEdit || !mySportsLoading)

    const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) onClose()
    }

    return (
        // Portalled to <body>: the profile page animates in with
        // `animation: … both`, leaving a permanent transform that would make
        // this fixed backdrop position against the profile card (and get
        // clipped by its overflow) instead of covering the viewport.
        <Portal>
            <div
                className={styles.backdrop}
                onClick={handleBackdrop}
                role="dialog"
                aria-modal="true"
                aria-label={isEdit ? "Edit achievement" : "Add achievement"}
            >
                <div className={styles.modal}>
                    <div className={styles.header}>
                        <h2 className={styles.headerTitle}>
                            {isEdit ? "Edit Achievement" : "Add Achievement"}
                        </h2>
                        <button
                            className={styles.closeBtn}
                            onClick={onClose}
                            type="button"
                            aria-label="Close"
                        >
                            <Icon icon="mdi:close" width={20} height={20} />
                        </button>
                    </div>

                    {ready ? (
                        <AchievementForm
                            achievement={achievement}
                            sports={sports ?? []}
                            primarySportId={
                                mySports?.find((s) => s.is_primary)?.sport.id ??
                                mySports?.[0]?.sport.id ??
                                ""
                            }
                            pinnedCount={pinnedCount}
                            onClose={onClose}
                        />
                    ) : (
                        <div className={styles.loadingBody}>
                            <span className={styles.miniSpinner} aria-hidden="true" />
                            Loading…
                        </div>
                    )}
                </div>
            </div>
        </Portal>
    )
}

// ── Form ──────────────────────────────────────────────────────

interface AchievementFormProps {
    achievement?: Achievement
    sports: Sport[]
    /** The user's primary sport — the default for a new award. */
    primarySportId: string
    pinnedCount: number
    onClose: () => void
}

function AchievementForm({
    achievement,
    sports,
    primarySportId,
    pinnedCount,
    onClose,
}: AchievementFormProps) {
    const isEdit = Boolean(achievement)

    const ownUserId = useAuthStore((s) => s.user?.id)
    // The owner's own career entries, for the "During" picker. Already cached by
    // CareerSection on the same profile, so this is usually free.
    const { data: careerData } = useUserCareer(ownUserId)

    const createAchievement = useCreateAchievement()
    const updateAchievement = useUpdateAchievement()
    const saving = createAchievement.isPending || updateAchievement.isPending

    // The combobox needs the org's logo/username to render its chosen state;
    // the form only carries the id and the name.
    const [issuer, setIssuer] = useState<SelectedOrganization | null>(
        achievement && (achievement.awarded_by || achievement.awarded_by_name)
            ? {
                id: achievement.awarded_by?.id ?? null,
                name: achievement.awarded_by_name,
                logo: achievement.awarded_by?.logo,
                username: achievement.awarded_by?.username,
            }
            : null
    )

    // Not memoized: `defaultValues` is read once on mount, and the change
    // comparison below only reads fields off it. Memoizing here would put a
    // memo hook next to `watch()`, which stops the React Compiler optimising
    // this component at all.
    const initialValues: AchievementFormValues = achievement
        ? achievementToForm(achievement)
        : { ...emptyAchievementForm(), sport: primarySportId }

    const {
        register,
        handleSubmit,
        watch,
        setValue,
        reset,
        formState: { errors },
    } = useForm<AchievementFormValues>({
        resolver: zodResolver(
            achievementFormSchema
        ) as Resolver<AchievementFormValues>,
        defaultValues: initialValues,
    })

    // Watched field by field rather than with a bare `watch()`: the no-arg form
    // subscribes to the whole form object and makes the component unmemoizable.
    const title = watch("title")
    const watchedType = watch("achievement_type")
    const watchedSport = watch("sport")
    const achievedDate = watch("achieved_date")
    const watchedLevel = watch("level")
    const eventName = watch("event_name")
    const watchedIssuerId = watch("awarded_by")
    const watchedIssuerName = watch("awarded_by_name")
    const careerEntryId = watch("career_entry")
    const image = watch("image")
    const description = watch("description")
    const isPinned = watch("is_pinned")

    /**
     * Career entries the owner can actually link.
     *
     * Filtered to the chosen sport rather than shown-and-rejected: the backend
     * refuses a mismatch, and offering an option that is guaranteed to fail is
     * worse than not offering it. The Zod rule still guards the case where the
     * sport changes AFTER a link was made.
     */
    const careerOptions: CareerEntry[] = useMemo(() => {
        const entries = careerData?.results ?? []
        if (!watchedSport) return []
        return entries.filter((entry) => entry.sport.id === watchedSport)
    }, [careerData, watchedSport])

    /**
     * The linked entry when it is no longer offered — because the sport moved
     * under it. Kept so the select can still show what is currently linked
     * instead of silently appearing empty while the form holds a value.
     */
    const orphanedEntry = useMemo(() => {
        if (!careerEntryId) return null
        if (careerOptions.some((entry) => entry.id === careerEntryId)) return null
        return (
            (careerData?.results ?? []).find(
                (entry) => entry.id === careerEntryId
            ) ?? null
        )
    }, [careerData, careerOptions, careerEntryId])

    // ── Sport change ──────────────────────────────────────────
    const handleSportChange = (nextSportId: string) => {
        setValue("sport", nextSportId, { shouldValidate: true })

        // A linked entry for the old sport can't survive the move. Clearing it
        // rather than leaving it to fail validation matches how CareerEntryModal
        // drops stale positions — with one difference: the owner is told,
        // because unlike a position chip this is a link they deliberately made.
        const linked = (careerData?.results ?? []).find(
            (entry) => entry.id === careerEntryId
        )
        if (linked && linked.sport.id !== nextSportId) {
            setValue("career_entry", "", { shouldValidate: true })
            setValue("career_entry_sport", "", { shouldValidate: true })
            toast.info("Cleared the linked career entry — it's for a different sport")
        }
    }

    const handleCareerEntryChange = (nextId: string) => {
        setValue("career_entry", nextId, { shouldValidate: true })
        const linked = (careerData?.results ?? []).find(
            (entry) => entry.id === nextId
        )
        setValue("career_entry_sport", linked?.sport.id ?? "", {
            shouldValidate: true,
        })
    }

    // ── Issuer ↔ form wiring ──────────────────────────────────
    const handleIssuerChange = (next: SelectedOrganization | null) => {
        setIssuer(next)
        setValue("awarded_by", next?.id ?? "", { shouldValidate: true })
        setValue("awarded_by_name", next?.name ?? "", { shouldValidate: true })
    }

    // ── Pin ───────────────────────────────────────────────────
    // An already-pinned award doesn't count against its own cap, which is the
    // same rule the service applies with `exclude_id`.
    const otherPinnedCount = achievement?.is_pinned
        ? pinnedCount - 1
        : pinnedCount
    const pinCapReached = otherPinnedCount >= MAX_PINNED_ACHIEVEMENTS

    // ── "This will need re-verification" warning ──────────────
    // Mirrors the backend: only a MATERIAL change on an already-verified award
    // sends it back to pending. A description, link, career-link or pin edit
    // keeps the check mark, so none of them must raise this warning.
    const willResetVerification =
        achievement?.verification_status === "verified" &&
        hasMaterialChange(initialValues, {
            title,
            achievement_type: watchedType,
            sport: watchedSport,
            event_name: eventName,
            level: watchedLevel,
            awarded_by: watchedIssuerId,
            awarded_by_name: watchedIssuerName,
            achieved_date: achievedDate,
            image,
        })

    // ── Submit ────────────────────────────────────────────────
    const onSubmit: SubmitHandler<AchievementFormValues> = async (formValues) => {
        const creditedOrg = Boolean(formValues.awarded_by)

        try {
            if (achievement) {
                await updateAchievement.mutateAsync({
                    achievementId: achievement.id,
                    payload: toUpdateAchievementPayload(formValues),
                })
                toast.success(
                    willResetVerification && creditedOrg
                        ? `Updated — ${formValues.awarded_by_name} will be asked to verify it again`
                        : "Achievement updated"
                )
            } else {
                await createAchievement.mutateAsync(
                    toCreateAchievementPayload(formValues)
                )
                toast.success(
                    creditedOrg
                        ? `Added — verification requested from ${formValues.awarded_by_name}`
                        : "Achievement added"
                )
            }
            reset()
            onClose()
        } catch {
            // The mutation hooks already surface the server's message via
            // sonner; the modal stays open so the entered values aren't lost.
        }
    }

    return (
        <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className={styles.body}>
                {/* ── What ── */}
                <div className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <Icon icon="mdi:trophy-outline" width={16} height={16} />
                        <h3 className={styles.sectionTitle}>The award</h3>
                    </div>

                    <Field label="Title" required error={errors.title?.message}>
                        <input
                            className={styles.input}
                            {...register("title")}
                            placeholder="e.g. Golden Boot"
                            maxLength={MAX_ACHIEVEMENT_TITLE_LENGTH}
                            disabled={saving}
                        />
                        <div className={styles.suggestionRow}>
                            {TITLE_SUGGESTIONS.map((suggestion) => (
                                <button
                                    key={suggestion}
                                    className={`${styles.suggestionChip} ${title === suggestion ? styles.suggestionChipActive : ""
                                        }`}
                                    onClick={() =>
                                        setValue("title", suggestion, {
                                            shouldValidate: true,
                                        })
                                    }
                                    type="button"
                                    disabled={saving}
                                >
                                    {suggestion}
                                </button>
                            ))}
                        </div>
                    </Field>

                    <Field label="Type" error={errors.achievement_type?.message}>
                        <div className={styles.typeGrid}>
                            {ACHIEVEMENT_TYPES.map((type) => {
                                const active = watchedType === type
                                return (
                                    <button
                                        key={type}
                                        className={`${styles.typeOption} ${active ? styles.typeOptionActive : ""
                                            }`}
                                        onClick={() =>
                                            setValue("achievement_type", type, {
                                                shouldValidate: true,
                                            })
                                        }
                                        type="button"
                                        aria-pressed={active}
                                        disabled={saving}
                                    >
                                        <Icon
                                            icon={ACHIEVEMENT_TYPE_ICONS[type]}
                                            width={16}
                                            height={16}
                                        />
                                        {ACHIEVEMENT_TYPE_LABELS[type]}
                                    </button>
                                )
                            })}
                        </div>
                    </Field>

                    <div className={styles.row2}>
                        <Field label="Sport" required error={errors.sport?.message}>
                            <select
                                className={styles.selectField}
                                value={watchedSport}
                                onChange={(e) => handleSportChange(e.target.value)}
                                disabled={saving}
                            >
                                <option value="">Select sport</option>
                                {sports.map((sport) => (
                                    <option key={sport.id} value={sport.id}>
                                        {sport.name}
                                    </option>
                                ))}
                            </select>
                        </Field>

                        <Field label="Level" error={errors.level?.message}>
                            <select
                                className={styles.selectField}
                                {...register("level")}
                                disabled={saving}
                            >
                                <option value="">Not specified</option>
                                {ACHIEVEMENT_LEVELS.map((level) => (
                                    <option key={level} value={level}>
                                        {ACHIEVEMENT_LEVEL_LABELS[level]}
                                    </option>
                                ))}
                            </select>
                        </Field>
                    </div>

                    <Field
                        label="Date won"
                        required
                        error={errors.achieved_date?.message}
                        hint="The day it happened."
                    >
                        <input
                            className={styles.input}
                            type="date"
                            {...register("achieved_date")}
                            // Belt and braces with the Zod rule: the picker won't
                            // offer a future date, and typing one is still caught.
                            max={todayForInput()}
                            disabled={saving}
                        />
                    </Field>

                    <Field
                        label="Event"
                        error={errors.event_name?.message}
                        hint="Optional — e.g. Kerala Premier League 2024."
                    >
                        <input
                            className={styles.input}
                            {...register("event_name")}
                            placeholder="Kerala Premier League 2024"
                            maxLength={MAX_ACHIEVEMENT_EVENT_NAME_LENGTH}
                            disabled={saving}
                        />
                    </Field>
                </div>

                {/* ── Who gave it ── */}
                <div className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <Icon icon="mdi:shield-outline" width={16} height={16} />
                        <h3 className={styles.sectionTitle}>Issued by</h3>
                    </div>

                    <Field
                        label="Organization or federation"
                        error={errors.awarded_by_name?.message}
                        hint="Optional. Pick one that's on Goatza and it can verify this for you."
                    >
                        <OrganizationCombobox
                            value={issuer}
                            onChange={handleIssuerChange}
                            disabled={saving}
                            error={errors.awarded_by_name?.message}
                        />
                    </Field>
                </div>

                {/* ── When in your career ── */}
                <div className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <Icon icon="mdi:timeline-text-outline" width={16} height={16} />
                        <h3 className={styles.sectionTitle}>Career link</h3>
                    </div>

                    <Field
                        label="During"
                        error={errors.career_entry?.message}
                        hint={
                            watchedSport && careerOptions.length === 0
                                ? "No career entries for this sport yet — add one in Career first."
                                : "Optional — tie this to the stint you won it in."
                        }
                    >
                        <select
                            className={styles.selectField}
                            value={careerEntryId}
                            onChange={(e) => handleCareerEntryChange(e.target.value)}
                            disabled={saving || !watchedSport}
                        >
                            <option value="">Not linked</option>
                            {careerOptions.map((entry) => (
                                <option key={entry.id} value={entry.id}>
                                    {entry.organization_name} — {entry.title} (
                                    {formatCareerRange(entry)})
                                </option>
                            ))}
                            {/* The sport moved under an existing link. Shown so the
                                select isn't blank while the form holds a value, and
                                the Zod rule explains why it's invalid. */}
                            {orphanedEntry && (
                                <option value={orphanedEntry.id}>
                                    {orphanedEntry.organization_name} —{" "}
                                    {orphanedEntry.title} ({orphanedEntry.sport.name})
                                </option>
                            )}
                        </select>
                    </Field>
                </div>

                {/* ── Proof ── */}
                <div className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <Icon icon="mdi:image-outline" width={16} height={16} />
                        <h3 className={styles.sectionTitle}>Proof</h3>
                    </div>

                    <Field label="Photo">
                        <AchievementImageField
                            value={image}
                            disabled={saving}
                            onChange={({ url, publicId }) => {
                                setValue("image", url, { shouldValidate: true })
                                setValue("image_public_id", publicId, {
                                    shouldValidate: true,
                                })
                            }}
                        />
                    </Field>

                    <Field
                        label="Reference link"
                        error={errors.reference_link?.message}
                        hint="Optional — a news article or federation results page."
                    >
                        <input
                            className={styles.input}
                            type="url"
                            {...register("reference_link")}
                            placeholder="https://…"
                            inputMode="url"
                            disabled={saving}
                        />
                    </Field>
                </div>

                {/* ── Details ── */}
                <div className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <Icon icon="mdi:text-long" width={16} height={16} />
                        <h3 className={styles.sectionTitle}>Details</h3>
                    </div>

                    <Field
                        label="Description"
                        error={errors.description?.message}
                        hint={`${description?.length ?? 0}/${DESCRIPTION_LIMIT}`}
                    >
                        <textarea
                            className={`${styles.input} ${styles.textarea}`}
                            {...register("description")}
                            placeholder="How you won it, what it meant…"
                            rows={4}
                            maxLength={DESCRIPTION_LIMIT}
                            disabled={saving}
                        />
                    </Field>

                    <label className={styles.checkboxRow}>
                        <input
                            type="checkbox"
                            checked={isPinned}
                            onChange={(e) =>
                                setValue("is_pinned", e.target.checked, {
                                    shouldValidate: true,
                                })
                            }
                            disabled={saving || (!isPinned && pinCapReached)}
                        />
                        Pin to the top of my profile
                    </label>
                    <p className={styles.pinHint}>
                        {pinCapReached && !isPinned
                            ? `You already have ${MAX_PINNED_ACHIEVEMENTS} pinned. Unpin one first.`
                            : `${otherPinnedCount + (isPinned ? 1 : 0)} of ${MAX_PINNED_ACHIEVEMENTS} pinned.`}
                    </p>
                </div>

                {willResetVerification && (
                    <div className={styles.warning} role="status">
                        <Icon icon="mdi:information-outline" width={16} height={16} />
                        <span>
                            This achievement is verified. Saving these changes returns
                            it to <strong>pending verification</strong> until{" "}
                            {issuer?.name ?? "the organization"} confirms it again.
                        </span>
                    </div>
                )}
            </div>

            <div className={styles.footer}>
                <button
                    type="button"
                    className={styles.cancelBtn}
                    onClick={onClose}
                    disabled={saving}
                >
                    Cancel
                </button>
                <button type="submit" className={styles.saveBtn} disabled={saving}>
                    {saving ? (
                        <>
                            <span className={styles.miniSpinner} aria-hidden="true" />
                            Saving…
                        </>
                    ) : isEdit ? (
                        "Save Changes"
                    ) : (
                        "Add Achievement"
                    )}
                </button>
            </div>
        </form>
    )
}
