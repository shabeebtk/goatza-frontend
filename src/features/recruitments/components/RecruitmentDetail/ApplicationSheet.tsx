"use client"

/**
 * ApplicationSheet — "View application", in place.
 *
 * The mockup's applied state puts the application behind a "View application"
 * button with the note that withdraw lives inside it. There is no application
 * detail ROUTE in this app — the player-side application has only ever existed
 * as a banner on this page — so rather than invent a route (and a second data
 * fetch, and a back-navigation story nothing else needs), the button opens
 * this sheet over the page.
 *
 * Everything here is carried over from the old inline ApplicationBanner: the
 * status, the applied date, the withdraw confirm, and the withdrawn→reapply
 * path. That logic is unchanged — this is the redesign moving it, not
 * rewriting it.
 */

import { useEffect, useRef, useState } from "react"
import dayjs from "dayjs"
import { Icon } from "@iconify/react"

import Portal from "@/shared/components/ui/Portal/Portal"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { getApiErrorMessage } from "@/core/api/getApiErrorMessage"
import StatusBadge from "../StatusBadge/StatusBadge"
import { useWithdrawApplication } from "../../hooks/useRecruitments"
import type { RecruitmentDetail as TRecruitmentDetail } from "../../services/recruitments.api"
import styles from "./ApplicationSheet.module.css"

interface ApplicationSheetProps {
    r: TRecruitmentDetail
    onClose: () => void
    /** Opens the apply modal — the withdrawn→reapply path. */
    onReapply: () => void
}

