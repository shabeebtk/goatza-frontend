"use client"

/**
 * The acting organization's ACHIEVEMENT review queue — the Achievements tab of
 * the verifications page.
 *
 * Every row is somebody claiming this org issued them an award. Verify puts a
 * check mark on their profile carrying this org's name; Reject leaves the award
 * on their profile marked rejected (never deletes it) and sends the optional
 * note.
 *
 * Deliberately a sibling of OrgVerificationsPage's career panel rather than a
 * generalisation of it: the two queues answer different questions. A career
 * reviewer reads dates and positions; an achievement reviewer reads the proof
 * image and the reference link, which is why those get the space here.
 *
 * PERMISSIONS: the API allows OWNER and ADMIN members only. The member's role is
 * not exposed to the client anywhere today, so the actions cannot be hidden
 * ahead of time — the queue request itself 403s and that is rendered as an
 * explicit "needs owner or admin" state rather than a generic failure.
 */

import { useState } from "react"
import { Icon } from "@iconify/react"
import { isAxiosError } from "axios"
import Link from "next/link"
import { toast } from "sonner"

import Avatar from "@/shared/components/ui/Avatar/Avatar"
import { useNavigation } from "@/shared/services/navigation.service"
import {
    ACHIEVEMENT_LEVEL_LABELS,
    ACHIEVEMENT_TYPE_ICONS,
    ACHIEVEMENT_TYPE_LABELS,
} from "../../achievementMeta"
import {
    useAchievementVerificationRequests,
    useRejectAchievement,
    useVerifyAchievement,
} from "../../hooks/useAchievementQueries"
import {
    MAX_REJECT_REASON_LENGTH,
    type AchievementReviewTab,
    type AchievementVerificationRequest,
} from "../../types"
import { formatAchievedDate } from "../../utils/achievementDates"
import styles from "./OrgAchievementVerifications.module.css"

// ── Proof lightbox ────────────────────────────────────────────

/**
 * The proof image at full size.
 *
 * Worth a modal rather than a new tab: the reviewer is working down a queue and
 * bouncing to the media domain loses their place. Closes on backdrop, Escape is
 * handled by the button being focused on mount.
 */
function ProofLightbox({
    src,
    alt,
    onClose,
}: {
    src: string
    alt: string
    onClose: () => void
}) {
    return (
        <div
            className={styles.lightbox}
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label={alt}
        >
            <button
                className={styles.lightboxClose}
                onClick={onClose}
                type="button"
                aria-label="Close"
                autoFocus
            >
                <Icon icon="mdi:close" width={22} height={22} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.lightboxImage} src={src} alt={alt} />
        </div>
    )
}

// ── Reject confirm ────────────────────────────────────────────

function RejectConfirm({
    request,
    pending,
    onCancel,
    onConfirm,
}: {
    request: AchievementVerificationRequest
    pending: boolean
    onCancel: () => void
    onConfirm: (reason: string) => void
}) {
    const [reason, setReason] = useState("")

    return (
        <div className={styles.rejectConfirm}>
            <p className={styles.rejectText}>
                Reject <strong>{request.title}</strong> claimed by{" "}
                <strong>{request.user.name || request.user.username}</strong>?
            </p>
            <p className={styles.rejectHint}>
                The achievement stays on their profile marked as not verified — it
                isn&apos;t deleted, and they can edit it and ask again.
            </p>

            <label className={styles.reasonLabel} htmlFor={`reason-${request.id}`}>
                Reason (optional)
            </label>
            <input
                id={`reason-${request.id}`}
                className={styles.reasonInput}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={MAX_REJECT_REASON_LENGTH}
                placeholder="e.g. We have no record of issuing this award"
                disabled={pending}
            />
            <p className={styles.reasonCount}>
                {reason.length}/{MAX_REJECT_REASON_LENGTH} — they&apos;ll see this
                in their notification.
            </p>

            <div className={styles.rejectActions}>
                <button
                    className={styles.secondaryBtn}
                    onClick={onCancel}
                    type="button"
                    disabled={pending}
                >
                    Cancel
                </button>
                <button
                    className={styles.dangerBtn}
                    onClick={() => onConfirm(reason.trim())}
                    type="button"
                    disabled={pending}
                >
                    {pending ? (
                        <>
                            <span className={styles.miniSpinner} aria-hidden="true" />
                            Rejecting…
                        </>
                    ) : (
                        "Reject"
                    )}
                </button>
            </div>
        </div>
    )
}

