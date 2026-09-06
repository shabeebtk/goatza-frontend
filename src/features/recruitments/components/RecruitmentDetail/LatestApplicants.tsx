"use client"

/**
 * LatestApplicants — the organiser's first three, with a way into the rest.
 *
 * Reads through `useRecruitmentApplicants` with NO filters, which is the exact
 * query key the full ApplicantsList uses on its default view — so opening the
 * Applicants tab after seeing this costs no second request, and a status change
 * made there is reflected here from the same cache.
 *
 * Adapted from the mockup: it labels each row "Name · Striker · U21", but the
 * applicant payload carries no position — that lives on the recruitment, not on
 * the application. The row shows the age group the applicant chose, and their
 * headline, which are the two things the payload actually knows.
 */

import Link from "next/link"
import { Icon } from "@iconify/react"

import Avatar from "@/shared/components/ui/Avatar/Avatar"
import StatusBadge from "../StatusBadge/StatusBadge"
import { useRecruitmentApplicants } from "../../hooks/useRecruitments"
import styles from "./LatestApplicants.module.css"

/** The mockup shows three. More than that is the applicants list's job. */
const PREVIEW_COUNT = 3

interface LatestApplicantsProps {
    recruitmentId: string
    /** Total, straight off the recruitment — not the page length. */
    total: number
    /** Where "View applicants" goes; the org-admin applicants tab. */
    applicantsHref: string
}

export default function LatestApplicants({
    recruitmentId,
    total,
    applicantsHref,
}: LatestApplicantsProps) {
    const { data, isLoading } = useRecruitmentApplicants(recruitmentId)

    const rows = (data?.pages?.[0]?.results ?? []).slice(0, PREVIEW_COUNT)

    // Nothing to preview and nothing to link to. A "View applicants · 0" button
    // over an empty list is a dead end, so the section stays absent until there
    // is a first applicant.
    if (!isLoading && total === 0 && rows.length === 0) return null

    return (
        <section className={styles.section}>
            <h2 className={styles.sect}>Latest applicants</h2>

            {isLoading && rows.length === 0 ? (
                <div className={styles.rows} aria-hidden="true">
                    {Array.from({ length: PREVIEW_COUNT }).map((_, i) => (
                        <div key={i} className={`${styles.row} ${styles.rowSkeleton}`} />
                    ))}
                </div>
            ) : (
                <div className={styles.rows}>
                    {rows.map((item) => {
                        const name = item.applicant?.name || item.shared_name || "Applicant"
                        const detail = [item.age_category?.title, item.applicant?.headline]
                            .filter(Boolean)
                            .join(" · ")
                        return (
                            <div key={item.id} className={styles.row}>
                                <Avatar
                                    src={item.applicant?.avatar}
                                    initials={name.slice(0, 2).toUpperCase()}
                                    size="sm"
                                />
                                <span className={styles.rowText}>
                                    <span className={styles.rowName}>{name}</span>
                                    {detail && (
                                        <span className={styles.rowDetail}>{detail}</span>
                                    )}
                                </span>
                                <StatusBadge status={item.status} />
                            </div>
                        )
                    })}
                </div>
            )}

            <Link href={applicantsHref} className={styles.viewAll}>
                View applicants · {total}
                <Icon icon="mdi:arrow-right" width={14} height={14} />
            </Link>
        </section>
    )
}
