"use client"

/**
 * CareerEntryModal — add or edit one career entry.
 *
 * Mirrors EditOrgProfileModal: full-screen on mobile, centred card on desktop,
 * react-hook-form + Zod, sticky header and footer.
 *
 * Two rules here exist to match the backend rather than to be pretty:
 *   - Tagging a real organization sends the entry to that org's verification
 *     queue; free text can only ever be self-reported. The combobox is what
 *     decides which, and the hint under it says so.
 *   - Editing a MATERIAL field of an already-verified entry drops it back to
 *     pending server-side. That is a real consequence of pressing Save, so the
 *     warning appears before the press, not as a surprise after.
 */

import { useEffect, useMemo, useState } from "react"
import { useForm, type Resolver, type SubmitHandler } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Icon } from "@iconify/react"
import { toast } from "sonner"

import {
    useSportsList,
    useMyUserSports,
} from "@/features/profile/hooks/useSportsQueries"
import type { Sport } from "@/features/profile/services/sports.api"
import Portal from "@/shared/components/ui/Portal/Portal"
import type { UserRole } from "@/shared/constants/roles"
import { useAuthStore } from "@/store/auth.store"
import {
    CAREER_ENTRY_TYPES,
    CAREER_SQUAD_LEVELS,
    careerEntryFormSchema,
    careerEntryToForm,
    emptyCareerEntryForm,
    type CareerEntry,
    type CareerEntryFormValues,
} from "../../types"
import {
    CAREER_ENTRY_TYPE_LABELS,
    CAREER_SQUAD_LEVEL_LABELS,
} from "../../careerMeta"
import {
    toCreateCareerEntryPayload,
    toUpdateCareerEntryPayload,
} from "../../services/career.api"
import {
    useCreateCareerEntry,
    useUpdateCareerEntry,
} from "../../hooks/useCareerQueries"
import OrganizationCombobox, {
    type SelectedOrganization,
} from "../OrganizationCombobox/OrganizationCombobox"
import styles from "./CareerEntryModal.module.css"

// ── Constants ─────────────────────────────────────────────────

/**
 * Fields the backend counts as "material" (CareerEntryService.MATERIAL_FIELDS).
 * Changing any of these on a verified entry sends it back to pending. Kept in
 * sync by hand — `description` is deliberately absent from both lists.
 */
const MATERIAL_FIELDS = [
    "organization",
    "organization_name",
    "sport",
    "title",
    "entry_type",
    "squad_level",
    "age_group",
    "positions",
    "start_date",
    "end_date",
    "is_current",
] as const satisfies readonly (keyof CareerEntryFormValues)[]

type MaterialField = (typeof MATERIAL_FIELDS)[number]

/** True when a material field moved away from what the entry was loaded with. */
const hasMaterialChange = (
    before: Pick<CareerEntryFormValues, MaterialField>,
    after: Pick<CareerEntryFormValues, MaterialField>
): boolean =>
    MATERIAL_FIELDS.some((field) => {
        const a = before[field]
        const b = after[field]
        if (Array.isArray(a) && Array.isArray(b)) {
            return a.length !== b.length || a.some((id, i) => id !== b[i])
        }
        return a !== b
    })

/** Client-side cap only — the column is a TextField with no server limit. */
const DESCRIPTION_LIMIT = 500

/**
 * One-tap titles per role, most likely first.
 *
 * Deliberately about the ROLE only. Level and setting have their own fields —
 * "Youth", "Reserve" and "U17" are the squad/age inputs, "Academy" and "Loan"
 * are the entry type — so putting them in a title too would have the player
 * saying the same thing twice and make the timeline read badly.
 *
 * Typed against UserRole so a new role can't quietly fall through to the
 * player list, which is what `org_user` used to do.
 */
