"use client"

/**
 * MatchEntrySheet — add a fixture, log a played match, edit either.
 *
 * ONE component for all three, because the fields are the same fields. Three
 * components would be three copies of the stat block, the date rules and the
 * payload mapping, and they would drift the first time one of them was fixed.
 *
 * The design target is a player on a bus home, one-handed, tired, on a
 * mid-range Android phone: thirty seconds from tap to saved. Almost everything
 * unusual in here serves that —
 *
 *   - Today / Yesterday chips, because a diary is written after the fact.
 *   - Opponent suggestions read out of the React Query cache, so the twelfth
 *     entry against the same club is one tap and no endpoint.
 *   - Steppers beside every stat, so "2 goals" never opens a keyboard that
 *     would cover half the form.
 *   - Sport hidden when there is only one, match type defaulted from the last
 *     match, position defaulted from the player's primary. Three fields that
 *     are usually already right.
 *   - The photo uploads while the player keeps typing, and can fail without
 *     costing them the match.
 *
 * NO SPORT IS NAMED ANYWHERE IN THIS FILE. Every stat, its label, its unit and
 * whether it takes decimals comes from `useMatchStatFields(sportId)`. That rule
 * is the reason the catalog exists, and it is what makes a new sport a seed
 * command rather than a frontend release.
 *
 * ONE DELIBERATE DEPARTURE FROM THE FIELD ORDER IN THE BRIEF: stats sit ABOVE
 * the "More details" divider rather than below it with minutes. The brief calls
 * the fast path "fields 1 through 6 plus stats", and stats are the reason the
 * feature exists — putting them under a divider would add a scroll to the one
 * flow that has to fit on one screen. Minutes, rating, note, photo and the
 * career stint are what sits below.
 */

import { useEffect, useRef, useState } from "react"
import {
    useForm,
    type Resolver,
    type SubmitErrorHandler,
    type SubmitHandler,
} from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query"
import { Icon } from "@iconify/react"
import dayjs from "dayjs"
import { toast } from "sonner"

import { useUserCareer } from "@/features/career/hooks/useCareerQueries"
import type { CareerEntry } from "@/features/career/types"
import {
    useMyUserSports,
    useSportsList,
} from "@/features/profile/hooks/useSportsQueries"
import type { Sport, UserSport } from "@/features/profile/services/sports.api"
import Portal from "@/shared/components/ui/Portal/Portal"
import { useAuthStore } from "@/store/auth.store"

import {
    matchDiaryKeys,
    useCreateMatch,
    useMatchStatFields,
    useUpdateMatch,
} from "../../hooks/useMatchDiary"
import { MATCH_TYPE_LABELS, opponentLabel } from "../../matchDiaryMeta"
import {
    getMatchDiaryErrorMessage,
    toCreateMatchPayload,
    toPartialUpdateMatchPayload,
    toUpdateMatchPayload,
    type UpdateMatchPayload,
} from "../../services/matches.api"
import {
    DEFAULT_MATCH_TYPE,
    MATCH_TYPES,
    MAX_NOTES_LENGTH,
    MAX_OPPONENT_NAME_LENGTH,
    SELF_RATING_MAX,
    SELF_RATING_MIN,
    emptyMatchEntryForm,
    makeMatchEntryFormSchema,
    matchEntryToForm,
    todayIso,
    upcomingMatchToForm,
    type MatchEntry,
    type MatchEntryFormValues,
    type MatchList,
    type MatchResult,
    type MatchStatus,
    type MatchType,
    type UpcomingMatch,
} from "../../types"
import StatInputRow, { type StatInputChange } from "./StatInputRow"
import { useMatchPhotoUpload } from "./useMatchPhotoUpload"
import styles from "./MatchEntrySheet.module.css"

// ── Constants ─────────────────────────────────────────────────

/**
 * Built once at module scope, not per render.
 *
 * The two differ on ONE rule — whether a fixture may sit in the past — and
 * which applies is fixed for the life of the sheet. See
 * `MatchEntryFormContext`: an overdue fixture is in the past by definition, and
 * refusing to save it would break the exact flow the diary keeps nagging the
 * player to complete.
 */
const NEW_ENTRY_SCHEMA = makeMatchEntryFormSchema()
const EXISTING_FIXTURE_SCHEMA = makeMatchEntryFormSchema({
    isExistingFixture: true,
})

/** Won / Drawn / Lost, in the order a scoreline is read. `na` is "not set". */
const RESULT_CHOICES: { value: MatchResult; label: string }[] = [
    { value: "win", label: "Won" },
    { value: "draw", label: "Drawn" },
    { value: "loss", label: "Lost" },
]

/** How many previous opponents the chip row offers before it gets noisy. */
const OPPONENT_SUGGESTION_LIMIT = 8

/**
 * Which field the sheet scrolls to on a failed submit — top of the form down,
 * not the order Zod happened to report issues in. A player who is told about
 * the last problem first has to scroll up to find the first one.
 */
const FIELD_ORDER = [
    "date",
    "kickoff_time",
    "sport",
    "result",
    "opponent_name",
    "match_type",
    "position",
    "stats",
    "minutes_played",
    "self_rating",
    "notes",
    "career_entry",
] as const satisfies readonly (keyof MatchEntryFormValues)[]

// ── Cache-derived defaults ────────────────────────────────────

type DiaryHints = {
    /** Distinct opponents the player has faced, most recent first. */
    opponents: string[]
    /** The type of their most recent match — a better default than "Other". */
    recentMatchType: MatchType | null
}

/**
 * Read what the diary already knows out of the React Query cache.
 *
 * Deliberately NOT an endpoint. Everything here is a nicety — a suggestion
 * chip, a pre-picked select — so it is worth exactly as much as it costs, and
 * a request the player waits for is more than it is worth. When the cache is
 * cold (deep link straight to the sheet) the form simply opens with plain
 * defaults, which is the same form it always was.
 */