export default function ApplicationSheet({
    r,
    onClose,
    onReapply,
}: ApplicationSheetProps) {
    const app = r.my_application!
    const toast = useToast()
    const dialogRef = useRef<HTMLDivElement>(null)
    const [confirming, setConfirming] = useState(false)
    const { mutate: withdraw, isPending } = useWithdrawApplication()

    const isWithdrawn = app.status === "withdrawn"
    // LinkedIn-style: withdraw is allowed from ANY status except withdrawn.
    const canWithdraw = !isWithdrawn
    // Once the outcome is final, keep withdraw available but de-emphasized.
    const isTerminal = app.status === "selected" || app.status === "rejected"
    // Resilient reapply: offer it whenever the app is withdrawn + in-app apply,
    // driven by status/apply_method (not can_apply) so it can't silently vanish
    // if can_apply is momentarily stale. can_apply only gates enabled vs
    // disabled — the server stays the real gate on submit.
    const showReapply = isWithdrawn && r.apply_method === "goatza"
    const reapplyEnabled = showReapply && r.can_apply

    // Scroll lock + focus, tied to mount so neither can outlive the sheet.
    // Same contract as ImageLightbox; the previous overflow is restored rather
    // than cleared so opening this from anything that locked the page first
    // does not unlock a page that is still covered.
    useEffect(() => {
        const previouslyFocused = document.activeElement as HTMLElement | null
        const prevOverflow = document.body.style.overflow
        document.body.style.overflow = "hidden"
        dialogRef.current?.focus()
        return () => {
            document.body.style.overflow = prevOverflow
            previouslyFocused?.focus?.()
        }
    }, [])

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose()
        }
        document.addEventListener("keydown", onKey)
        return () => document.removeEventListener("keydown", onKey)
    }, [onClose])

    const doWithdraw = () => {
        withdraw(
            { applicationId: app.id, recruitmentId: r.id },
            {
                onSuccess: () => {
                    setConfirming(false)
                    toast.show({ title: "Application withdrawn", variant: "success" })
                },
                onError: (err) => {
                    toast.show({
                        title: getApiErrorMessage(err, "Couldn't withdraw. Please try again."),
                        variant: "error",
                    })
                },
            }
        )
    }

    return (
        <Portal>
            <div className={styles.backdrop} onClick={onClose}>
                <div
                    ref={dialogRef}
                    className={styles.sheet}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Your application"
                    tabIndex={-1}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className={styles.head}>
                        <span className={styles.headTitle}>Your application</span>
                        <button
                            className={styles.closeBtn}
                            type="button"
                            aria-label="Close"
                            onClick={onClose}
                        >
                            <Icon icon="mdi:close" width={20} height={20} />
                        </button>
                    </div>

                    <div className={styles.body}>
                        <div className={styles.statusRow}>
                            <StatusBadge status={app.status} />
                            {app.applied_at && !isWithdrawn && (
                                <span className={styles.appliedAt}>
                                    Applied {dayjs(app.applied_at).format("D MMM YYYY")}
                                </span>
                            )}
                        </div>

                        <p className={styles.note}>
                            {isWithdrawn
                                ? "You withdrew this application. You can apply again while the recruitment is open."
                                : "You'll be notified whenever the organiser moves your application."}
                        </p>

                        <dl className={styles.kvList}>
                            <div className={styles.kv}>
                                <dt className={styles.k}>Recruitment</dt>
                                <dd className={styles.v}>{r.title}</dd>
                            </div>
                            <div className={styles.kv}>
                                <dt className={styles.k}>Organisation</dt>
                                <dd className={styles.v}>{r.organization.name}</dd>
                            </div>
                            {app.age_category?.title && (
                                <div className={styles.kv}>
                                    <dt className={styles.k}>Age group</dt>
                                    <dd className={styles.v}>{app.age_category.title}</dd>
                                </div>
                            )}
                            {app.applied_at && (
                                <div className={styles.kv}>
                                    <dt className={styles.k}>Applied</dt>
                                    <dd className={styles.v}>
                                        {dayjs(app.applied_at).format("D MMM YYYY, h:mm A")}
                                    </dd>
                                </div>
                            )}
                            {app.updated_at && (
                                <div className={styles.kv}>
                                    <dt className={styles.k}>Last update</dt>
                                    <dd className={styles.v}>
                                        {dayjs(app.updated_at).fromNow()}
                                    </dd>
                                </div>
                            )}
                        </dl>

                        {showReapply && (
                            <>
                                <button
                                    className={styles.reapplyBtn}
                                    onClick={reapplyEnabled ? onReapply : undefined}
                                    disabled={!reapplyEnabled}
                                    type="button"
                                >
                                    <Icon icon="mdi:send-outline" width={15} height={15} />
                                    Reapply
                                </button>
                                {!reapplyEnabled && (
                                    <p className={styles.hint}>
                                        <Icon icon="mdi:information-outline" width={12} height={12} />
                                        Recruitment is no longer accepting applications
                                    </p>
                                )}
                            </>
                        )}

                        {canWithdraw && !confirming && (
                            <button
                                className={`${styles.withdrawBtn} ${isTerminal ? styles.withdrawMuted : ""}`}
                                onClick={() => setConfirming(true)}
                                type="button"
                            >
                                <Icon icon="mdi:undo-variant" width={15} height={15} />
                                Withdraw application
                            </button>
                        )}

                        {canWithdraw && confirming && (
                            <div
                                className={styles.confirm}
                                role="alertdialog"
                                aria-label="Confirm withdraw"
                            >
                                <p className={styles.confirmText}>
                                    Withdraw your application? The organization will no longer
                                    consider it. You can reapply while the recruitment is open.
                                </p>
                                <div className={styles.confirmActions}>
                                    <button
                                        className={styles.confirmCancel}
                                        onClick={() => setConfirming(false)}
                                        disabled={isPending}
                                        type="button"
                                    >
                                        Keep
                                    </button>
                                    <button
                                        className={styles.confirmGo}
                                        onClick={doWithdraw}
                                        disabled={isPending}
                                        type="button"
                                    >
                                        {isPending ? (
                                            <span className={styles.spinner} aria-hidden="true" />
                                        ) : (
                                            <Icon icon="mdi:undo-variant" width={15} height={15} />
                                        )}
                                        Withdraw
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </Portal>
    )
}