const TITLE_SUGGESTIONS: Record<UserRole, readonly string[]> = {
    player: ["Player", "Captain", "Vice-Captain", "Squad Player", "Trialist"],
    coach: [
        "Head Coach",
        "Assistant Coach",
        "GK Coach",
        "Youth Coach",
        "Fitness Coach",
        "Performance Analyst",
    ],
    scout: [
        "Scout",
        "Youth Scout",
        "Chief Scout",
        "Regional Scout",
        "Recruitment Analyst",
    ],
    // Someone who runs a club still has a career of their own, and it is
    // almost never a playing one.
    org_user: [
        "Team Manager",
        "Director",
        "Operations Manager",
        "Physiotherapist",
        "Team Staff",
    ],
}

const titleSuggestionsFor = (role?: UserRole): readonly string[] =>
    (role && TITLE_SUGGESTIONS[role]) || TITLE_SUGGESTIONS.player

const MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

// ── Month / year field ────────────────────────────────────────

/**
 * Careers are talked about in months, so the picker is two selects rather than
 * a date input — nobody remembers the day they signed. The stored value is the
 * first of the chosen month, which is what the API's DateField wants.
 */
function MonthYearField({
    value,
    onChange,
    disabled,
    ariaLabel,
}: {
    value: string
    onChange: (next: string) => void
    disabled?: boolean
    ariaLabel: string
}) {
    const currentYear = new Date().getFullYear()
    const years = useMemo(
        () =>
            Array.from({ length: 61 }, (_, i) => currentYear + 1 - i),
        [currentYear]
    )

    /**
     * A half-made selection has no representation in `value` — the form only
     * holds complete dates or "". Without somewhere to keep it, picking a year
     * would emit "" and immediately reset the year select, so the two halves
     * could never both be set.
     *
     * `value` still wins whenever it holds a real date, so there is nothing to
     * keep in sync: this is only consulted while the pair is incomplete. The
     * end-date field unmounts when "currently here" is ticked, which resets
     * this along with it.
     */
    const [partial, setPartial] = useState({ year: "", month: "" })

    const year = value ? value.slice(0, 4) : partial.year
    const month = value ? value.slice(5, 7) : partial.month

    const emit = (nextYear: string, nextMonth: string) => {
        setPartial({ year: nextYear, month: nextMonth })
        onChange(nextYear && nextMonth ? `${nextYear}-${nextMonth}-01` : "")
    }

    return (
        <div className={styles.monthYear}>
            <select
                className={styles.selectField}
                value={month}
                onChange={(e) => emit(year, e.target.value)}
                disabled={disabled}
                aria-label={`${ariaLabel} month`}
            >
                <option value="">Month</option>
                {MONTHS.map((label, index) => (
                    <option key={label} value={String(index + 1).padStart(2, "0")}>
                        {label}
                    </option>
                ))}
            </select>
            <select
                className={styles.selectField}
                value={year}
                onChange={(e) => emit(e.target.value, month)}
                disabled={disabled}
                aria-label={`${ariaLabel} year`}
            >
                <option value="">Year</option>
                {years.map((y) => (
                    <option key={y} value={String(y)}>
                        {y}
                    </option>
                ))}
            </select>
        </div>
    )
}

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

// ── Main ──────────────────────────────────────────────────────

interface CareerEntryModalProps {
    /** Omit to add; pass an entry to edit it. */
    entry?: CareerEntry
    onClose: () => void
}

/**
 * Shell: backdrop, header, and the wait for the data the form needs its
 * defaults from.
 *
 * The form is a separate component mounted only once `sports` and the user's
 * own sports have resolved, so `useForm` gets correct `defaultValues` on its
 * first render. Patching the sport in afterwards with an effect would work too,
 * but it flashes an empty select and makes the component unmemoizable.
 */
