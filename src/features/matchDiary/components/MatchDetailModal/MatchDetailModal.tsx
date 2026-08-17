"use client"

/**
 * MatchDetailModal — one match, read-only.
 *
 * The diary used to open the EDIT SHEET when a row was tapped, which meant
 * there was no way to simply read a match: everything the player had written
 * came back as form fields, and the only way out of looking at it was Cancel.
 * This is the read. Editing is a deliberate second step behind the button in
 * the footer, and deleting is a third behind a confirm.
 *
 * It renders EVERYTHING the API already returns and the card had to leave out —
 * every stat rather than four, the kick-off time, the self rating, the note in
 * full, the photo at size. No new endpoint: `MatchEntrySerializer` was always
 * sending all of it.
 *
 * ── The entry comes in as a prop, and that matters ────────────
 *
 * The page derives it from the loaded list BY ID rather than handing over a
 * snapshot taken when the card was tapped. So when the edit sheet saves and
 * closes, this re-renders from the refreshed list and shows the new numbers.
 * A stored object would show the old ones until the modal was closed and
 * reopened, which is the exact moment somebody checks whether their edit took.
 *
 * ── Scheduled matches ────────────────────────────────────────
 *
 * A fixture cannot carry a result, minutes, a rating or stats — the service
 * refuses it and `match_entry_scheduled_has_no_result` refuses it again — so
 * this does not render empty sections for them. Its primary action reads "Add
 * result", because that is the one thing anybody opens a fixture to do.
 *
 * ── Chrome ───────────────────────────────────────────────────
 *
 * Portal, body-scroll lock, backdrop click, Escape, focus in and focus back:
 * the same pattern as MatchEntrySheet, deliberately copied rather than
 * abstracted. There is no shared modal primitive in `shared/components/ui` —
 * only `Portal` — and inventing one from two callers would be guessing at the
 * third. What IS shared is the geometry: see MatchEntrySheet.module.css for why
 * every height in here is `dvh` and not `vh`.
 */

import { useEffect, useId, useRef, useState } from "react"
import dayjs from "dayjs"
import { Icon } from "@iconify/react"

import Portal from "@/shared/components/ui/Portal/Portal"
import { useToast } from "@/shared/components/ui/Toast/Toast"

import { useDeleteMatch } from "../../hooks/useMatchDiary"
import {
    MATCH_RESULT_LABELS,
    MATCH_TYPE_LABELS,
    opponentLabel,
    resultTone,
    statDetail,
} from "../../matchDiaryMeta"
import { getMatchDiaryErrorMessage } from "../../services/matches.api"
import { SELF_RATING_MAX, type MatchEntry } from "../../types"
import styles from "./MatchDetailModal.module.css"

export type MatchDetailModalProps = {
    entry: MatchEntry
    /** Hand over to the edit sheet. The page hides this modal while it is open. */
    onEdit: () => void
    onClose: () => void
}

/** One icon + label + value line. Rendered only when there is a value. */
function MetaRow({
    icon,
    label,
    children,
}: {
    icon: string
    label: string
    children: React.ReactNode
}) {
    return (
        <div className={styles.metaRow}>
            <span className={styles.metaIcon} aria-hidden="true">
                <Icon icon={icon} width={17} height={17} />
            </span>
            <span className={styles.metaLabel}>{label}</span>
            <span className={styles.metaValue}>{children}</span>
        </div>
    )
}

