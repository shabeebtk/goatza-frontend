/**
 * Every date a trial runs on.
 *
 * ONE date renders nowhere: the facts strip already says "Trial · 10 OCT",
 * which is exactly what it said before dates were a list, and a second copy
 * of the same date under it would be noise. This component is for the trials
 * that actually have something more to say — two or more dates — where the
 * facts strip's single "Trial" cell is now the FIRST of them and not the
 * whole story.
 *
 * A CANCELLED date is shown struck through rather than dropped. A player who
 * saw the old date and planned around it has to find out it is off; quietly
 * removing the row tells them nothing and they turn up anyway.
 */

"use client"

import { Icon } from "@iconify/react"

import type { Recruitment, RecruitmentDetail } from "../../services/recruitments.api"
import {
    formatSessionDate,
    formatSessionTimeRange,
    orderedSessions,
    sessionModeLine,
    sessionPlace,
} from "../../sessionDisplay"
import styles from "./TrialDatesList.module.css"

type Props = {
    recruitment: Pick<
        RecruitmentDetail | Recruitment,
        "sessions" | "session_mode" | "venue_name" | "city"
    >
    className?: string
}

export default function TrialDatesList({ recruitment, className }: Props) {
    const sessions = orderedSessions(recruitment.sessions)

    // Fewer than two dates: the facts strip already covers it.
    if (sessions.length < 2) return null

    const modeLine = sessionModeLine(recruitment.session_mode)

    return (
        <section className={`${styles.wrap} ${className ?? ""}`} aria-label="Trial dates">
            <div className={styles.head}>
                <Icon icon="mdi:calendar-multiple" width={15} height={15} />
                <h3 className={styles.title}>Trial dates</h3>
                {modeLine && <span className={styles.mode}>{modeLine}</span>}
            </div>

            <ul className={styles.list}>
                {sessions.map(session => {
                    const time = formatSessionTimeRange(session)
                    const place = sessionPlace(session, recruitment)
                    return (
                        <li
                            key={session.id}
                            className={`${styles.item} ${session.is_cancelled ? styles.itemCancelled : ""}`}
                        >
                            <span className={styles.date}>
                                {formatSessionDate(session.date)}
                            </span>
                            <span className={styles.meta}>
                                {[session.title?.trim() || null, time, place]
                                    .filter(Boolean)
                                    .join(" · ")}
                            </span>
                            {session.is_cancelled && (
                                <span className={styles.cancelled}>Cancelled</span>
                            )}
                        </li>
                    )
                })}
            </ul>
        </section>
    )
}