// ── Request row ───────────────────────────────────────────────

function RequestRow({
    request,
    busy,
    tab,
    onVerify,
    onReject,
    onViewProof,
}: {
    request: AchievementVerificationRequest
    busy: boolean
    tab: AchievementReviewTab
    onVerify: () => void
    onReject: () => void
    onViewProof: () => void
}) {
    const { toProfile } = useNavigation()

    const decided = tab === "decided"
    const isVerified = request.verification_status === "verified"
    const levelLabel = request.level
        ? ACHIEVEMENT_LEVEL_LABELS[request.level]
        : null

    const claimantName = request.user.name || request.user.username || "Someone"

    return (
        <article className={styles.row}>
            <div className={styles.rowHeader}>
                <Avatar
                    src={request.user.profile_photo || undefined}
                    initials={claimantName.slice(0, 2).toUpperCase()}
                    alt={request.user.name ?? ""}
                    size="md"
                />
                <div className={styles.rowHeaderText}>
                    {/* The reviewer's first question is "who is this" — the name
                        goes to their profile so it can be answered. */}
                    {request.user.username ? (
                        <Link
                            className={styles.claimantLink}
                            href={toProfile(request.user.username)}
                        >
                            {claimantName}
                        </Link>
                    ) : (
                        <p className={styles.claimantName}>{claimantName}</p>
                    )}
                    <p className={styles.claimantMeta}>
                        {request.user.username && `@${request.user.username}`}
                        {request.user.role && (
                            <span className={styles.roleChip}>{request.user.role}</span>
                        )}
                    </p>
                </div>
            </div>

            <div className={styles.claimBody}>
                {request.image ? (
                    <button
                        className={styles.proofThumb}
                        onClick={onViewProof}
                        type="button"
                        aria-label={`View proof for ${request.title}`}
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={request.image} alt="" loading="lazy" />
                        <span className={styles.proofZoom} aria-hidden="true">
                            <Icon icon="mdi:magnify-plus-outline" width={14} height={14} />
                        </span>
                    </button>
                ) : (
                    <div
                        className={`${styles.proofThumb} ${styles.proofThumbEmpty}`}
                        aria-hidden="true"
                    >
                        <Icon
                            icon={ACHIEVEMENT_TYPE_ICONS[request.achievement_type]}
                            width={20}
                            height={20}
                        />
                    </div>
                )}

                <div className={styles.claim}>
                    <p className={styles.claimTitle}>{request.title}</p>
                    {request.event_name && (
                        <p className={styles.claimEvent}>{request.event_name}</p>
                    )}
                    <p className={styles.claimDate}>
                        {formatAchievedDate(request.achieved_date)}
                    </p>
                </div>
            </div>

            <div className={styles.chipRow}>
                <span className={styles.typeChip}>
                    <Icon
                        icon={ACHIEVEMENT_TYPE_ICONS[request.achievement_type]}
                        width={12}
                        height={12}
                        aria-hidden="true"
                    />
                    {ACHIEVEMENT_TYPE_LABELS[request.achievement_type]}
                </span>
                <span className={styles.sportChip}>
                    {request.sport.icon_name && (
                        <Icon
                            icon={request.sport.icon_name}
                            width={12}
                            height={12}
                            aria-hidden="true"
                        />
                    )}
                    {request.sport.name}
                </span>
                {levelLabel && <span className={styles.chip}>{levelLabel}</span>}
            </div>

            {request.description && (
                <p className={styles.claimDescription}>{request.description}</p>
            )}

            {request.reference_link && (
                <a
                    className={styles.referenceLink}
                    href={request.reference_link}
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    <Icon icon="mdi:open-in-new" width={13} height={13} />
                    Check their source
                </a>
            )}

            {/* History rows carry the call that was made, and the way to change
                it — organizations learn things after the fact. */}
            {decided && (
                <span
                    className={
                        isVerified ? styles.statusVerified : styles.statusRejected
                    }
                >
                    <Icon
                        icon={
                            isVerified
                                ? "mdi:check-decagram"
                                : "mdi:close-circle-outline"
                        }
                        width={13}
                        height={13}
                    />
                    {isVerified ? "Verified" : "Rejected"}
                </span>
            )}

            <div className={styles.rowActions}>
                {/* In history only the OPPOSITE action is offered — re-doing the
                    decision you already made is a no-op the API refuses. */}
                {!isVerified && (
                    <button
                        className={decided ? styles.secondaryBtn : styles.primaryBtn}
                        onClick={onVerify}
                        type="button"
                        disabled={busy}
                    >
                        {busy ? (
                            <>
                                <span className={styles.miniSpinner} aria-hidden="true" />
                                Verifying…
                            </>
                        ) : (
                            <>
                                <Icon icon="mdi:check-decagram" width={16} height={16} />
                                {decided ? "Verify instead" : "Verify"}
                            </>
                        )}
                    </button>
                )}

                {(!decided || isVerified) && (
                    <button
                        className={styles.secondaryBtn}
                        onClick={onReject}
                        type="button"
                        disabled={busy}
                    >
                        {decided ? "Withdraw" : "Reject"}
                    </button>
                )}
            </div>
        </article>
    )
}