export default function MatchDetailModal({
    entry,
    onEdit,
    onClose,
}: MatchDetailModalProps) {
    const dialogRef = useRef<HTMLDivElement | null>(null)
    const [confirmingDelete, setConfirmingDelete] = useState(false)
    const [deleteError, setDeleteError] = useState<string | null>(null)

    const deleteMatch = useDeleteMatch()
    const toast = useToast()
    const titleId = useId()

    const isFixture = entry.status === "scheduled"
    const resultLabel = MATCH_RESULT_LABELS[entry.result]
    const tone = isFixture ? "neutral" : resultTone(entry.result)
    const date = dayjs(entry.date)

    /**
     * Focus in on open, and back to the card on close.
     *
     * The restore is conditional on nothing else having taken focus, because
     * "Edit match" unmounts this modal and mounts the sheet in the same commit:
     * this cleanup runs first, and putting focus back on the card underneath
     * would only be undone a moment later — or worse, would win the race and
     * leave a keyboard user outside the dialog that just opened.
     */
    useEffect(() => {
        const opener = document.activeElement as HTMLElement | null
        dialogRef.current?.focus({ preventScroll: true })

        return () => {
            if (!opener?.isConnected) return
            if (document.activeElement && document.activeElement !== document.body) {
                return
            }
            opener.focus({ preventScroll: true })
        }
    }, [])

    useEffect(() => {
        const previous = document.body.style.overflow
        document.body.style.overflow = "hidden"
        return () => {
            document.body.style.overflow = previous
        }
    }, [])

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return
            event.stopPropagation()

            // Escape backs out of the confirm first. A key that dismissed the
            // whole modal from here would make "are you sure" harder to leave
            // than it was to enter.
            if (confirmingDelete) {
                setConfirmingDelete(false)
                return
            }

            if (!deleteMatch.isPending) onClose()
        }

        window.addEventListener("keydown", onKeyDown)
        return () => window.removeEventListener("keydown", onKeyDown)
    }, [confirmingDelete, deleteMatch.isPending, onClose])

    const handleDelete = async () => {
        setDeleteError(null)

        try {
            await deleteMatch.mutateAsync(entry.id)
            toast.show({
                title: "Match deleted",
                variant: "success",
                icon: "mdi:trash-can-outline",
            })
            onClose()
        } catch (err) {
            // The mutation has already rolled the row back into the list, so
            // the modal stays open on a match that still exists. Said in here
            // as well as toasted, because the failure is something to act on
            // while looking at it.
            setDeleteError(getMatchDiaryErrorMessage(err))
            toast.show({
                title: getMatchDiaryErrorMessage(err),
                variant: "error",
            })
            setConfirmingDelete(false)
        }
    }

    const kickoff = entry.kickoff_time ? entry.kickoff_time.slice(0, 5) : null

    return (
        <Portal>
            <div
                className={styles.backdrop}
                onClick={(event) => {
                    if (event.target !== event.currentTarget) return
                    if (deleteMatch.isPending) return
                    onClose()
                }}
            >
                <div
                    ref={dialogRef}
                    tabIndex={-1}
                    className={styles.modal}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby={titleId}
                >
                    {/* ── Header ── */}
                    <div className={styles.header} data-tone={tone}>
                        <div className={styles.headerTop}>
                            {isFixture ? (
                                <span
                                    className={`${styles.chip} ${styles.chipScheduled}`}
                                >
                                    Scheduled
                                </span>
                            ) : (
                                // `na` prints nothing — see MATCH_RESULT_LABELS.
                                resultLabel && (
                                    <span
                                        className={`${styles.chip} ${styles.chipResult}`}
                                        data-tone={tone}
                                    >
                                        {resultLabel}
                                    </span>
                                )
                            )}

                            <button
                                type="button"
                                className={styles.closeBtn}
                                onClick={onClose}
                                disabled={deleteMatch.isPending}
                                aria-label="Close"
                            >
                                <Icon icon="mdi:close" width={20} height={20} />
                            </button>
                        </div>

                        <h2 className={styles.opponent} id={titleId}>
                            {opponentLabel(entry.opponent_name)}
                        </h2>

                        <p className={styles.when}>
                            {date.format("dddd D MMMM YYYY")}
                            {kickoff && ` · ${kickoff} kick-off`}
                        </p>
                    </div>

                    <div className={styles.body}>
                        {/* ── Stats ──
                            All of them. The card caps at four because a tile is
                            64px wide there; here there is room for twelve. */}
                        {entry.stats.length > 0 && (
                            <div className={styles.tiles}>
                                {entry.stats.map((stat) => {
                                    const display = statDetail(stat)

                                    return (
                                        <div
                                            key={stat.stat_field_id}
                                            className={styles.tile}
                                        >
                                            <span className={styles.tileValue}>
                                                {display.value}
                                                {display.unit && (
                                                    <span
                                                        className={
                                                            styles.tileUnit
                                                        }
                                                    >
                                                        {display.unit}
                                                    </span>
                                                )}
                                            </span>
                                            <span className={styles.tileLabel}>
                                                {display.label}
                                            </span>
                                        </div>
                                    )
                                })}
                            </div>
                        )}

                        {/* ── Rating ──
                            Absent entirely when unrated. Five empty outlines
                            would read as "rated zero", which the form cannot
                            even produce. */}
                        {entry.self_rating !== null && (
                            <div className={styles.rating}>
                                <span className={styles.ratingLabel}>
                                    How you felt you played
                                </span>
                                <span
                                    className={styles.ratingStars}
                                    role="img"
                                    aria-label={`${entry.self_rating} out of ${SELF_RATING_MAX}`}
                                >
                                    {Array.from(
                                        { length: SELF_RATING_MAX },
                                        (_, index) => (
                                            <Icon
                                                key={index}
                                                icon={
                                                    index <
                                                        (entry.self_rating ?? 0)
                                                        ? "mdi:star"
                                                        : "mdi:star-outline"
                                                }
                                                width={20}
                                                height={20}
                                                aria-hidden="true"
                                            />
                                        )
                                    )}
                                </span>
                            </div>
                        )}

                        {/* ── Meta ──
                            Every row is omitted when its value is missing. A
                            list of "—" is not information. */}
                        <div className={styles.meta}>
                            <MetaRow icon="mdi:tag-outline" label="Type">
                                {MATCH_TYPE_LABELS[entry.match_type]}
                            </MetaRow>

                            {entry.position && (
                                <MetaRow
                                    icon="mdi:account-outline"
                                    label="Position"
                                >
                                    {entry.position.name}
                                </MetaRow>
                            )}

                            {entry.minutes_played !== null && (
                                <MetaRow
                                    icon="mdi:timer-outline"
                                    label="Minutes"
                                >
                                    {entry.minutes_played}
                                </MetaRow>
                            )}

                            {entry.career_entry && (
                                <MetaRow
                                    icon="mdi:shield-outline"
                                    label="Playing for"
                                >
                                    <span className={styles.careerValue}>
                                        {entry.career_entry.organization_name}
                                        {/* Only `verified` earns the tick. */}
                                        {entry.career_entry
                                            .verification_status ===
                                            "verified" && (
                                                <span
                                                    className={styles.verified}
                                                    role="img"
                                                    aria-label="Verified"
                                                >
                                                    <Icon
                                                        icon="mdi:check-decagram"
                                                        width={14}
                                                        height={14}
                                                        aria-hidden="true"
                                                    />
                                                </span>
                                            )}
                                    </span>
                                </MetaRow>
                            )}
                        </div>

                        {entry.notes.trim() && (
                            <div className={styles.note}>
                                <span className={styles.noteLabel}>
                                    Your note
                                </span>
                                {/* pre-wrap: a note written as three short
                                    lines was written that way on purpose. */}
                                <p className={styles.noteText}>{entry.notes}</p>
                            </div>
                        )}

                        {/* Blank string when there is no photo, never null. */}
                        {entry.photo_url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={entry.photo_url}
                                alt=""
                                className={styles.photo}
                                loading="lazy"
                                decoding="async"
                            />
                        )}

                        {deleteError && (
                            <p className={styles.error} role="alert">
                                <Icon
                                    icon="mdi:alert-circle-outline"
                                    width={15}
                                    height={15}
                                />
                                {deleteError}
                            </p>
                        )}
                    </div>

                    {/* ── Footer ──
                        The confirm REPLACES the footer rather than opening a
                        second dialog on top of this one. A dialog over a dialog
                        is two Escape keys, two backdrops and two focus traps
                        for a question with two answers. */}
                    <div className={styles.footer}>
                        {confirmingDelete ? (
                            <>
                                <p className={styles.confirmText}>
                                    Delete this match?
                                </p>
                                <div className={styles.confirmActions}>
                                    <button
                                        type="button"
                                        className={styles.cancelBtn}
                                        onClick={() =>
                                            setConfirmingDelete(false)
                                        }
                                        disabled={deleteMatch.isPending}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        className={styles.deleteBtn}
                                        onClick={() => void handleDelete()}
                                        disabled={deleteMatch.isPending}
                                    >
                                        {deleteMatch.isPending
                                            ? "Deleting…"
                                            : "Delete"}
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    className={styles.editBtn}
                                    onClick={onEdit}
                                >
                                    {isFixture ? "Add result" : "Edit match"}
                                </button>
                                <button
                                    type="button"
                                    className={styles.trashBtn}
                                    onClick={() => setConfirmingDelete(true)}
                                    aria-label="Delete match"
                                >
                                    <Icon
                                        icon="mdi:trash-can-outline"
                                        width={20}
                                        height={20}
                                    />
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </Portal>
    )
}
