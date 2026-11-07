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
 * It renders EVERYTHING the API already returns and the card has to leave out —
 * every stat, the kick-off time, the self rating, the note in full, the photo at
 * size. No new endpoint: `MatchEntrySerializer` was always sending all of it.
 *
 * ── The entry comes in as a prop, and that matters ────────────
 *
 * The owner looks it up in the loaded list on every render (see
 * useMatchDetailState) rather than handing over only what was tapped. So when
 * the edit sheet saves and closes, this re-renders from the refreshed list and
 * shows the new numbers, which is the exact moment somebody checks whether their
 * edit took.
 *
 * ── Deleting ─────────────────────────────────────────────────
 *
 * useDeleteMatch pulls the row out of the list at once. The owner keeps a
 * snapshot, so this stays mounted while the request runs: it shows "Deleting…",
 * closes on success, and on failure shows the error here with the row back in
 * the list. `onDeletingChange` is what tells the owner not to treat the missing
 * row as a reason to close.
 *
 * ── Scheduled matches ────────────────────────────────────────
 *
 * A fixture cannot carry a result, minutes, a rating or stats — the service
 * refuses it and `match_entry_scheduled_has_no_result` refuses it again — so
 * this does not render empty sections for them. Its primary action reads "Add
 * result", because that is the one thing anybody opens a fixture to do.
 *
 * ── Stacking ─────────────────────────────────────────────────
 *
 * The sheet opens on top of this one (`--z-match-sheet` over `--z-match-detail`)
 * and this stays mounted underneath, so one back press from the sheet lands here.
 * `covered` is how it knows to leave Esc to whatever is on top.
 */

import { useEffect, useId, useRef, useState } from "react"
import dayjs from "dayjs"
import { Icon } from "@iconify/react"

import MediaLightbox from "@/shared/components/ImageLightbox/MediaLightbox"
import ConfirmDialog from "@/shared/components/ui/ConfirmDialog/ConfirmDialog"
import Portal from "@/shared/components/ui/Portal/Portal"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { useBodyScrollLock } from "@/shared/hooks/useBodyScrollLock"
import { useHtmlFlag } from "@/shared/hooks/useHtmlFlag"
import { useMediaQuery } from "@/shared/hooks/useMediaQuery"
import { returnFocus } from "@/shared/services/focusReturn"

import { useGuardedBack } from "../../hooks/useGuardedBack"
import { useDeleteMatch } from "../../hooks/useMatchDiary"
import {
    MATCH_RESULT_LABELS,
    MATCH_TYPE_LABELS,
    opponentHeading,
    resultTone,
    statDetail,
} from "../../matchDiaryMeta"
import { getMatchDiaryErrorMessage } from "../../services/matches.api"
import { SELF_RATING_MAX, type MatchEntry } from "../../types"
import styles from "./MatchDetailModal.module.css"

export type MatchDetailModalProps = {
    entry: MatchEntry
    /** Hand over to the edit sheet, which opens on top of this modal. */
    onEdit: () => void
    onClose: () => void
    /** Something is open on top, so Esc is not ours to answer. */
    covered?: boolean
    /** A delete has started, or has failed and left the match in place. */
    onDeletingChange?: (deleting: boolean) => void
}