// ── Panel ─────────────────────────────────────────────────────

/**
 * Renders everything below the page title: the subtitle, the Requests/History
 * tabs and the list. The page shell owns the title and the domain tabs.
 */
export default function OrgAchievementVerifications() {
    const [tab, setTab] = useState<AchievementReviewTab>("pending")

    const {
        data,
        isLoading,
        isError,
        error,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
    } = useAchievementVerificationRequests(tab)

    const verify = useVerifyAchievement()
    const reject = useRejectAchievement()

    const [rejectingId, setRejectingId] = useState<string | null>(null)
    const [actingId, setActingId] = useState<string | null>(null)
    const [proof, setProof] = useState<{ src: string; alt: string } | null>(null)

    const handleVerify = async (request: AchievementVerificationRequest) => {
        setActingId(request.id)
        try {
            await verify.mutateAsync({
                achievementId: request.id,
                userId: request.user.id,
                tab,
            })
            toast.success(
                `Verified — ${request.user.name || request.user.username}'s achievement now shows your check mark`
            )
        } catch {
            // The hook restores the row and toasts the server's message.
        } finally {
            setActingId(null)
        }
    }

    const handleReject = async (
        request: AchievementVerificationRequest,
        reason: string
    ) => {
        setActingId(request.id)
        try {
            await reject.mutateAsync({
                achievementId: request.id,
                userId: request.user.id,
                reason: reason || undefined,
                tab,
            })
            toast.success(
                request.verification_status === "verified"
                    ? "Verification withdrawn — they've been told"
                    : "Rejected — they've been told"
            )
            setRejectingId(null)
        } catch {
            // Same: the hook restores the row and surfaces the message.
        } finally {
            setActingId(null)
        }
    }

    const tabs = (
        <div className={styles.tabs} role="tablist">
            {(
                [
                    ["pending", "Requests"],
                    ["decided", "History"],
                ] as const
            ).map(([value, label]) => (
                <button
                    key={value}
                    role="tab"
                    type="button"
                    aria-selected={tab === value}
                    className={`${styles.tab} ${tab === value ? styles.tabActive : ""}`}
                    onClick={() => {
                        setTab(value)
                        // Any half-open reject form belongs to the other tab.
                        setRejectingId(null)
                    }}
                >
                    {label}
                </button>
            ))}
        </div>
    )

    // ── Loading ───────────────────────────────────────────────
    if (isLoading) {
        return (
            <>
                {tabs}
                <div className={styles.skeletonList}>
                    <div className={styles.skeletonCard} />
                    <div className={styles.skeletonCard} />
                </div>
            </>
        )
    }

    // ── Error / permission ────────────────────────────────────
    if (isError) {
        const forbidden = isAxiosError(error) && error.response?.status === 403

        return (
            <div className={styles.stateCard}>
                <Icon
                    icon={forbidden ? "mdi:lock-outline" : "mdi:cloud-off-outline"}
                    width={36}
                    height={36}
                />
                <p className={styles.stateTitle}>
                    {forbidden ? "Owner or admin access needed" : "Couldn't load"}
                </p>
                <p className={styles.stateText}>
                    {forbidden
                        ? "Only owners and admins can review achievement claims. Ask someone with those permissions to take a look."
                        : "We couldn't load the achievement queue. Try again in a moment."}
                </p>
            </div>
        )
    }

    const requests = data?.pages.flatMap((page) => page.results) ?? []
    const isPendingTab = tab === "pending"

    return (
        <>
            <p className={styles.subtitle}>
                {isPendingTab
                    ? "People who say your organization gave them an award, waiting on your confirmation."
                    : "Claims you've already ruled on. You can change any of these if you learn something new."}
            </p>

            {tabs}

            {requests.length === 0 ? (
                <div className={styles.stateCard}>
                    <Icon
                        icon={isPendingTab ? "mdi:check-all" : "mdi:history"}
                        width={36}
                        height={36}
                    />
                    <p className={styles.stateTitle}>
                        {isPendingTab
                            ? "No pending achievements"
                            : "Nothing decided yet"}
                    </p>
                    <p className={styles.stateText}>
                        {isPendingTab
                            ? "New requests appear here when someone credits your organization with an award."
                            : "Once you verify or reject a claim it moves here, and stays changeable."}
                    </p>
                </div>
            ) : (
                <div className={styles.list}>
                    {requests.map((request) =>
                        rejectingId === request.id ? (
                            <RejectConfirm
                                key={request.id}
                                request={request}
                                pending={actingId === request.id}
                                onCancel={() => setRejectingId(null)}
                                onConfirm={(reason) => handleReject(request, reason)}
                            />
                        ) : (
                            <RequestRow
                                key={request.id}
                                request={request}
                                busy={actingId === request.id}
                                tab={tab}
                                onVerify={() => handleVerify(request)}
                                onReject={() => setRejectingId(request.id)}
                                onViewProof={() =>
                                    setProof({
                                        src: request.image,
                                        alt: `Proof for ${request.title}`,
                                    })
                                }
                            />
                        )
                    )}

                    {hasNextPage && (
                        <button
                            className={styles.loadMoreBtn}
                            onClick={() => fetchNextPage()}
                            type="button"
                            disabled={isFetchingNextPage}
                        >
                            {isFetchingNextPage ? (
                                <>
                                    <span className={styles.miniSpinner} aria-hidden="true" />
                                    Loading…
                                </>
                            ) : (
                                <>
                                    <Icon icon="mdi:chevron-down" width={16} height={16} />
                                    Load more
                                    <span className={styles.loadMoreCount}>
                                        {requests.length} of{" "}
                                        {data?.pages[0]?.count ?? requests.length}
                                    </span>
                                </>
                            )}
                        </button>
                    )}
                </div>
            )}

            {proof && (
                <ProofLightbox
                    src={proof.src}
                    alt={proof.alt}
                    onClose={() => setProof(null)}
                />
            )}
        </>
    )
}
