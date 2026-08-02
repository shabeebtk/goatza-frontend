"use client"

/**
 * One entry on the career timeline.
 *
 * The verification line is the part that differs by viewer:
 *   - `verified`  → everyone sees "Verified by <org>"
 *   - anything else → only the OWNER sees a hint. A visitor reading someone's
 *     profile has no business knowing a club declined a claim, so an
 *     unverified entry simply renders without a badge for them.
 */

import { useState } from "react"
import { Icon } from "@iconify/react"

import Avatar from "@/shared/components/ui/Avatar/Avatar"
import {
    CAREER_SQUAD_LEVEL_LABELS,
    entryTypeBadge,
    organizationInitials,
} from "../../careerMeta"
import type { CareerEntry } from "../../types"
import { careerDuration, formatCareerRange } from "../../utils/careerDates"
import styles from "./CareerEntryCard.module.css"

/**
 * Length past which the description collapses behind "see more".
 *
 * A character heuristic rather than a measured height — the same approach
 * PostCard uses, and it keeps this component free of a layout-measuring effect.
 * The CSS still clamps to 3 real lines, so the visual is exact; this only
 * decides whether the toggle appears. Slightly conservative on a wide screen,
 * where a description near the threshold may already fit — expanding it then is
 * a no-op rather than a bug.
 */
const DESCRIPTION_LIMIT = 150

function CareerDescription({ text }: { text: string }) {
    const [expanded, setExpanded] = useState(false)
    const isLong = text.length > DESCRIPTION_LIMIT

    return (
        <div className={styles.description}>
            <p
                className={
                    isLong && !expanded
                        ? `${styles.descriptionText} ${styles.descriptionClamped}`
                        : styles.descriptionText
                }
            >
                {text}
            </p>
            {isLong && (
                <button
                    className={styles.seeMoreBtn}
                    onClick={() => setExpanded((v) => !v)}
                    type="button"
                >
                    {expanded ? "see less" : "see more"}
                </button>
            )}
        </div>
    )
}

// ── Verification line ─────────────────────────────────────────

/**
 * Verification is shown ONLY as a positive: a verified entry earns a badge,
 * and every other state renders nothing at all — for the owner as well as for
 * visitors. An unverified entry is the normal case, not a defect, so it is not
 * labelled as one.
 */
function VerificationLine({ entry }: { entry: CareerEntry }) {
    if (entry.verification_status !== "verified") return null

    return (
        <span className={styles.verifiedBadge}>
            <Icon icon="mdi:check-decagram" width={13} height={13} />
            {/* The stored name, not the nested org — it survives the club
                being deleted, which is exactly when the nested one is null. */}
            Verified by {entry.organization_name}
        </span>
    )
}

// ── Card ──────────────────────────────────────────────────────

interface CareerEntryCardProps {
    entry: CareerEntry
    isOwn: boolean
    /** Drops the timeline's connecting tail so it ends with the final entry. */
    isLast?: boolean
    onEdit: (entry: CareerEntry) => void
    onDelete: (entry: CareerEntry) => void
}

export default function CareerEntryCard({
    entry,
    isOwn,
    isLast = false,
    onEdit,
    onDelete,
}: CareerEntryCardProps) {
    const range = formatCareerRange(entry)
    const duration = careerDuration(entry)
    const typeBadge = entryTypeBadge(entry.entry_type)

    const squadLevel = entry.squad_level
        ? CAREER_SQUAD_LEVEL_LABELS[entry.squad_level]
        : null
    // "Youth · U17" — two facts about the same squad, so one line, not two chips.
    const squadLine = [squadLevel, entry.age_group].filter(Boolean).join(" · ")

    return (
        <article className={styles.card}>
            <div
                className={
                    isLast
                        ? `${styles.timelineRail} ${styles.timelineRailLast}`
                        : styles.timelineRail
                }
                aria-hidden="true"
            >
                <span className={styles.timelineDot} />
            </div>

            <div className={styles.body}>
                <div className={styles.header}>
                    <Avatar
                        src={entry.organization?.logo || undefined}
                        initials={organizationInitials(entry.organization_name)}
                        alt={entry.organization_name}
                        size="md"
                        className={styles.orgAvatar}
                    />

                    <div className={styles.headerText}>
                        <h3 className={styles.title}>{entry.title}</h3>
                        <p className={styles.orgName}>
                            {entry.organization_name}
                            {entry.organization?.is_verified && (
                                <Icon
                                    icon="mdi:check-decagram"
                                    width={13}
                                    height={13}
                                    className={styles.orgVerifiedTick}
                                    aria-label="Verified organization"
                                />
                            )}
                        </p>
                        <p className={styles.dateRange}>
                            {range}
                            {duration && (
                                <span className={styles.duration}> · {duration}</span>
                            )}
                        </p>
                    </div>

                    {isOwn && (
                        <div className={styles.actions}>
                            <button
                                className={styles.actionBtn}
                                onClick={() => onEdit(entry)}
                                aria-label={`Edit ${entry.title} at ${entry.organization_name}`}
                                type="button"
                            >
                                <Icon icon="mdi:pencil-outline" width={15} height={15} />
                            </button>
                            <button
                                className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                                onClick={() => onDelete(entry)}
                                aria-label={`Delete ${entry.title} at ${entry.organization_name}`}
                                type="button"
                            >
                                <Icon icon="mdi:trash-can-outline" width={15} height={15} />
                            </button>
                        </div>
                    )}
                </div>

                <div className={styles.chipRow}>
                    <span className={styles.sportChip}>
                        {entry.sport.icon_name && (
                            <Icon
                                icon={entry.sport.icon_name}
                                width={12}
                                height={12}
                                aria-hidden="true"
                            />
                        )}
                        {entry.sport.name}
                    </span>

                    {typeBadge && (
                        <span className={styles.typeBadge}>{typeBadge}</span>
                    )}

                    {squadLine && (
                        <span className={styles.squadChip}>{squadLine}</span>
                    )}

                    {entry.positions.map((position) => (
                        <span key={position.id} className={styles.positionChip}>
                            {position.name}
                        </span>
                    ))}
                </div>

                <VerificationLine entry={entry} />

                {entry.description && <CareerDescription text={entry.description} />}
            </div>
        </article>
    )
}
