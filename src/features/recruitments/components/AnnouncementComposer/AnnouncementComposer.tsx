/**
 * The announcement composer.
 *
 * THE LIVE RECIPIENT COUNT IS THE POINT. The send button never reads "Send"
 * on its own — it always carries a number, because an org sending blind to
 * 300 people is the mistake this whole screen exists to prevent. Changing the
 * audience or the date re-asks the server, through the same resolver that
 * writes the outbox, so the number shown IS the number that gets written.
 *
 * NOTHING IS SENT WHEN THIS CLOSES. The API queues deliveries and a cron
 * drains them, so the copy says "will notify" and the list afterwards says
 * "Sending…". Claiming "sent" here would be a lie for the next few minutes.
 */

"use client"

import { useEffect, useMemo, useState } from "react"
import { Icon } from "@iconify/react"

import { getApiErrorMessage } from "@/core/api/getApiErrorMessage"
import { useToast } from "@/shared/components/ui/Toast/Toast"

import {
    useCreateAnnouncement,
    useRecipientsCount,
} from "../../hooks/useAnnouncements"
import type { AnnouncementAudience } from "../../services/announcements.api"
import type { RecruitmentDetail } from "../../services/recruitments.api"
import { orderedSessions, sessionOptionLabel } from "../../sessionDisplay"
import styles from "./AnnouncementComposer.module.css"

const TITLE_MAX = 120
const BODY_MAX = 1000

const AUDIENCES: { value: AnnouncementAudience; label: string; hint: string }[] = [
    {
        value: "all_applicants",
        label: "All applicants",
        hint: "Everyone who applied and hasn't withdrawn.",
    },
    {
        value: "confirmed",
        label: "Everyone called to the trial",
        hint: "Confirmed players, including anyone already given a result.",
    },
    {
        value: "selected",
        label: "Selected players",
        hint: "The squad only.",
    },
]

export type AnnouncementPrefill = {
    title?: string
    body?: string
    audience?: AnnouncementAudience
}

