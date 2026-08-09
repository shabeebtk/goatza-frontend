"use client"

/**
 * One achievement on the profile shelf.
 *
 * Laid out as a media card rather than a timeline row: an achievement is a
 * moment with a picture, where a career entry is a span without one. The
 * thumbnail is optional and its absence is a first-class state — most awards
 * are typed in without a certificate to hand.
 *
 * The card is a COLUMN, not a thumb-plus-column: only the title block sits
 * beside the picture, and everything from the chips down runs the full width.
 * Nesting the chips in the narrow column beside an 84px thumb cost them a row
 * each and clipped the description's measure — the thumbnail has no claim on
 * the space under it. Splitting at the header is what gives the widest content
 * the whole card to use.
 *
 * The verification line follows career exactly: `verified` earns a badge that
 * everyone sees, and every other state renders nothing at all, for the owner as
 * well as for visitors. An unverified award is the normal case, not a defect,
 * so it is not labelled as one.
 */

import { useState } from "react"
import { Icon } from "@iconify/react"

import ImageLightbox from "@/shared/components/ImageLightbox/ImageLightbox"
import {
    ACHIEVEMENT_LEVEL_LABELS,
    ACHIEVEMENT_TYPE_ICONS,
    ACHIEVEMENT_TYPE_LABELS,
} from "../../achievementMeta"
import type { Achievement } from "../../types"
import { formatAchievedDate } from "../../utils/achievementDates"
import styles from "./AchievementCard.module.css"

/**
 * Length past which the description collapses behind "see more". A character
 * heuristic rather than a measured height — the same approach CareerEntryCard
 * and PostCard use, and it keeps this component free of a layout-measuring
 * effect. The CSS still clamps to 3 real lines, so the visual is exact.
 */
const DESCRIPTION_LIMIT = 150