export default function CareerEntryModal({
    entry,
    onClose,
}: CareerEntryModalProps) {
    const isEdit = Boolean(entry)

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
                aria-label={isEdit ? "Edit career entry" : "Add career entry"}
            >
                <div className={styles.modal}>
                <div className={styles.header}>
                    <h2 className={styles.headerTitle}>
                        {isEdit ? "Edit Entry" : "Add Career"}
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
                    <CareerEntryForm
                        entry={entry}
                        sports={sports ?? []}
                        primarySportId={
                            mySports?.find((s) => s.is_primary)?.sport.id ??
                            mySports?.[0]?.sport.id ??
                            ""
                        }
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

interface CareerEntryFormProps {
    entry?: CareerEntry
    sports: Sport[]
    /** The user's primary sport — the default for a new entry. */
    primarySportId: string
    onClose: () => void
}

function CareerEntryForm({
    entry,
    sports,
    primarySportId,
    onClose,
}: CareerEntryFormProps) {
    const isEdit = Boolean(entry)

    const role = useAuthStore((s) => s.user?.role)
    // Positions describe where you play, which only means anything for a
    // player. A coach's "Head Coach at X" has no position.
    const showPositions = role === "player"

    const createEntry = useCreateCareerEntry()
    const updateEntry = useUpdateCareerEntry()
    const saving = createEntry.isPending || updateEntry.isPending

    // The combobox needs the org's logo/username to render its chosen state;
    // the form only carries the id and the name.
    const [organization, setOrganization] = useState<SelectedOrganization | null>(
        entry
            ? {
                id: entry.organization?.id ?? null,
                name: entry.organization_name,
                logo: entry.organization?.logo,
                username: entry.organization?.username,
            }
            : null
    )

    // The sport options come from the master catalog, which is the only place
    // that carries position IDs — UserSport only records position NAMES.
    //
    // Not memoized: `defaultValues` is read once on mount, and the change
    // comparison below only reads fields off it. Memoizing here would put a
    // memo hook next to `watch()`, which stops the React Compiler optimising
    // this component at all.
    const initialValues: CareerEntryFormValues = entry
        ? careerEntryToForm(entry)
        : { ...emptyCareerEntryForm(), sport: primarySportId }

    const {
        register,
        handleSubmit,
        watch,
        setValue,
        reset,
        formState: { errors },
    } = useForm<CareerEntryFormValues>({
        resolver: zodResolver(
            careerEntryFormSchema
        ) as Resolver<CareerEntryFormValues>,
        defaultValues: initialValues,
    })

    // Watched field by field rather than with a bare `watch()`: the no-arg form
    // subscribes to the whole form object and makes the component unmemoizable.
    const watchedSport = watch("sport")
    const isCurrent = watch("is_current")
    const selectedPositions = watch("positions")
    const description = watch("description")
    const title = watch("title")
    const watchedOrganization = watch("organization")
    const watchedOrganizationName = watch("organization_name")
    const watchedEntryType = watch("entry_type")
    const watchedSquadLevel = watch("squad_level")
    const watchedAgeGroup = watch("age_group")
    const startDate = watch("start_date")
    const endDate = watch("end_date")

    const selectedSport = sports.find((s) => s.id === watchedSport)
    const positionOptions = selectedSport?.positions ?? []

    const suggestions = titleSuggestionsFor(role)

    // ── Sport change clears positions ─────────────────────────
    const handleSportChange = (nextSportId: string) => {
        setValue("sport", nextSportId, { shouldValidate: true })
        // The old ids belong to a different sport — the API rejects the mix,
        // so they cannot quietly ride along.
        setValue("positions", [])
    }

    const togglePosition = (positionId: string) => {
        const next = selectedPositions.includes(positionId)
            ? selectedPositions.filter((id) => id !== positionId)
            : [...selectedPositions, positionId]
        setValue("positions", next, { shouldValidate: true })
    }

    // ── Organization ↔ form wiring ────────────────────────────
    const handleOrganizationChange = (next: SelectedOrganization | null) => {
        setOrganization(next)
        setValue("organization", next?.id ?? "", { shouldValidate: true })
        setValue("organization_name", next?.name ?? "", { shouldValidate: true })
    }

    // ── "This will need re-verification" warning ──────────────
    // Mirrors the backend: only a MATERIAL change on an already-verified entry
    // sends it back to pending. A description-only edit keeps the check mark,
    // so it must not raise this warning.
    //
    // Computed inline rather than memoized — it is eleven comparisons, and
    // feeding watched values into a useMemo is what makes react-hook-form and
    // the React Compiler disagree.
    const willResetVerification =
        entry?.verification_status === "verified" &&
        hasMaterialChange(initialValues, {
            organization: watchedOrganization,
            organization_name: watchedOrganizationName,
            sport: watchedSport,
            title,
            entry_type: watchedEntryType,
            squad_level: watchedSquadLevel,
            age_group: watchedAgeGroup,
            positions: selectedPositions,
            start_date: startDate,
            end_date: endDate,
            is_current: isCurrent,
        })

    // ── Submit ────────────────────────────────────────────────
    const onSubmit: SubmitHandler<CareerEntryFormValues> = async (formValues) => {
        const taggedOrg = Boolean(formValues.organization)

        try {
            if (entry) {
                await updateEntry.mutateAsync({
                    entryId: entry.id,
                    payload: toUpdateCareerEntryPayload(formValues),
                })
                toast.success(
                    willResetVerification && taggedOrg
                        ? `Updated — ${formValues.organization_name} will be asked to verify it again`
                        : "Career entry updated"
                )
            } else {
                await createEntry.mutateAsync(toCreateCareerEntryPayload(formValues))
                toast.success(
                    taggedOrg
                        ? `Added — verification requested from ${formValues.organization_name}`
                        : "Career entry added"
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
                        {/* ── Where ── */}
                        <div className={styles.section}>
                            <div className={styles.sectionHeader}>
                                <Icon icon="mdi:shield-outline" width={16} height={16} />
                                <h3 className={styles.sectionTitle}>Club</h3>
                            </div>

                            <Field
                                label="Club, academy or school"
                                required
                                error={errors.organization_name?.message}
                                hint="Pick one that's on Goatza and it can verify this entry for you."
                            >
                                <OrganizationCombobox
                                    value={organization}
                                    onChange={handleOrganizationChange}
                                    disabled={saving}
                                    error={errors.organization_name?.message}
                                />
                            </Field>
                        </div>

                        {/* ── What ── */}
                        <div className={styles.section}>
                            <div className={styles.sectionHeader}>
                                <Icon icon="mdi:account-star-outline" width={16} height={16} />
                                <h3 className={styles.sectionTitle}>Role</h3>
                            </div>

                            <Field label="Title" required error={errors.title?.message}>
                                <input
                                    className={styles.input}
                                    {...register("title")}
                                    placeholder="e.g. Player"
                                    maxLength={100}
                                    disabled={saving}
                                />
                                <div className={styles.suggestionRow}>
                                    {suggestions.map((suggestion) => (
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

                            {showPositions && positionOptions.length > 0 && (
                                <Field
                                    label="Positions"
                                    hint="Optional — tap the ones you played."
                                >
                                    <div className={styles.chipGrid}>
                                        {positionOptions.map((position) => {
                                            const active = selectedPositions.includes(position.id)
                                            return (
                                                <button
                                                    key={position.id}
                                                    className={`${styles.positionChip} ${active ? styles.positionChipActive : ""
                                                        }`}
                                                    onClick={() => togglePosition(position.id)}
                                                    type="button"
                                                    aria-pressed={active}
                                                    disabled={saving}
                                                >
                                                    {active && (
                                                        <Icon icon="mdi:check" width={12} height={12} />
                                                    )}
                                                    {position.name}
                                                </button>
                                            )
                                        })}
                                    </div>
                                </Field>
                            )}

                            <div className={styles.row2}>
                                <Field label="Type" error={errors.entry_type?.message}>
                                    <select
                                        className={styles.selectField}
                                        {...register("entry_type")}
                                        disabled={saving}
                                    >
                                        {CAREER_ENTRY_TYPES.map((type) => (
                                            <option key={type} value={type}>
                                                {CAREER_ENTRY_TYPE_LABELS[type]}
                                            </option>
                                        ))}
                                    </select>
                                </Field>

                                <Field label="Squad" error={errors.squad_level?.message}>
                                    <select
                                        className={styles.selectField}
                                        {...register("squad_level")}
                                        disabled={saving}
                                    >
                                        <option value="">Not specified</option>
                                        {CAREER_SQUAD_LEVELS.map((level) => (
                                            <option key={level} value={level}>
                                                {CAREER_SQUAD_LEVEL_LABELS[level]}
                                            </option>
                                        ))}
                                    </select>
                                </Field>
                            </div>

                            <Field
                                label="Age group"
                                error={errors.age_group?.message}
                                hint="Optional — e.g. U17."
                            >
                                <input
                                    className={styles.input}
                                    {...register("age_group")}
                                    placeholder="U17"
                                    maxLength={20}
                                    disabled={saving}
                                />
                            </Field>
                        </div>

                        {/* ── When ── */}
                        <div className={styles.section}>
                            <div className={styles.sectionHeader}>
                                <Icon icon="mdi:calendar-range-outline" width={16} height={16} />
                                <h3 className={styles.sectionTitle}>Dates</h3>
                            </div>

                            <Field label="Started" required error={errors.start_date?.message}>
                                <MonthYearField
                                    value={startDate}
                                    onChange={(next) =>
                                        // Only re-validate once the pair is complete. Validating
                                        // on a half-made selection flashes "Enter a valid date"
                                        // between choosing the month and the year; the submit
                                        // pass still catches a genuinely empty date.
                                        setValue("start_date", next, {
                                            shouldValidate: Boolean(next),
                                        })
                                    }
                                    disabled={saving}
                                    ariaLabel="Start"
                                />
                            </Field>

                            <label className={styles.checkboxRow}>
                                <input
                                    type="checkbox"
                                    checked={isCurrent}
                                    onChange={(e) => {
                                        setValue("is_current", e.target.checked, {
                                            shouldValidate: true,
                                        })
                                        // Clearing rather than hiding: the API rejects an end
                                        // date alongside is_current, and a hidden-but-set
                                        // value would fail validation invisibly.
                                        if (e.target.checked) {
                                            setValue("end_date", "", { shouldValidate: true })
                                        }
                                    }}
                                    disabled={saving}
                                />
                                I&apos;m currently here
                            </label>

                            {!isCurrent && (
                                <Field label="Ended" error={errors.end_date?.message}>
                                    <MonthYearField
                                        value={endDate}
                                        onChange={(next) =>
                                            setValue("end_date", next, {
                                                shouldValidate: Boolean(next),
                                            })
                                        }
                                        disabled={saving}
                                        ariaLabel="End"
                                    />
                                </Field>
                            )}
                        </div>

                        {/* ── Description ── */}
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
                                    placeholder="Trophies, promotions, appearances…"
                                    rows={4}
                                    maxLength={DESCRIPTION_LIMIT}
                                    disabled={saving}
                                />
                            </Field>
                        </div>

                        {willResetVerification && (
                            <div className={styles.warning} role="status">
                                <Icon icon="mdi:information-outline" width={16} height={16} />
                                <span>
                                    This entry is verified. Saving these changes returns it to{" "}
                                    <strong>pending verification</strong> until{" "}
                                    {organization?.name ?? "the club"} confirms it again.
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
                        <button
                            type="submit"
                            className={styles.saveBtn}
                            disabled={saving}
                        >
                            {saving ? (
                                <>
                                    <span className={styles.miniSpinner} aria-hidden="true" />
                                    Saving…
                                </>
                            ) : isEdit ? (
                                "Save Changes"
                            ) : (
                                "Add Entry"
                            )}
                        </button>
                    </div>
        </form>
    )
}