const readDiaryHints = (qc: QueryClient): DiaryHints => {
    const cached = qc.getQueriesData<InfiniteData<MatchList>>({
        queryKey: matchDiaryKeys.lists(),
    })

    // Several cached filter combinations can hold the same match; sorting by
    // date puts the newest first whichever page it came off.
    const entries = cached
        .flatMap(([, data]) => data?.pages.flatMap((page) => page.results) ?? [])
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

    const opponents: string[] = []
    const seen = new Set<string>()

    for (const entry of entries) {
        const name = entry.opponent_name.trim()
        if (!name) continue

        const key = name.toLowerCase()
        if (seen.has(key)) continue

        seen.add(key)
        opponents.push(name)
        if (opponents.length >= OPPONENT_SUGGESTION_LIMIT) break
    }

    return { opponents, recentMatchType: entries[0]?.match_type ?? null }
}

// ── Career stints ─────────────────────────────────────────────

/**
 * Was the player at this club on the day of the match?
 *
 * The end date needs care: career dates are month-granular (the career picker
 * stores the first of the chosen month), so a stint that ended in June covers
 * the whole of June and not just the 1st. Comparing raw strings would hide
 * every match played in a player's last month at a club — which is usually the
 * month with the matches worth attaching.
 */
const stintCoversDate = (stint: CareerEntry, date: string): boolean => {
    if (!date || date < stint.start_date) return false
    if (stint.is_current || !stint.end_date) return true
    return date <= dayjs(stint.end_date).endOf("month").format("YYYY-MM-DD")
}

// ── Field wrapper ─────────────────────────────────────────────

function Field({
    label,
    htmlFor,
    name,
    optional,
    error,
    hint,
    children,
}: {
    label: string
    htmlFor?: string
    /** Drives the scroll-to-first-error lookup on a failed submit. */
    name: keyof MatchEntryFormValues
    optional?: boolean
    error?: string
    hint?: string
    children: React.ReactNode
}) {
    return (
        <div
            className={`${styles.field} ${error ? styles.fieldInvalid : ""}`}
            data-field={name}
        >
            <label className={styles.fieldLabel} htmlFor={htmlFor}>
                {label}
                {optional && (
                    <span className={styles.fieldOptional}>optional</span>
                )}
            </label>

            {children}

            {error && (
                <p className={styles.fieldErrorMsg} role="alert">
                    <Icon icon="mdi:alert-circle-outline" width={12} height={12} />
                    {error}
                </p>
            )}
            {hint && !error && <p className={styles.fieldHint}>{hint}</p>}
        </div>
    )
}

// ── Shell ─────────────────────────────────────────────────────

export type MatchEntrySheetProps = {
    /** The match being edited or promoted — the full row, when the diary has it. */
    entry?: MatchEntry | null
    /**
     * A fixture from the "Up next" strip, for when the full entry is not
     * loaded. The lighter shape is enough to promote it, and passing it beats
     * the alternative: opening a blank sheet, which would create a SECOND row
     * for a match the player already scheduled.
     */
    fixture?: UpcomingMatch | null
    onClose: () => void
}

/**
 * Waits for the two catalogs the form needs its defaults from, then mounts it.
 *
 * The form is a separate component so `useForm` gets real `defaultValues` on
 * its first render — the same reasoning as CareerEntryModal. Patching the sport
 * and position in afterwards would work, but it flashes an empty select on the
 * one screen that is supposed to be finished in thirty seconds.
 */
export default function MatchEntrySheet({
    entry,
    fixture,
    onClose,
}: MatchEntrySheetProps) {
    const { data: sports, isLoading: sportsLoading } = useSportsList()
    const { data: mySports, isLoading: mySportsLoading } = useMyUserSports()

    const qc = useQueryClient()
    // Computed exactly once, on mount: these are defaults, and a suggestion row
    // that reshuffled itself while somebody was reading it would be worse than
    // no suggestions.
    const [hints] = useState(() => readDiaryHints(qc))

    useEffect(() => {
        const previous = document.body.style.overflow
        document.body.style.overflow = "hidden"
        return () => {
            document.body.style.overflow = previous
        }
    }, [])

    const ready = !sportsLoading && !mySportsLoading

    if (!ready) {
        return (
            <Portal>
                {/* Dismissible even while loading: if the catalog request hangs
                    there has to be a way out that isn't reloading the app. */}
                <div
                    className={styles.backdrop}
                    onClick={(event) => {
                        if (event.target === event.currentTarget) onClose()
                    }}
                >
                    <div className={styles.sheet}>
                        <div className={styles.loadingBody}>
                            <span
                                className={styles.miniSpinner}
                                aria-hidden="true"
                            />
                            Loading…
                        </div>
                    </div>
                </div>
            </Portal>
        )
    }

    return (
        <MatchEntryForm
            entry={entry ?? null}
            fixture={fixture ?? null}
            sports={sports ?? []}
            mySports={mySports ?? []}
            hints={hints}
            onClose={onClose}
        />
    )
}

// ── Form ──────────────────────────────────────────────────────

