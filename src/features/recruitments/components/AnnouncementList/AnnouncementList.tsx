/**
 * Announcements on a recruitment.
 *
 * THE "SENDING IN THE BACKGROUND" STATE. Posting an announcement queues one
 * delivery row per recipient per channel; a cron drains them every few
 * minutes. So a freshly posted announcement is legitimately all-pending, and
 * showing "Delivered to 0 of 142" would look broken when nothing is wrong.
 * The summary therefore reads three different ways:
 *
 *   still draining   "Sending… 12 of 142 delivered."
 *   finished         "Delivered to 138 of 142."
 *   with failures    a second line, "4 failed", never folded into the first —
 *                    a failure the org cannot see is one they cannot act on.
 *
 * Only the OWNER sees any of it. `delivery_summary` is null for a player, and
 * how many people got the message is the org's business.
 */

"use client"

import { useState } from "react"
import { Icon } from "@iconify/react"
import dayjs from "dayjs"

import { getApiErrorMessage } from "@/core/api/getApiErrorMessage"
import { useToast } from "@/shared/components/ui/Toast/Toast"

import {
    useAnnouncements,
    useDeleteAnnouncement,
} from "../../hooks/useAnnouncements"
import type { Announcement, DeliverySummary } from "../../services/announcements.api"
import { formatSessionDate } from "../../sessionDisplay"
import { FALLBACK_TRIAL_TIME_ZONE } from "../../trialEnded"
import styles from "./AnnouncementList.module.css"

/** The sentence under an announcement, for the org only. */
function deliveryLine(summary: DeliverySummary, recipients: number): string {
    const delivered = summary.sent
    // Skipped rows were decided at write time (no email on file, a block) and
    // will never move, so they count as resolved — otherwise "138 of 142"
    // would sit there forever waiting on four people it was never going to
    // reach.
    const inFlight = summary.pending

    if (inFlight > 0) {
        return `Sending… ${delivered} of ${recipients} delivered.`
    }
    return `Delivered to ${delivered} of ${recipients}.`
}

function AnnouncementRow({
    announcement,
    canManage,
    onDelete,
    deleting,
    timeZone,
}: {
    announcement: Announcement
    canManage: boolean
    onDelete: (id: string) => void
    deleting: boolean
    timeZone: string
}) {
    const [confirming, setConfirming] = useState(false)
    const summary = announcement.delivery_summary

    return (
        <article className={styles.item}>
            <header className={styles.itemHead}>
                <h4 className={styles.title}>{announcement.title}</h4>
                <time className={styles.when} dateTime={announcement.created_at}>
                    {dayjs(announcement.created_at).fromNow()}
                </time>
            </header>

            <p className={styles.body}>{announcement.body}</p>

            {announcement.session && (
                <p className={styles.scope}>
                    <Icon icon="mdi:calendar-check" width={12} height={12} />
                    About {formatSessionDate(announcement.session.date, timeZone)}
                    {announcement.session.title ? ` · ${announcement.session.title}` : ""}
                </p>
            )}

            {canManage && summary && (
                <p className={styles.delivery}>
                    <Icon
                        icon={summary.pending > 0 ? "mdi:progress-clock" : "mdi:check-circle-outline"}
                        width={13}
                        height={13}
                    />
                    {deliveryLine(summary, announcement.recipients_count)}
                </p>
            )}

            {canManage && summary && summary.failed > 0 && (
                <p className={styles.failed}>
                    <Icon icon="mdi:alert-circle-outline" width={13} height={13} />
                    {summary.failed} failed
                </p>
            )}

            {canManage && (
                confirming ? (
                    <div className={styles.confirm}>
                        <span>
                            Remove this announcement? Notifications and messages
                            already sent can&apos;t be recalled.
                        </span>
                        <div className={styles.confirmActions}>
                            <button
                                className={styles.ghost}
                                onClick={() => setConfirming(false)}
                                type="button"
                                disabled={deleting}
                            >
                                Cancel
                            </button>
                            <button
                                className={styles.danger}
                                onClick={() => onDelete(announcement.id)}
                                type="button"
                                disabled={deleting}
                            >
                                Remove
                            </button>
                        </div>
                    </div>
                ) : (
                    <button
                        className={styles.remove}
                        onClick={() => setConfirming(true)}
                        type="button"
                    >
                        <Icon icon="mdi:trash-can-outline" width={13} height={13} />
                        Remove
                    </button>
                )
            )}
        </article>
    )
}

export default function AnnouncementList({
    recruitmentId,
    canManage = false,
    onWatchRef,
    emptyLabel,
    timeZone = FALLBACK_TRIAL_TIME_ZONE,
}: {
    recruitmentId: string
    /**
     * The recruitment's own zone, for the "About <date>" line. Defaulted
     * rather than required because this component is handed only an id —
     * every caller does hold the recruitment and passes it.
     */
    timeZone?: string
    /** Owner / admin: shows the delivery summary and the remove control. */
    canManage?: boolean
    /** Hands the parent the "watch the outbox drain" callback after a send. */
    onWatchRef?: (watch: () => void) => void
    emptyLabel?: string
}) {
    const toast = useToast()
    const { data, isLoading, watchDeliveries } = useAnnouncements(recruitmentId)
    const { mutate: remove, isPending: deleting } =
        useDeleteAnnouncement(recruitmentId)

    // Handed up so the composer's onSent can start the bounded poll.
    onWatchRef?.(watchDeliveries)

    const announcements = data?.results ?? []

    if (isLoading) return null
    if (announcements.length === 0) {
        return emptyLabel ? <p className={styles.empty}>{emptyLabel}</p> : null
    }

    const onDelete = (id: string) =>
        remove(id, {
            onSuccess: (result) =>
                toast.show({
                    title: "Announcement removed",
                    // The API says this in words; repeat it rather than
                    // implying the message was unsent.
                    message: result.recalled
                        ? undefined
                        : "Messages already sent can't be recalled.",
                    variant: "success",
                }),
            onError: (error) =>
                toast.show({
                    title: getApiErrorMessage(error, "Couldn't remove it."),
                    variant: "error",
                }),
        })

    return (
        <section className={styles.wrap} aria-label="Announcements">
            <div className={styles.head}>
                <Icon icon="mdi:bullhorn-outline" width={15} height={15} />
                <h3 className={styles.heading}>Updates</h3>
            </div>

            {announcements.map((announcement) => (
                <AnnouncementRow
                    key={announcement.id}
                    announcement={announcement}
                    canManage={canManage}
                    onDelete={onDelete}
                    deleting={deleting}
                    timeZone={timeZone}
                />
            ))}
        </section>
    )
}