function AchievementDescription({ text }: { text: string }) {
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

// ── Thumbnail ─────────────────────────────────────────────────

/**
 * The proof image, or a typed placeholder.
 *
 * The fallback is not a grey box: it is the achievement type's own icon, which
 * makes an image-less card look deliberate rather than broken — and a shelf of
 * mixed cards still reads as one grid.
 *
 * A real picture is a <button>, because at 64px a certificate is legible as a
 * shape and not as a document — the thumb is a promise that the full thing is
 * one tap away. The placeholder and the broken-image fallback stay inert
 * <div>s: there is nothing behind them to open, and a focus stop that leads
 * nowhere is worse than no affordance at all.
 */
function AchievementThumb({
    achievement,
    onOpenImage,
}: {
    achievement: Achievement
    onOpenImage: () => void
}) {
    const [failed, setFailed] = useState(false)

    if (achievement.image && !failed) {
        return (
            <button
                className={`${styles.thumb} ${styles.thumbButton}`}
                onClick={onOpenImage}
                aria-label={`View image for ${achievement.title}`}
                type="button"
            >
                {/* Plain <img>: the src is a Cloudinary URL on a remote host,
                    and next/image would need it in remotePatterns for no gain
                    at this size. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    className={styles.thumbImage}
                    src={achievement.image}
                    alt=""
                    loading="lazy"
                    onError={() => setFailed(true)}
                />
            </button>
        )
    }

    return (
        <div className={`${styles.thumb} ${styles.thumbEmpty}`} aria-hidden="true">
            <Icon
                icon={ACHIEVEMENT_TYPE_ICONS[achievement.achievement_type]}
                width={22}
                height={22}
            />
        </div>
    )
}

// ── Verification line ─────────────────────────────────────────

function VerificationLine({ achievement }: { achievement: Achievement }) {
    if (achievement.verification_status !== "verified") return null

    return (
        <span className={styles.verifiedBadge}>
            <Icon icon="mdi:check-decagram" width={13} height={13} />
            {/* The stored name, not the nested org — it survives the issuer
                being deleted, which is exactly when the nested one is null. */}
            Verified by {achievement.awarded_by_name}
        </span>
    )
}

// ── Card ──────────────────────────────────────────────────────

interface AchievementCardProps {
    achievement: Achievement
    isOwn: boolean
    /** True while this card's pin/unpin request is in flight. */
    pinning?: boolean
    onEdit: (achievement: Achievement) => void
    onDelete: (achievement: Achievement) => void
    onTogglePin: (achievement: Achievement) => void
}

export default function AchievementCard({
    achievement,
    isOwn,
    pinning = false,
    onEdit,
    onDelete,
    onTogglePin,
}: AchievementCardProps) {
    const typeLabel = ACHIEVEMENT_TYPE_LABELS[achievement.achievement_type]
    const levelLabel = achievement.level
        ? ACHIEVEMENT_LEVEL_LABELS[achievement.level]
        : null

    // Only shown when the award isn't verified — a verified one already prints
    // the issuer in its badge, and saying it twice reads as a mistake.
    const showIssuerLine =
        achievement.awarded_by_name &&
        achievement.verification_status !== "verified"

    // Mounted only while open, so the viewer's scroll lock and focus return are
    // tied to mount/unmount and cannot leak into a card that isn't showing one.
    const [viewerOpen, setViewerOpen] = useState(false)

    return (
        <article
            className={
                achievement.is_pinned
                    ? `${styles.card} ${styles.cardPinned}`
                    : styles.card
            }
        >
            {/* Row 1 — the picture and what it is. Everything below runs the
                full width of the card. */}
            <div className={styles.header}>
                <AchievementThumb
                    achievement={achievement}
                    onOpenImage={() => setViewerOpen(true)}
                />

                <div className={styles.headerText}>
                    <h3 className={styles.title}>
                        {achievement.is_pinned && (
                            <Icon
                                icon="mdi:pin"
                                width={13}
                                height={13}
                                className={styles.pinIcon}
                                aria-label="Pinned"
                            />
                        )}
                        {achievement.title}
                    </h3>

                    {achievement.event_name && (
                        <p className={styles.eventName}>
                            {achievement.event_name}
                        </p>
                    )}

                    <p className={styles.date}>
                        {formatAchievedDate(achievement.achieved_date)}
                    </p>
                </div>

                {isOwn && (
                    <div className={styles.actions}>
                        <button
                            className={
                                achievement.is_pinned
                                    ? `${styles.actionBtn} ${styles.actionBtnActive}`
                                    : styles.actionBtn
                            }
                            onClick={() => onTogglePin(achievement)}
                            aria-label={
                                achievement.is_pinned
                                    ? `Unpin ${achievement.title}`
                                    : `Pin ${achievement.title}`
                            }
                            aria-pressed={achievement.is_pinned}
                            type="button"
                            disabled={pinning}
                        >
                            <Icon
                                icon={
                                    achievement.is_pinned
                                        ? "mdi:pin-off-outline"
                                        : "mdi:pin-outline"
                                }
                                width={15}
                                height={15}
                            />
                        </button>
                        <button
                            className={styles.actionBtn}
                            onClick={() => onEdit(achievement)}
                            aria-label={`Edit ${achievement.title}`}
                            type="button"
                        >
                            <Icon icon="mdi:pencil-outline" width={15} height={15} />
                        </button>
                        <button
                            className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                            onClick={() => onDelete(achievement)}
                            aria-label={`Delete ${achievement.title}`}
                            type="button"
                        >
                            <Icon icon="mdi:trash-can-outline" width={15} height={15} />
                        </button>
                    </div>
                )}
            </div>

            <div className={styles.chipRow}>
                <span className={styles.typeChip}>
                    <Icon
                        icon={ACHIEVEMENT_TYPE_ICONS[achievement.achievement_type]}
                        width={12}
                        height={12}
                        aria-hidden="true"
                    />
                    {typeLabel}
                </span>

                <span className={styles.sportChip}>
                    {achievement.sport.icon_name && (
                        <Icon
                            icon={achievement.sport.icon_name}
                            width={12}
                            height={12}
                            aria-hidden="true"
                        />
                    )}
                    {achievement.sport.name}
                </span>

                {levelLabel && (
                    <span className={styles.levelChip}>{levelLabel}</span>
                )}
            </div>

            <VerificationLine achievement={achievement} />

            {showIssuerLine && (
                <p className={styles.issuerLine}>
                    <Icon
                        icon="mdi:office-building-outline"
                        width={13}
                        height={13}
                        aria-hidden="true"
                    />
                    {achievement.awarded_by_name}
                    {achievement.awarded_by?.is_verified && (
                        <Icon
                            icon="mdi:check-decagram"
                            width={12}
                            height={12}
                            className={styles.orgVerifiedTick}
                            aria-label="Verified organization"
                        />
                    )}
                </p>
            )}

            {achievement.career_entry && (
                <p className={styles.duringLine}>
                    During{" "}
                    <span className={styles.duringOrg}>
                        {achievement.career_entry.organization_name}
                    </span>
                </p>
            )}

            {achievement.description && (
                <AchievementDescription text={achievement.description} />
            )}

            {achievement.reference_link && (
                <a
                    className={styles.referenceLink}
                    href={achievement.reference_link}
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    <Icon icon="mdi:open-in-new" width={12} height={12} />
                    View source
                </a>
            )}

            {viewerOpen && (
                // The full Cloudinary original, not the thumb's own src — they
                // are the same URL today, and this is the line to change on the
                // day the card starts asking for a derivative.
                <ImageLightbox
                    src={achievement.image}
                    alt={achievement.title}
                    onClose={() => setViewerOpen(false)}
                />
            )}
        </article>
    )
}