export default function MatchDetailModal({
    entry,
    onEdit,
    onClose,
    covered = false,
    onDeletingChange,
}: MatchDetailModalProps) {
    const dialogRef = useRef<HTMLDivElement | null>(null)
    const [confirmingDelete, setConfirmingDelete] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [deleteError, setDeleteError] = useState<string | null>(null)
    const [viewingPhoto, setViewingPhoto] = useState(false)

    const deleteMatch = useDeleteMatch()
    const toast = useToast()
    const titleId = useId()

    const isFixture = entry.status === "scheduled"
    const resultLabel = MATCH_RESULT_LABELS[entry.result]
    const tone = isFixture ? "neutral" : resultTone(entry.result)
    const date = dayjs(entry.date)
    const kickoff = entry.kickoff_time ? entry.kickoff_time.slice(0, 5) : null

    const metaLine = [
        MATCH_TYPE_LABELS[entry.match_type],
        entry.minutes_played !== null ? `${entry.minutes_played}′` : null,
        entry.position?.name,
    ]
        .filter(Boolean)
        .join(" · ")

    useBodyScrollLock()
    // Full-screen below 768px, over the bars: the toasts stop offsetting for them.
    const isPhone = useMediaQuery("(max-width: 767px)")
    useHtmlFlag("chrome-covered", isPhone)

    // A back press while the delete runs is refused: it closes on the answer.
    const { guard, close } = useGuardedBack(onClose, () => deleting)

    /** Focus in on open, and back to whatever opened it on close. */
    useEffect(() => {
        const opener = document.activeElement as HTMLElement | null
        dialogRef.current?.focus({ preventScroll: true })
        return () => returnFocus(opener)
    }, [])

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return
            // Each of these answers its own Esc. Answering here too would close
            // this modal out from under it.
            if (covered || confirmingDelete || viewingPhoto) return
            event.stopPropagation()
            if (!deleting) close()
        }

        window.addEventListener("keydown", onKeyDown)
        return () => window.removeEventListener("keydown", onKeyDown)
    })

    const handleDelete = async () => {
        setDeleteError(null)
        setDeleting(true)
        onDeletingChange?.(true)

        try {
            await deleteMatch.mutateAsync(entry.id)
            toast.show({
                title: "Match deleted",
                variant: "success",
                icon: "mdi:trash-can-outline",
            })
            close()
        } catch (err) {
            // The mutation has rolled the row back into the list and toasted, so
            // the modal stays open on a match that still exists. Said in here as
            // well, because the failure is something to act on while looking at it.
            setDeleteError(getMatchDiaryErrorMessage(err))
            setDeleting(false)
            onDeletingChange?.(false)
        }
    }

    return (
        <>
            {guard}

            <Portal>
                <div
                    className={styles.backdrop}
                    onClick={(event) => {
                        if (event.target !== event.currentTarget) return
                        if (!deleting) close()
                    }}
                >
                    <div
                        ref={dialogRef}
                        tabIndex={-1}
                        className={styles.modal}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={titleId}
                        aria-busy={deleting}
                    >
                        {/* ── Hero ── */}
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
                                    onClick={close}
                                    disabled={deleting}
                                    aria-label="Close"
                                >
                                    <Icon icon="mdi:close" width={20} height={20} />
                                </button>
                            </div>

                            <h2 className={styles.opponent} id={titleId}>
                                {opponentHeading(entry.opponent_name)}
                            </h2>

                            <p className={styles.when}>
                                {date.format("dddd D MMMM YYYY")}
                                {kickoff && ` · ${kickoff} kick-off`}
                            </p>

                            <p className={styles.metaLine}>{metaLine}</p>

                            {entry.career_entry && (
                                <p className={styles.career}>
                                    <span>Playing for</span>{" "}
                                    <span className={styles.careerValue}>
                                        <span className={styles.careerName}>
                                            {entry.career_entry.organization_name}
                                        </span>
                                        {/* Only `verified` earns the tick. */}
                                        {entry.career_entry.verification_status ===
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
                                </p>
                            )}
                        </div>

                        <div className={styles.body}>
                            {/* ── Stats ── All of them. The card stops at three. */}
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
                                                            className={styles.tileUnit}
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

                            {entry.notes.trim() && (
                                <div className={styles.note}>
                                    <span className={styles.noteLabel}>Your note</span>
                                    {/* pre-wrap: a note written as three short
                                        lines was written that way on purpose. */}
                                    <p className={styles.noteText}>{entry.notes}</p>
                                </div>
                            )}

                            {/* Blank string when there is no photo, never null. */}
                            {entry.photo_url && (
                                <button
                                    type="button"
                                    className={styles.photoBtn}
                                    onClick={() => setViewingPhoto(true)}
                                    aria-label="View photo full size"
                                >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={entry.photo_url}
                                        alt=""
                                        className={styles.photo}
                                        loading="lazy"
                                        decoding="async"
                                    />
                                </button>
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

                        {/* ── Footer ── */}
                        <div className={styles.footer}>
                            <button
                                type="button"
                                className={styles.editBtn}
                                onClick={onEdit}
                                disabled={deleting}
                            >
                                {deleting
                                    ? "Deleting…"
                                    : isFixture
                                        ? "Add result"
                                        : "Edit match"}
                            </button>
                            <button
                                type="button"
                                className={styles.trashBtn}
                                onClick={() => setConfirmingDelete(true)}
                                disabled={deleting}
                                aria-label="Delete match"
                            >
                                {deleting ? (
                                    <span
                                        className={styles.spinner}
                                        aria-hidden="true"
                                    />
                                ) : (
                                    <Icon
                                        icon="mdi:trash-can-outline"
                                        width={20}
                                        height={20}
                                    />
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                <ConfirmDialog
                    open={confirmingDelete}
                    title="Delete this match?"
                    message="This can't be undone."
                    confirmLabel="Delete"
                    cancelLabel="Cancel"
                    tone="danger"
                    onConfirm={() => {
                        setConfirmingDelete(false)
                        void handleDelete()
                    }}
                    onCancel={() => setConfirmingDelete(false)}
                />

                {viewingPhoto && (
                    <MediaLightbox
                        media={[{ media_type: "image", file_url: entry.photo_url }]}
                        label="Match photo"
                        onClose={() => setViewingPhoto(false)}
                    />
                )}
            </Portal>
        </>
    )
}
