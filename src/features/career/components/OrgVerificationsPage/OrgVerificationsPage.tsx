"use client"

/**
 * OrgVerificationsPage — the acting organization's career review queue.
 *
 * Every row is a player claiming a stint at this org. Verify puts a check mark
 * on their profile carrying this org's name; Reject leaves the entry on their
 * profile marked rejected (never deletes it) and sends them the optional note.
 *
 * PERMISSIONS: the API allows OWNER and ADMIN members only. The member's role
 * is not exposed to the client anywhere today — `OrganizationMini` carries no
 * role and there is no membership endpoint — so the actions cannot be hidden
 * ahead of time. Instead the queue request itself 403s for a COACH/STAFF member
 * and that is rendered as an explicit "needs owner or admin" state rather than
 * a generic failure.
 */

import { useState } from "react"
import { Icon } from "@iconify/react"
import { isAxiosError } from "axios"
import { toast } from "sonner"

import Avatar from "@/shared/components/ui/Avatar/Avatar"
import { CAREER_SQUAD_LEVEL_LABELS } from "../../careerMeta"
import {
    useActingOrganizationId,
    useRejectCareerEntry,
    useVerificationRequests,
    useVerifyCareerEntry,
} from "../../hooks/useCareerQueries"
import type { CareerReviewTab, CareerVerificationRequest } from "../../types"
import { careerDuration, formatCareerRange } from "../../utils/careerDates"
import styles from "./OrgVerificationsPage.module.css"

const MAX_REASON = 200

// ── Reject confirm ────────────────────────────────────────────

function RejectConfirm({
    request,
    pending,
    onCancel,
    onConfirm,
}: {
    request: CareerVerificationRequest
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
                The entry stays on their profile marked as not verified — it
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
                maxLength={MAX_REASON}
                placeholder="e.g. No record of this player in our squad lists"
                disabled={pending}
            />
            <p className={styles.reasonCount}>
                {reason.length}/{MAX_REASON} — they&apos;ll see this in their
                notification.
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
}: {
    request: CareerVerificationRequest
    busy: boolean
    tab: CareerReviewTab
    onVerify: () => void
    onReject: () => void
}) {
    const decided = tab === "decided"
    const isVerified = request.verification_status === "verified"
    const range = formatCareerRange(request)
    const duration = careerDuration(request)

    const squadLevel = request.squad_level
        ? CAREER_SQUAD_LEVEL_LABELS[request.squad_level]
        : null
    const squadLine = [squadLevel, request.age_group].filter(Boolean).join(" · ")

    return (
        <article className={styles.row}>
            <div className={styles.rowHeader}>
                <Avatar
                    src={request.user.profile_photo || undefined}
                    initials={
                        (request.user.name || request.user.username || "?")
                            .slice(0, 2)
                            .toUpperCase()
                    }
                    alt={request.user.name ?? ""}
                    size="md"
                />
                <div className={styles.rowHeaderText}>
                    <p className={styles.claimantName}>
                        {request.user.name || request.user.username}
                    </p>
                    <p className={styles.claimantMeta}>
                        {request.user.username && `@${request.user.username}`}
                        {request.user.role && (
                            <span className={styles.roleChip}>{request.user.role}</span>
                        )}
                    </p>
                </div>
            </div>

            <div className={styles.claim}>
                <p className={styles.claimTitle}>{request.title}</p>
                <p className={styles.claimDates}>
                    {range}
                    {duration && <span> · {duration}</span>}
                </p>
            </div>

            <div className={styles.chipRow}>
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
                {squadLine && <span className={styles.chip}>{squadLine}</span>}
                {request.positions.map((position) => (
                    <span key={position.id} className={styles.chip}>
                        {position.name}
                    </span>
                ))}
            </div>

            {request.description && (
                <p className={styles.claimDescription}>{request.description}</p>
            )}

            {/* History rows carry the call that was made, and the way to
                change it — clubs learn things after the fact. */}
            {decided && (
                <span
                    className={
                        isVerified ? styles.statusVerified : styles.statusRejected
                    }
                >
                    <Icon
                        icon={isVerified ? "mdi:check-decagram" : "mdi:close-circle-outline"}
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

// ── Page ──────────────────────────────────────────────────────

export default function OrgVerificationsPage() {
    const organizationId = useActingOrganizationId()
    const [tab, setTab] = useState<CareerReviewTab>("pending")

    const {
        data,
        isLoading,
        isError,
        error,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
    } = useVerificationRequests(tab)

    const verify = useVerifyCareerEntry()
    const reject = useRejectCareerEntry()

    const [rejectingId, setRejectingId] = useState<string | null>(null)
    const [actingId, setActingId] = useState<string | null>(null)

    const handleVerify = async (request: CareerVerificationRequest) => {
        setActingId(request.id)
        try {
            await verify.mutateAsync({
                entryId: request.id,
                userId: request.user.id,
                tab,
            })
            toast.success(
                `Verified — ${request.user.name || request.user.username}'s entry now shows your check mark`
            )
        } catch {
            // The hook restores the row and toasts the server's message.
        } finally {
            setActingId(null)
        }
    }

    const handleReject = async (
        request: CareerVerificationRequest,
        reason: string
    ) => {
        setActingId(request.id)
        try {
            await reject.mutateAsync({
                entryId: request.id,
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

    // ── No acting org ─────────────────────────────────────────
    // The query is disabled without one, and a disabled query looks exactly
    // like an empty one — so this has to be checked before the empty state,
    // or "not acting as an org" silently reads as "nothing pending".
    if (!organizationId) {
        return (
            <div className={styles.page}>
                <h1 className={styles.title}>Verifications</h1>
                <div className={styles.stateCard}>
                    <Icon icon="mdi:account-switch-outline" width={36} height={36} />
                    <p className={styles.stateTitle}>Switch to your club</p>
                    <p className={styles.stateText}>
                        Career claims are reviewed as a club. Pick one from the
                        account switcher to see its queue.
                    </p>
                </div>
            </div>
        )
    }

    // ── Loading ───────────────────────────────────────────────
    if (isLoading) {
        return (
            <div className={styles.page}>
                <h1 className={styles.title}>Verifications</h1>
                {tabs}
                <div className={styles.skeletonList}>
                    <div className={styles.skeletonCard} />
                    <div className={styles.skeletonCard} />
                </div>
            </div>
        )
    }

    // ── Error / permission ────────────────────────────────────
    if (isError) {
        const forbidden = isAxiosError(error) && error.response?.status === 403

        return (
            <div className={styles.page}>
                <h1 className={styles.title}>Verifications</h1>
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
                            ? "Only owners and admins can review career claims. Ask someone with those permissions to take a look."
                            : "We couldn't load the verification queue. Try again in a moment."}
                    </p>
                </div>
            </div>
        )
    }

    const requests = data?.pages.flatMap((page) => page.results) ?? []
    const total = data?.pages[0]?.count ?? 0
    const isPendingTab = tab === "pending"

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <h1 className={styles.title}>Verifications</h1>
                {total > 0 && <span className={styles.countPill}>{total}</span>}
            </div>
            <p className={styles.subtitle}>
                {isPendingTab
                    ? "Players who listed your club on their career and are waiting on your confirmation."
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
                            ? "No pending verifications"
                            : "Nothing decided yet"}
                    </p>
                    <p className={styles.stateText}>
                        {isPendingTab
                            ? "New requests appear here when someone adds your club to their career."
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
                                        {requests.length} of {total}
                                    </span>
                                </>
                            )}
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}