function MatchEntryForm({
    entry,
    fixture,
    sports,
    mySports,
    hints,
    onClose,
}: {
    entry: MatchEntry | null
    fixture: UpcomingMatch | null
    sports: Sport[]
    mySports: UserSport[]
    hints: DiaryHints
    onClose: () => void
}) {
    const existingId = entry?.id ?? fixture?.id ?? null
    const isEdit = existingId !== null
    /** True when the sheet was OPENED on a fixture — not when it now shows one. */
    const openedAsFixture = entry ? entry.status === "scheduled" : fixture !== null

    // ── Defaults ──────────────────────────────────────────────

    /**
     * The sports the picker offers. A player's own sports, which is what a
     * match is about — falling back to the master catalog only for someone who
     * has not added any yet, so the form is still usable rather than stuck on
     * "Pick a sport" with nothing to pick.
     */
    const sportOptions = mySports.length
        ? mySports.map((userSport) => userSport.sport)
        : sports.map((sport) => ({ id: sport.id, name: sport.name }))

    const primarySportId =
        mySports.find((userSport) => userSport.is_primary)?.sport.id ??
        mySports[0]?.sport.id ??
        sports[0]?.id ??
        ""

    /**
     * The player's primary position for a sport, as an ID.
     *
     * The lookup is a NAME match on purpose: `UserSport` records position
     * names, and only the master catalog carries the ids the API wants. Same
     * seam CareerEntryModal works around, same reason.
     */
    const primaryPositionIdFor = (sportId: string): string => {
        const userSport = mySports.find((item) => item.sport.id === sportId)
        const name =
            userSport?.positions.find((p) => p.is_primary)?.position ??
            userSport?.positions[0]?.position

        if (!name) return ""

        return (
            sports
                .find((sport) => sport.id === sportId)
                ?.positions.find((position) => position.name === name)?.id ?? ""
        )
    }

    const initialValues: MatchEntryFormValues = entry
        ? matchEntryToForm(entry)
        : fixture
            ? upcomingMatchToForm(fixture)
            : emptyMatchEntryForm({
                date: todayIso(),
                sport: primarySportId,
                match_type: hints.recentMatchType ?? DEFAULT_MATCH_TYPE,
                position: primaryPositionIdFor(primarySportId),
            })

    // ── Form ──────────────────────────────────────────────────

    const {
        register,
        handleSubmit,
        watch,
        setValue,
        formState: { errors, isDirty, isSubmitting, dirtyFields },
    } = useForm<MatchEntryFormValues>({
        resolver: zodResolver(
            openedAsFixture ? EXISTING_FIXTURE_SCHEMA : NEW_ENTRY_SCHEMA
        ) as Resolver<MatchEntryFormValues>,
        defaultValues: initialValues,
        // The sheet does its own scroll-then-focus, so both custom controls and
        // plain inputs behave the same way. React Hook Form's built-in focus
        // only reaches registered inputs and never scrolls.
        shouldFocusError: false,
    })

    // Watched one at a time rather than with a bare `watch()`, which subscribes
    // to the whole form object and makes the component unmemoizable.
    const status = watch("status")
    const watchedSport = watch("sport")
    const watchedDate = watch("date")
    const result = watch("result")
    const opponentName = watch("opponent_name")
    const position = watch("position")
    const selfRating = watch("self_rating")
    const notes = watch("notes")
    const careerEntryId = watch("career_entry")
    const stats = watch("stats")

    const isFixtureMode = status === "scheduled"

    // ── Data the form renders from ────────────────────────────

    const statFieldsQuery = useMatchStatFields(watchedSport)
    const catalog = statFieldsQuery.data?.results
    const primaryStats = (catalog ?? []).filter((field) => field.is_primary)
    const extraStats = (catalog ?? []).filter((field) => !field.is_primary)

    const userId = useAuthStore((s) => s.user?.id)
    const careerQuery = useUserCareer(userId)
    const stints = (careerQuery.data?.results ?? []).filter((stint) =>
        stintCoversDate(stint, watchedDate)
    )

    const positionOptions =
        sports.find((sport) => sport.id === watchedSport)?.positions ?? []

    const photo = useMatchPhotoUpload(entry?.photo_url ?? "")

    // ── Local UI state ────────────────────────────────────────

    const [showAllStats, setShowAllStats] = useState(false)
    const [showNote, setShowNote] = useState(Boolean(initialValues.notes))
    const [showPhoto, setShowPhoto] = useState(Boolean(entry?.photo_url))
    const [showStint, setShowStint] = useState(
        Boolean(initialValues.career_entry)
    )
    /** Per-stat "that was a whole number" style feedback, keyed by field id. */
    const [statNotes, setStatNotes] = useState<Record<string, string>>({})
    const [confirmingClose, setConfirmingClose] = useState(false)
    const [waitingForPhoto, setWaitingForPhoto] = useState(false)
    /**
     * The server's own words, kept on screen. The mutation hooks also toast it,
     * but a toast is gone in four seconds and a rejected save is something the
     * player has to act on while looking at the form.
     */
    const [submitError, setSubmitError] = useState<string | null>(null)

    const sheetRef = useRef<HTMLDivElement | null>(null)
    const bodyRef = useRef<HTMLDivElement | null>(null)
    const fileInputRef = useRef<HTMLInputElement | null>(null)

    /**
     * Move focus into the sheet, but onto the DIALOG and not into a field.
     *
     * Autofocusing the first input would open the date picker — or the keyboard
     * — before the player has looked at the form, on the one screen where the
     * fast path is mostly taps.
     */
    useEffect(() => {
        sheetRef.current?.focus({ preventScroll: true })
    }, [])

    const createMatch = useCreateMatch()
    const updateMatch = useUpdateMatch()
    const saving = isSubmitting || createMatch.isPending || updateMatch.isPending

    // ── Closing ───────────────────────────────────────────────

    const requestClose = () => {
        if (saving) return

        // `photo.staged` is here because a picked photo touches no form value
        // until submit, so `isDirty` alone would let somebody whose only change
        // was adding a photo close over it without being asked.
        if (isDirty || photo.staged) {
            setConfirmingClose(true)
            return
        }

        onClose()
    }

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return
            event.stopPropagation()
            requestClose()
        }

        window.addEventListener("keydown", onKeyDown)
        return () => window.removeEventListener("keydown", onKeyDown)
        // `requestClose` closes over form state that changes constantly;
        // re-binding on every render is cheaper than the alternatives and this
        // listener does nothing but read it.
    })

    // ── Field handlers ────────────────────────────────────────

    const setMode = (next: MatchStatus) => {
        setValue("status", next, { shouldValidate: true, shouldDirty: true })

        if (next !== "scheduled") return

        // A fixture cannot carry any of these — the server refuses it and so
        // does the database. Clearing them here means the player never fails
        // validation on a field the form has stopped showing them.
        setValue("result", "na")
        setValue("minutes_played", "")
        setValue("self_rating", null)
        setValue("stats", [])
        setStatNotes({})
    }

    const handleSportChange = (nextSportId: string) => {
        setValue("sport", nextSportId, {
            shouldValidate: true,
            shouldDirty: true,
        })
        // Both belong to the OLD sport and the API rejects either mix — a
        // foreign position outright, a foreign stat field by name. Neither can
        // quietly ride along.
        setValue("position", primaryPositionIdFor(nextSportId), {
            shouldDirty: true,
        })
        setValue("stats", [], { shouldDirty: true })
        setStatNotes({})
    }

    const setDate = (next: string) =>
        setValue("date", next, { shouldValidate: true, shouldDirty: true })

    const setResult = (next: MatchResult) =>
        setValue("result", result === next ? "na" : next, {
            shouldValidate: true,
            shouldDirty: true,
        })

    const setRating = (next: number) =>
        // Tapping the current mark again clears it. A rating is optional, and a
        // widget you can set but never unset is a trap.
        setValue("self_rating", selfRating === next ? null : next, {
            shouldValidate: true,
            shouldDirty: true,
        })

    const statValue = (fieldId: string): string =>
        stats.find((stat) => stat.stat_field_id === fieldId)?.value ?? ""

    const handleStatChange = (fieldId: string, change: StatInputChange) => {
        const exists = stats.some((stat) => stat.stat_field_id === fieldId)

        setValue(
            "stats",
            exists
                ? stats.map((stat) =>
                    stat.stat_field_id === fieldId
                        ? { ...stat, value: change.value }
                        : stat
                )
                : [...stats, { stat_field_id: fieldId, value: change.value }],
            { shouldValidate: true, shouldDirty: true }
        )

        setStatNotes((current) => {
            if (change.note) return { ...current, [fieldId]: change.note }
            if (!(fieldId in current)) return current

            const next = { ...current }
            delete next[fieldId]
            return next
        })
    }

    /**
     * The per-stat message, when Zod found something the keystroke filter could
     * not (a paste, mostly). React Hook Form types an array field's errors as a
     * union of "the array failed" and "an item failed", and only the second is
     * indexable — hence the narrowing.
     */
    const statErrorFor = (fieldId: string): string | undefined => {
        const index = stats.findIndex((stat) => stat.stat_field_id === fieldId)
        if (index < 0 || !Array.isArray(errors.stats)) return undefined

        const itemErrors = errors.stats as { value?: { message?: string } }[]
        return itemErrors[index]?.value?.message
    }

    /** The superRefine issue on the array as a whole, e.g. stats on a fixture. */
    const statsRootError =
        !Array.isArray(errors.stats) && typeof errors.stats?.message === "string"
            ? errors.stats.message
            : undefined

    /**
     * Stats the player has logged that the sport's catalog no longer lists.
     *
     * Only reachable when an admin retires a stat field after somebody logged
     * it. The server refuses an inactive field BY NAME, so re-sending it would
     * make the match unsaveable — the submit drops them, and this is what lets
     * the sheet say so instead of quietly losing a number.
     */
    const retiredStats = catalog
        ? stats.filter(
            (stat) =>
                stat.value.trim() &&
                !catalog.some((field) => field.id === stat.stat_field_id)
        )
        : []

    // ── Submit ────────────────────────────────────────────────

    const onInvalid: SubmitErrorHandler<MatchEntryFormValues> = (formErrors) => {
        const firstInvalid = FIELD_ORDER.find((name) => name in formErrors)
        if (!firstInvalid) return

        const node = bodyRef.current?.querySelector<HTMLElement>(
            `[data-field="${firstInvalid}"]`
        )
        if (!node) return

        // Wrapped because this runs INSIDE react-hook-form's submit promise: a
        // throw in here rejects it, which leaves `isSubmitting` stuck true and
        // the whole form disabled — the player would be looking at a validation
        // message on a form they can no longer edit. Scrolling somewhere nice
        // is never worth that.
        try {
            node.scrollIntoView?.({ block: "center", behavior: "smooth" })
            node
                .querySelector<HTMLElement>("input, select, textarea, button")
                ?.focus({ preventScroll: true })
        } catch {
            // Old or headless engines without scrollIntoView. The inline error
            // is already rendered; only the scroll is lost.
        }
    }

    const successMessage = (
        values: MatchEntryFormValues,
        photoFailed: boolean
    ): string => {
        const who = opponentLabel(values.opponent_name)

        const base = !existingId
            ? values.status === "scheduled"
                ? `Fixture added — ${who} on ${dayjs(values.date).format("D MMM")}`
                : `Logged ${who}`
            : openedAsFixture && values.status === "played"
                ? `Result logged — ${who}`
                : "Match updated"

        return photoFailed
            ? `${base}. The photo didn't upload — you can add it any time.`
            : base
    }

    const onSubmit: SubmitHandler<MatchEntryFormValues> = async (values) => {
        setSubmitError(null)

        // The photo never blocks the form while it uploads, but it does have to
        // be settled before the body is built. Still running: wait, and say so.
        // Failed: save the match without it. A lost photo must never cost the
        // player their stats.
        setWaitingForPhoto(photo.status === "uploading")
        const { photo: uploaded, failed: photoFailed } = await photo.settle()
        setWaitingForPhoto(false)

        const sendable: MatchEntryFormValues = {
            ...values,
            ...(uploaded ?? {}),
            // Never send a stat the catalog has stopped listing — see
            // `retiredStats`. Only filtered once the catalog has actually
            // loaded, or a slow request would wipe the stats it was late for.
            stats: catalog
                ? values.stats.filter((stat) =>
                    catalog.some((field) => field.id === stat.stat_field_id)
                )
                : values.stats,
        }

        /**
         * Taking a photo OFF a match has to be said out loud.
         *
         * `toCreateMatchPayload` omits the photo pair unless both halves are
         * set, and an omitted key means "leave it alone" server-side — so
         * "Remove" would look like it worked and change nothing. Two empty
         * strings is what `MatchService._clean_photo` reads as "clear it".
         *
         * Read off the form rather than the upload hook: `photo_url` starts as
         * whatever the entry had and only Remove empties it, which is exactly
         * the question being asked.
         */
        const removingExistingPhoto =
            Boolean(entry?.photo_url) && !uploaded && !values.photo_url

        try {
            if (!existingId) {
                await createMatch.mutateAsync(toCreateMatchPayload(sendable))
            } else if (fixture && !entry) {
                // Promoting straight from the "Up next" strip. The sheet only
                // ever held the lighter fixture shape, so anything it never
                // loaded is DROPPED from the PATCH rather than sent back as the
                // blank the form is holding.
                const omitted = [
                    !dirtyFields.notes && "notes",
                    !dirtyFields.career_entry && "career_entry",
                ].filter(Boolean) as (keyof UpdateMatchPayload)[]

                await updateMatch.mutateAsync({
                    matchId: existingId,
                    payload: toPartialUpdateMatchPayload(sendable, omitted),
                })
            } else {
                const payload = toUpdateMatchPayload(sendable)

                if (removingExistingPhoto) {
                    payload.photo_url = ""
                    payload.photo_public_id = ""
                }

                await updateMatch.mutateAsync({
                    matchId: existingId,
                    payload,
                })
            }

            toast.success(successMessage(sendable, photoFailed))
            onClose()
        } catch (err) {
            // The sheet stays open with everything the player typed still in
            // it. The mutation hook has already toasted; this puts the same
            // words somewhere they will still be when the toast has gone.
            setSubmitError(getMatchDiaryErrorMessage(err))
        }
    }

    // ── Derived copy ──────────────────────────────────────────

    const title = !isEdit
        ? "Log a match"
        : openedAsFixture
            ? "Your fixture"
            : "Edit match"

    const submitLabel = !existingId
        ? isFixtureMode
            ? "Add fixture"
            : "Log match"
        : openedAsFixture && !isFixtureMode
            ? "Log result"
            : "Save changes"

    const opponentSuggestions = hints.opponents
        .filter((name) => {
            const typed = opponentName.trim().toLowerCase()
            if (!typed) return true
            return (
                name.toLowerCase() !== typed &&
                name.toLowerCase().includes(typed)
            )
        })
        .slice(0, 6)

    // ── Render ────────────────────────────────────────────────

    return (
        <Portal>
            <div
                className={styles.backdrop}
                onClick={(event) => {
                    if (event.target === event.currentTarget) requestClose()
                }}
            >
                <div
                    ref={sheetRef}
                    tabIndex={-1}
                    className={styles.sheet}
                    role="dialog"
                    aria-modal="true"
                    aria-label={title}
                >
                    {/* ── Header ── */}
                    <div className={styles.header}>
                        <h2 className={styles.headerTitle}>{title}</h2>
                        <button
                            type="button"
                            className={styles.closeBtn}
                            onClick={requestClose}
                            disabled={saving}
                            aria-label="Close"
                        >
                            <Icon icon="mdi:close" width={20} height={20} />
                        </button>
                    </div>

                    <form
                        className={styles.form}
                        onSubmit={handleSubmit(onSubmit, onInvalid)}
                        noValidate
                    >
                        <div className={styles.body} ref={bodyRef}>
                            {/* ── Mode ──
                                Played first and by default: logging after the
                                fact is the common case by a distance. */}
                            <div
                                className={styles.segmented}
                                role="radiogroup"
                                aria-label="What is this?"
                            >
                                {(
                                    [
                                        { value: "played", label: "Played" },
                                        { value: "scheduled", label: "Upcoming" },
                                    ] as const
                                ).map((mode) => (
                                    <button
                                        key={mode.value}
                                        type="button"
                                        role="radio"
                                        aria-checked={status === mode.value}
                                        className={`${styles.segment} ${status === mode.value ? styles.segmentActive : ""
                                            }`}
                                        // Locked on an existing entry: a played
                                        // match cannot be un-played (the server
                                        // refuses it outright), and a fixture is
                                        // promoted by the button below, which is
                                        // the one action this screen exists for.
                                        disabled={isEdit || saving}
                                        onClick={() => setMode(mode.value)}
                                    >
                                        {mode.label}
                                    </button>
                                ))}
                            </div>

                            {/* ── Promote ──
                                The single most important control in the feature:
                                one PATCH that turns a fixture into a match. */}
                            {openedAsFixture && isFixtureMode && (
                                <button
                                    type="button"
                                    className={styles.promoteBtn}
                                    onClick={() => setMode("played")}
                                    disabled={saving}
                                >
                                    <Icon
                                        icon="mdi:clipboard-check-outline"
                                        width={18}
                                        height={18}
                                    />
                                    Log the result
                                </button>
                            )}

                            {openedAsFixture && !isFixtureMode && (
                                <button
                                    type="button"
                                    className={styles.undoBtn}
                                    onClick={() => setMode("scheduled")}
                                    disabled={saving}
                                >
                                    Not played yet — keep it scheduled
                                </button>
                            )}

                            {/* ── 1. Date ── */}
                            <Field
                                label="Date"
                                name="date"
                                htmlFor="match-date"
                                error={errors.date?.message}
                            >
                                <div className={styles.dateRow}>
                                    <input
                                        id="match-date"
                                        type="date"
                                        className={styles.input}
                                        disabled={saving}
                                        {...register("date")}
                                    />
                                </div>

                                {/* Two taps cover almost every entry: a diary is
                                    written on the way home or the next morning. */}
                                <div className={styles.chipRow}>
                                    {(isFixtureMode
                                        ? [
                                            { label: "Today", offset: 0 },
                                            { label: "Tomorrow", offset: 1 },
                                        ]
                                        : [
                                            { label: "Today", offset: 0 },
                                            { label: "Yesterday", offset: -1 },
                                        ]
                                    ).map((shortcut) => {
                                        const value = dayjs()
                                            .add(shortcut.offset, "day")
                                            .format("YYYY-MM-DD")

                                        return (
                                            <button
                                                key={shortcut.label}
                                                type="button"
                                                className={`${styles.chip} ${watchedDate === value
                                                    ? styles.chipActive
                                                    : ""
                                                    }`}
                                                onClick={() => setDate(value)}
                                                disabled={saving}
                                            >
                                                {shortcut.label}
                                            </button>
                                        )
                                    })}
                                </div>
                            </Field>

                            {/* Kick-off only matters for something that has not
                                happened yet — a played match's time is noise. */}
                            {isFixtureMode && (
                                <Field
                                    label="Kick-off"
                                    name="kickoff_time"
                                    htmlFor="match-kickoff"
                                    optional
                                    error={errors.kickoff_time?.message}
                                >
                                    <input
                                        id="match-kickoff"
                                        type="time"
                                        className={styles.input}
                                        disabled={saving}
                                        {...register("kickoff_time")}
                                    />
                                </Field>
                            )}

                            {/* ── 2. Sport ──
                                Hidden entirely for a one-sport player, which is
                                most of them. A select with one option is a tap
                                that can only ever produce the same answer. */}
                            {sportOptions.length > 1 && (
                                <Field
                                    label="Sport"
                                    name="sport"
                                    htmlFor="match-sport"
                                    error={errors.sport?.message}
                                >
                                    <select
                                        id="match-sport"
                                        className={styles.selectField}
                                        value={watchedSport}
                                        disabled={saving}
                                        onChange={(event) =>
                                            handleSportChange(event.target.value)
                                        }
                                    >
                                        <option value="">Pick a sport</option>
                                        {sportOptions.map((sport) => (
                                            <option key={sport.id} value={sport.id}>
                                                {sport.name}
                                            </option>
                                        ))}
                                    </select>
                                </Field>
                            )}

                            {/* ── 3. Result ── */}
                            {!isFixtureMode && (
                                <Field
                                    label="Result"
                                    name="result"
                                    optional
                                    error={errors.result?.message}
                                >
                                    <div
                                        className={styles.resultGroup}
                                        role="radiogroup"
                                        aria-label="Result"
                                    >
                                        {RESULT_CHOICES.map((choice) => (
                                            <button
                                                key={choice.value}
                                                type="button"
                                                role="radio"
                                                aria-checked={
                                                    result === choice.value
                                                }
                                                data-tone={choice.value}
                                                className={`${styles.resultBtn} ${result === choice.value
                                                    ? styles.resultBtnActive
                                                    : ""
                                                    }`}
                                                disabled={saving}
                                                onClick={() =>
                                                    setResult(choice.value)
                                                }
                                            >
                                                {choice.label}
                                            </button>
                                        ))}
                                    </div>
                                </Field>
                            )}

                            {/* ── 4. Opponent ── */}
                            <Field
                                label="Opponent"
                                name="opponent_name"
                                htmlFor="match-opponent"
                                optional
                                error={errors.opponent_name?.message}
                            >
                                <input
                                    id="match-opponent"
                                    className={styles.input}
                                    placeholder="Who did you play?"
                                    maxLength={MAX_OPPONENT_NAME_LENGTH}
                                    autoComplete="off"
                                    disabled={saving}
                                    {...register("opponent_name")}
                                />

                                {/* Read out of the diary cache, not an endpoint.
                                    This is what makes the twelfth match against
                                    the same club a single tap. */}
                                {opponentSuggestions.length > 0 && (
                                    <div className={styles.chipRow}>
                                        {opponentSuggestions.map((name) => (
                                            <button
                                                key={name}
                                                type="button"
                                                className={styles.chip}
                                                disabled={saving}
                                                onClick={() =>
                                                    setValue(
                                                        "opponent_name",
                                                        name,
                                                        {
                                                            shouldValidate: true,
                                                            shouldDirty: true,
                                                        }
                                                    )
                                                }
                                            >
                                                {name}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </Field>

                            {/* ── 5 + 6. Match type and position ── */}
                            <div className={styles.row2}>
                                <Field
                                    label="Type"
                                    name="match_type"
                                    htmlFor="match-type"
                                    error={errors.match_type?.message}
                                >
                                    <select
                                        id="match-type"
                                        className={styles.selectField}
                                        disabled={saving}
                                        {...register("match_type")}
                                    >
                                        {MATCH_TYPES.map((type) => (
                                            <option key={type} value={type}>
                                                {MATCH_TYPE_LABELS[type]}
                                            </option>
                                        ))}
                                    </select>
                                </Field>

                                {positionOptions.length > 0 && (
                                    <Field
                                        label="Position"
                                        name="position"
                                        htmlFor="match-position"
                                        error={errors.position?.message}
                                    >
                                        <select
                                            id="match-position"
                                            className={styles.selectField}
                                            value={position}
                                            disabled={saving}
                                            onChange={(event) =>
                                                setValue(
                                                    "position",
                                                    event.target.value,
                                                    { shouldDirty: true }
                                                )
                                            }
                                        >
                                            <option value="">Not set</option>
                                            {positionOptions.map((option) => (
                                                <option
                                                    key={option.id}
                                                    value={option.id}
                                                >
                                                    {option.name}
                                                </option>
                                            ))}
                                        </select>
                                    </Field>
                                )}
                            </div>

                            {/* ── Stats ──
                                Entirely catalog-driven. The three the admin
                                marked primary lead; the rest are one tap away. */}
                            {!isFixtureMode && (
                                <div
                                    className={styles.statsBlock}
                                    data-field="stats"
                                >
                                    <div className={styles.statsHeader}>
                                        <h3 className={styles.statsTitle}>
                                            Stats
                                        </h3>
                                        <span className={styles.statsHint}>
                                            Leave blank if you didn&apos;t count
                                        </span>
                                    </div>

                                    {statFieldsQuery.isLoading && (
                                        <div className={styles.statsLoading}>
                                            {[0, 1, 2].map((index) => (
                                                <span
                                                    key={index}
                                                    className={
                                                        styles.statSkeleton
                                                    }
                                                    aria-hidden="true"
                                                />
                                            ))}
                                        </div>
                                    )}

                                    {statFieldsQuery.isError && (
                                        <p className={styles.statsEmpty}>
                                            Couldn&apos;t load the stats for this
                                            sport. You can still log the match.
                                        </p>
                                    )}

                                    {catalog?.length === 0 && (
                                        <p className={styles.statsEmpty}>
                                            No stats are set up for this sport
                                            yet.
                                        </p>
                                    )}

                                    {primaryStats.map((field) => (
                                        <StatInputRow
                                            key={field.id}
                                            field={field}
                                            value={statValue(field.id)}
                                            error={statErrorFor(field.id)}
                                            note={statNotes[field.id] ?? null}
                                            disabled={saving}
                                            onChange={(change) =>
                                                handleStatChange(
                                                    field.id,
                                                    change
                                                )
                                            }
                                        />
                                    ))}

                                    {showAllStats &&
                                        extraStats.map((field) => (
                                            <StatInputRow
                                                key={field.id}
                                                field={field}
                                                value={statValue(field.id)}
                                                error={statErrorFor(field.id)}
                                                note={
                                                    statNotes[field.id] ?? null
                                                }
                                                disabled={saving}
                                                onChange={(change) =>
                                                    handleStatChange(
                                                        field.id,
                                                        change
                                                    )
                                                }
                                            />
                                        ))}

                                    {extraStats.length > 0 && (
                                        <button
                                            type="button"
                                            className={styles.moreStatsBtn}
                                            onClick={() =>
                                                setShowAllStats(!showAllStats)
                                            }
                                            disabled={saving}
                                        >
                                            <Icon
                                                icon={
                                                    showAllStats
                                                        ? "mdi:chevron-up"
                                                        : "mdi:plus"
                                                }
                                                width={15}
                                                height={15}
                                            />
                                            {showAllStats
                                                ? "Fewer stats"
                                                : `Add more (${extraStats.length})`}
                                        </button>
                                    )}

                                    {retiredStats.length > 0 && (
                                        <p className={styles.statsEmpty}>
                                            {retiredStats.length === 1
                                                ? "One stat you logged is no longer recorded for this sport and will be dropped when you save."
                                                : `${retiredStats.length} stats you logged are no longer recorded for this sport and will be dropped when you save.`}
                                        </p>
                                    )}

                                    {statsRootError && (
                                        <p
                                            className={styles.fieldErrorMsg}
                                            role="alert"
                                        >
                                            <Icon
                                                icon="mdi:alert-circle-outline"
                                                width={12}
                                                height={12}
                                            />
                                            {statsRootError}
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* ── More details ──
                                Everything past here is optional and rarely the
                                reason somebody opened this sheet. */}
                            {!isFixtureMode && (
                                <>
                                    <div className={styles.divider}>
                                        <span className={styles.dividerLabel}>
                                            More details
                                        </span>
                                    </div>

                                    {/* ── 7. Minutes ── */}
                                    <Field
                                        label="Minutes played"
                                        name="minutes_played"
                                        htmlFor="match-minutes"
                                        optional
                                        error={errors.minutes_played?.message}
                                    >
                                        <input
                                            id="match-minutes"
                                            className={styles.input}
                                            type="text"
                                            inputMode="numeric"
                                            autoComplete="off"
                                            placeholder="90"
                                            disabled={saving}
                                            {...register("minutes_played")}
                                        />
                                    </Field>

                                    {/* ── 9. Rating ──
                                        Never pre-selected: a default rating is a
                                        number the player did not give. */}
                                    <Field
                                        label="Your rating"
                                        name="self_rating"
                                        optional
                                        error={errors.self_rating?.message}
                                    >
                                        <div
                                            className={styles.ratingRow}
                                            role="radiogroup"
                                            aria-label="Rate your match out of 5"
                                        >
                                            {Array.from(
                                                {
                                                    length:
                                                        SELF_RATING_MAX -
                                                        SELF_RATING_MIN +
                                                        1,
                                                },
                                                (_, index) =>
                                                    SELF_RATING_MIN + index
                                            ).map((mark) => {
                                                const filled =
                                                    selfRating !== null &&
                                                    mark <= selfRating

                                                return (
                                                    <button
                                                        key={mark}
                                                        type="button"
                                                        role="radio"
                                                        aria-checked={
                                                            selfRating === mark
                                                        }
                                                        aria-label={`${mark} out of ${SELF_RATING_MAX}`}
                                                        className={`${styles.ratingBtn} ${filled
                                                            ? styles.ratingBtnOn
                                                            : ""
                                                            }`}
                                                        disabled={saving}
                                                        onClick={() =>
                                                            setRating(mark)
                                                        }
                                                    >
                                                        <Icon
                                                            icon={
                                                                filled
                                                                    ? "mdi:star"
                                                                    : "mdi:star-outline"
                                                            }
                                                            width={26}
                                                            height={26}
                                                        />
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </Field>

                                    {/* ── 10. Note ── */}
                                    {showNote ? (
                                        <Field
                                            label="Note"
                                            name="notes"
                                            htmlFor="match-notes"
                                            optional
                                            error={errors.notes?.message}
                                            hint={`${notes.length}/${MAX_NOTES_LENGTH}`}
                                        >
                                            <textarea
                                                id="match-notes"
                                                className={`${styles.input} ${styles.textarea}`}
                                                rows={3}
                                                maxLength={MAX_NOTES_LENGTH}
                                                placeholder="How did it go?"
                                                disabled={saving}
                                                {...register("notes")}
                                            />
                                        </Field>
                                    ) : (
                                        <button
                                            type="button"
                                            className={styles.disclosureBtn}
                                            onClick={() => setShowNote(true)}
                                            disabled={saving}
                                        >
                                            <Icon
                                                icon="mdi:note-plus-outline"
                                                width={16}
                                                height={16}
                                            />
                                            Add a note
                                        </button>
                                    )}

                                    {/* ── 11. Photo ── */}
                                    {showPhoto ? (
                                        <div className={styles.photoBlock}>
                                            <span className={styles.fieldLabel}>
                                                Photo
                                                <span
                                                    className={
                                                        styles.fieldOptional
                                                    }
                                                >
                                                    optional
                                                </span>
                                            </span>

                                            {photo.previewUrl ? (
                                                <div className={styles.photoCard}>
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img
                                                        src={photo.previewUrl}
                                                        alt=""
                                                        className={
                                                            styles.photoThumb
                                                        }
                                                    />

                                                    <div
                                                        className={
                                                            styles.photoMeta
                                                        }
                                                    >
                                                        <span
                                                            className={
                                                                styles.photoStatus
                                                            }
                                                        >
                                                            {photo.status ===
                                                                "uploading" && (
                                                                    <>
                                                                        <span
                                                                            className={
                                                                                styles.miniSpinner
                                                                            }
                                                                            aria-hidden="true"
                                                                        />
                                                                        Uploading…
                                                                    </>
                                                                )}
                                                            {photo.status ===
                                                                "ready" &&
                                                                "Ready"}
                                                            {photo.status ===
                                                                "failed" &&
                                                                "Didn't upload"}
                                                        </span>

                                                        <div
                                                            className={
                                                                styles.photoActions
                                                            }
                                                        >
                                                            {photo.status ===
                                                                "failed" && (
                                                                    <button
                                                                        type="button"
                                                                        className={
                                                                            styles.linkBtn
                                                                        }
                                                                        onClick={
                                                                            photo.retry
                                                                        }
                                                                        disabled={
                                                                            saving
                                                                        }
                                                                    >
                                                                        Try again
                                                                    </button>
                                                                )}
                                                            <button
                                                                type="button"
                                                                className={
                                                                    styles.linkBtn
                                                                }
                                                                onClick={() => {
                                                                    photo.clear()
                                                                    setValue(
                                                                        "photo_url",
                                                                        "",
                                                                        {
                                                                            shouldDirty:
                                                                                true,
                                                                        }
                                                                    )
                                                                    setValue(
                                                                        "photo_public_id",
                                                                        "",
                                                                        {
                                                                            shouldDirty:
                                                                                true,
                                                                        }
                                                                    )
                                                                }}
                                                                disabled={saving}
                                                            >
                                                                Remove
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <button
                                                    type="button"
                                                    className={
                                                        styles.disclosureBtn
                                                    }
                                                    onClick={() =>
                                                        fileInputRef.current?.click()
                                                    }
                                                    disabled={saving}
                                                >
                                                    <Icon
                                                        icon="mdi:camera-outline"
                                                        width={16}
                                                        height={16}
                                                    />
                                                    Choose a photo
                                                </button>
                                            )}

                                            {photo.error && (
                                                <p
                                                    className={
                                                        styles.fieldErrorMsg
                                                    }
                                                    role="alert"
                                                >
                                                    <Icon
                                                        icon="mdi:alert-circle-outline"
                                                        width={12}
                                                        height={12}
                                                    />
                                                    {photo.error}
                                                </p>
                                            )}

                                            <input
                                                ref={fileInputRef}
                                                type="file"
                                                accept="image/*"
                                                className={styles.fileInput}
                                                onChange={(event) => {
                                                    const picked =
                                                        event.target.files?.[0]
                                                    // Cleared first so picking
                                                    // the same file twice still
                                                    // fires a change.
                                                    event.target.value = ""
                                                    if (picked) photo.pick(picked)
                                                }}
                                            />
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            className={styles.disclosureBtn}
                                            onClick={() => {
                                                setShowPhoto(true)
                                                fileInputRef.current?.click()
                                            }}
                                            disabled={saving}
                                        >
                                            <Icon
                                                icon="mdi:camera-plus-outline"
                                                width={16}
                                                height={16}
                                            />
                                            Add a photo
                                        </button>
                                    )}

                                    {/* ── 12. Career stint ──
                                        Offered only when a stint actually covers
                                        the match date. This is what later makes
                                        the season stats credible to a recruiter,
                                        which is worth surfacing — but not worth
                                        a step in the fast path. */}
                                    {stints.length > 0 &&
                                        (showStint ? (
                                            <Field
                                                label="Career"
                                                name="career_entry"
                                                optional
                                                error={
                                                    errors.career_entry?.message
                                                }
                                            >
                                                <div
                                                    className={styles.stintList}
                                                >
                                                    {stints.map((stint) => {
                                                        const active =
                                                            careerEntryId ===
                                                            stint.id

                                                        return (
                                                            <button
                                                                key={stint.id}
                                                                type="button"
                                                                aria-pressed={
                                                                    active
                                                                }
                                                                className={`${styles.stintBtn} ${active
                                                                    ? styles.stintBtnActive
                                                                    : ""
                                                                    }`}
                                                                disabled={saving}
                                                                onClick={() =>
                                                                    setValue(
                                                                        "career_entry",
                                                                        active
                                                                            ? ""
                                                                            : stint.id,
                                                                        {
                                                                            shouldDirty:
                                                                                true,
                                                                        }
                                                                    )
                                                                }
                                                            >
                                                                {active && (
                                                                    <Icon
                                                                        icon="mdi:check"
                                                                        width={
                                                                            13
                                                                        }
                                                                        height={
                                                                            13
                                                                        }
                                                                    />
                                                                )}
                                                                Part of your spell
                                                                at{" "}
                                                                {
                                                                    stint.organization_name
                                                                }
                                                            </button>
                                                        )
                                                    })}
                                                </div>
                                            </Field>
                                        ) : (
                                            <button
                                                type="button"
                                                className={styles.disclosureBtn}
                                                onClick={() =>
                                                    setShowStint(true)
                                                }
                                                disabled={saving}
                                            >
                                                <Icon
                                                    icon="mdi:shield-outline"
                                                    width={16}
                                                    height={16}
                                                />
                                                Link this to a club
                                            </button>
                                        ))}
                                </>
                            )}

                            {submitError && (
                                <p className={styles.submitError} role="alert">
                                    <Icon
                                        icon="mdi:alert-circle-outline"
                                        width={15}
                                        height={15}
                                    />
                                    {submitError}
                                </p>
                            )}
                        </div>

                        {/* ── Footer ── */}
                        <div className={styles.footer}>
                            <button
                                type="submit"
                                className={styles.saveBtn}
                                disabled={saving}
                            >
                                {saving ? (
                                    <>
                                        <span
                                            className={styles.miniSpinner}
                                            aria-hidden="true"
                                        />
                                        {waitingForPhoto
                                            ? "Finishing the photo…"
                                            : "Saving…"}
                                    </>
                                ) : (
                                    submitLabel
                                )}
                            </button>
                        </div>
                    </form>

                    {/* ── Discard guard ──
                        A form filled in on a bus is not something to throw away
                        on a mis-tapped backdrop. */}
                    {confirmingClose && (
                        <div className={styles.confirmLayer}>
                            <div className={styles.confirmCard} role="alertdialog">
                                <p className={styles.confirmTitle}>
                                    Discard this match?
                                </p>
                                <p className={styles.confirmText}>
                                    You&apos;ll lose what you&apos;ve filled in.
                                </p>
                                <div className={styles.confirmActions}>
                                    <button
                                        type="button"
                                        className={styles.confirmKeep}
                                        onClick={() => setConfirmingClose(false)}
                                    >
                                        Keep editing
                                    </button>
                                    <button
                                        type="button"
                                        className={styles.confirmDiscard}
                                        onClick={onClose}
                                    >
                                        Discard
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </Portal>
    )
}
