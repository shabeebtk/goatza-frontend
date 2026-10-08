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
import { ageGroupGenderWord, categoriesForSession } from "../../eligibility"
import {
    formatSessionDate,
    formatSessionTimeRange,
    isMultiPlace,
    orderedSessions,
    sessionModeLine,
    sessionPlace,
} from "../../sessionDisplay"
import styles from "./TrialDatesList.module.css"

type Props = {
    recruitment: Pick<
        RecruitmentDetail | Recruitment,
        "sessions" | "session_mode" | "venue_name" | "city" | "timezone"
    > & Partial<Pick<RecruitmentDetail, "age_categories" | "gender">>
    className?: string
}

export default function TrialDatesList({ recruitment, className }: Props) {
    const sessions = orderedSessions(recruitment.sessions)

    // Fewer than two dates: the facts strip already covers it.
    if (sessions.length < 2) return null

    // On a city tour "pick one date" is true and useless — the dates are not
    // what a player is choosing between, the grounds are.
    const modeLine = sessionModeLine(
        recruitment.session_mode,
        isMultiPlace(recruitment),
    )

    // WHICH CATEGORIES RUN WHERE — but only on a trial that actually splits
    // them. When no category names a centre every category runs at every
    // date, and printing all of them under all of them would be the same
    // list four times; a plain trial renders exactly what it did before.
    const categories = recruitment.age_categories ?? []
    const splitByCentre = categories.some(
        category => (category.session_ids ?? []).length > 0,
    )

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
                                {formatSessionDate(
                                    session.date,
                                    recruitment.timezone,
                                )}
                            </span>
                            <span className={styles.meta}>
                                {[session.title?.trim() || null, time, place]
                                    .filter(Boolean)
                                    .join(" · ")}
                            </span>
                            {session.is_cancelled && (
                                <span className={styles.cancelled}>Cancelled</span>
                            )}
                            {splitByCentre && (
                                <ul className={styles.categories}>
                                    {categoriesForSession(categories, session.id).map(
                                        category => {
                                            const word = ageGroupGenderWord(
                                                category, recruitment.gender,
                                            )
                                            return (
                                                <li
                                                    key={category.id}
                                                    className={styles.category}
                                                >
                                                    {[category.title, word]
                                                        .filter(Boolean)
                                                        .join(" ")}
                                                </li>
                                            )
                                        },
                                    )}
                                </ul>
                            )}
                        </li>
                    )
                })}
            </ul>
        </section>
    )
}