export default function AnnouncementComposer({
    recruitment,
    open,
    onClose,
    prefill,
    onSent,
}: {
    recruitment: RecruitmentDetail
    open: boolean
    onClose: () => void
    /** Used by the post-edit prompt to open this pre-written. */
    prefill?: AnnouncementPrefill
    /** Fired after a successful queue, so the list can watch it drain. */
    onSent?: () => void
}) {
    const toast = useToast()

    const [title, setTitle] = useState("")
    const [body, setBody] = useState("")
    const [audience, setAudience] = useState<AnnouncementAudience>("confirmed")
    const [sessionId, setSessionId] = useState<string>("")

    // A date filter only means anything where each applicant named a date.
    const sessions = useMemo(
        () => orderedSessions(recruitment.sessions).filter((s) => !s.is_cancelled),
        [recruitment.sessions],
    )
    const canFilterByDate =
        recruitment.session_mode === "choose_one" && sessions.length >= 2

    // Re-seed each time it opens, so a prompt that arrives with new text
    // replaces the last draft rather than appending to it.
    useEffect(() => {
        if (!open) return
        setTitle(prefill?.title ?? "")
        setBody(prefill?.body ?? "")
        setAudience(prefill?.audience ?? "confirmed")
        setSessionId("")
        // `prefill` is a fresh object each render; keying on `open` is what
        // makes this "on open" rather than "on every parent render".
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open])

    // Debounced so dragging through the radio list does not fire four
    // requests. The query key carries audience + session, so flipping back to
    // one already asked about is instant.
    const [settled, setSettled] = useState<{
        audience: AnnouncementAudience
        session: string
    }>({ audience: "confirmed", session: "" })

    useEffect(() => {
        const timer = setTimeout(
            () => setSettled({ audience, session: sessionId }),
            250,
        )
        return () => clearTimeout(timer)
    }, [audience, sessionId])

    const { data: count, isFetching: countLoading } = useRecipientsCount(
        recruitment.id,
        settled.audience,
        settled.session || null,
        open,
    )

    const { mutate: send, isPending } = useCreateAnnouncement(recruitment.id)

    if (!open) return null

    const canSend =
        title.trim().length > 0 && body.trim().length > 0 && !isPending

    const submit = () => {
        if (!canSend) return
        send(
            {
                title: title.trim(),
                body: body.trim(),
                audience,
                session: sessionId || null,
            },
            {
                onSuccess: (announcement) => {
                    toast.show({
                        title: `Queued for ${announcement.recipients_count} player(s)`,
                        message: "Delivery starts within a few minutes.",
                        variant: "success",
                    })
                    onSent?.()
                    onClose()
                },
                onError: (error) => {
                    // The daily-cap 400 says WHEN they can send again. Show
                    // the server's sentence verbatim rather than inventing a
                    // vaguer one.
                    toast.show({
                        title: getApiErrorMessage(
                            error,
                            "Couldn't post the announcement.",
                        ),
                        variant: "error",
                    })
                },
            },
        )
    }

    return (
        <div
            className={styles.backdrop}
            role="dialog"
            aria-modal="true"
            aria-label="Post an announcement"
        >
            <div className={styles.sheet}>
                <header className={styles.header}>
                    <h2 className={styles.heading}>Post an announcement</h2>
                    <button
                        className={styles.close}
                        onClick={onClose}
                        type="button"
                        aria-label="Close"
                        disabled={isPending}
                    >
                        <Icon icon="mdi:close" width={18} height={18} />
                    </button>
                </header>

                <div className={styles.body}>
                    <label className={styles.field}>
                        <span className={styles.label}>
                            Title
                            <span className={styles.counter}>
                                {title.length}/{TITLE_MAX}
                            </span>
                        </span>
                        <input
                            className={styles.input}
                            value={title}
                            onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
                            placeholder="Venue has changed"
                            disabled={isPending}
                            autoFocus
                        />
                    </label>

                    <label className={styles.field}>
                        <span className={styles.label}>
                            Message
                            <span className={styles.counter}>
                                {body.length}/{BODY_MAX}
                            </span>
                        </span>
                        <textarea
                            className={styles.textarea}
                            value={body}
                            onChange={(e) => setBody(e.target.value.slice(0, BODY_MAX))}
                            placeholder="We've moved to Corporation Stadium, Gate 3. Same date and reporting time."
                            rows={5}
                            disabled={isPending}
                        />
                    </label>

                    <fieldset className={styles.field}>
                        <legend className={styles.label}>Who gets this</legend>
                        {AUDIENCES.map((option) => (
                            <label key={option.value} className={styles.radio}>
                                <input
                                    type="radio"
                                    name="audience"
                                    checked={audience === option.value}
                                    onChange={() => setAudience(option.value)}
                                    disabled={isPending}
                                />
                                <span>
                                    <strong>{option.label}</strong>
                                    <small>{option.hint}</small>
                                </span>
                            </label>
                        ))}
                    </fieldset>

                    {canFilterByDate && (
                        <label className={styles.field}>
                            <span className={styles.label}>
                                Only one date{" "}
                                <span className={styles.optional}>Optional</span>
                            </span>
                            <select
                                className={styles.input}
                                value={sessionId}
                                onChange={(e) => setSessionId(e.target.value)}
                                disabled={isPending}
                            >
                                <option value="">Everyone, whichever date</option>
                                {sessions.map((session) => (
                                    <option key={session.id} value={session.id}>
                                        {sessionOptionLabel(session, recruitment)}
                                    </option>
                                ))}
                            </select>
                        </label>
                    )}
                </div>

                <footer className={styles.footer}>
                    {/* The button never reads "Send" without a number. */}
                    <p className={styles.count} aria-live="polite">
                        {countLoading && count === undefined ? (
                            "Counting recipients…"
                        ) : count === undefined ? (
                            "Couldn't count recipients."
                        ) : (
                            <>
                                This will notify <strong>{count}</strong> player
                                {count === 1 ? "" : "s"}.
                            </>
                        )}
                    </p>

                    <button
                        className={styles.send}
                        onClick={submit}
                        type="button"
                        disabled={!canSend || count === undefined}
                    >
                        {isPending ? (
                            "Sending…"
                        ) : (
                            <>
                                Send to {count ?? "…"} player{count === 1 ? "" : "s"}
                            </>
                        )}
                    </button>

                    <p className={styles.warning}>
                        <Icon icon="mdi:alert-outline" width={13} height={13} />
                        Notifications and messages already sent can&apos;t be recalled.
                    </p>
                </footer>
            </div>
        </div>
    )
}
