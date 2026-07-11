"use client"

/**
 * ApplicantDetailDrawer — read-only. Right-side drawer on desktop, bottom
 * sheet on mobile. Shows the shared contact details + every custom-question
 * answer, plus a link to the applicant's public profile.
 */

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { Icon } from "@iconify/react"
import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { getApiErrorMessage } from "@/core/api/getApiErrorMessage"
import { useNavigation } from "@/shared/services/navigation.service"
import {
  useApplicationDetail,
  useUpdateApplicationStatus,
} from "../../hooks/useRecruitments"
import { APPLICATION_STATUS_META } from "../../applicationStatus"
import type {
  ApplicationAnswer,
  ApplicationStatus,
  SingleStatusTarget,
} from "../../services/recruitments.api"
import StatusBadge from "../StatusBadge/StatusBadge"
import styles from "./ApplicantDetailDrawer.module.css"

dayjs.extend(relativeTime)

// Org status targets — display label + backend value + one-line description.
// `invited` is intentionally excluded (reserved for personal invites).
const STATUS_OPTIONS: {
  status: SingleStatusTarget
  label: string
  description: string
}[] = [
  { status: "reviewing", label: "Reviewing", description: "Application is under review" },
  { status: "shortlisted", label: "Shortlist", description: "Add to the shortlist for a closer look" },
  { status: "selected", label: "Select", description: "Confirm this player is selected" },
  { status: "rejected", label: "Reject", description: "Not moving forward — the player is notified" },
]

// ── Set-status control (org, single change — select-style dropdown) ──

function SetStatusSection({
  applicationId,
  recruitmentId,
  currentStatus,
}: {
  applicationId: string
  recruitmentId: string
  currentStatus: ApplicationStatus
}) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [rejectConfirm, setRejectConfirm] = useState(false)
  const { mutate: updateStatus, isPending } = useUpdateApplicationStatus()
  const ref = useRef<HTMLDivElement>(null)

  // Close the menu on outside click / Escape (drawer-local, not a portal).
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setRejectConfirm(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false)
        setRejectConfirm(false)
      }
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const run = (target: SingleStatusTarget) => {
    updateStatus(
      { applicationId, recruitmentId, status: target },
      {
        onSuccess: () => {
          setOpen(false)
          setRejectConfirm(false)
          toast.show({
            title: `Status updated to ${STATUS_OPTIONS.find((o) => o.status === target)?.label ?? target}`,
            variant: "success",
          })
        },
        onError: (err) => {
          toast.show({
            title: getApiErrorMessage(err, "Couldn't update the status."),
            variant: "error",
          })
        },
      }
    )
  }

  return (
    <section className={styles.section}>
      <p className={styles.sectionTitle}>Status</p>

      <div className={styles.statusSelect} ref={ref}>
        <button
          className={styles.statusTrigger}
          onClick={() => { setOpen((o) => !o); setRejectConfirm(false) }}
          disabled={isPending}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className={styles.triggerLabel}>Update status</span>
          <span className={styles.triggerRight}>
            <StatusBadge status={currentStatus} />
            <Icon
              icon="mdi:chevron-down"
              width={18}
              height={18}
              className={`${styles.triggerChevron} ${open ? styles.triggerChevronOpen : ""}`}
            />
          </span>
        </button>

        {open && (
          <div className={styles.statusMenu} role="listbox">
            {rejectConfirm ? (
              <div className={styles.rejectConfirm} role="alertdialog" aria-label="Confirm reject">
                <p className={styles.rejectConfirmText}>
                  Reject this application? The applicant will be notified.
                </p>
                <div className={styles.rejectConfirmActions}>
                  <button
                    className={styles.rejectCancel}
                    onClick={() => setRejectConfirm(false)}
                    disabled={isPending}
                    type="button"
                  >
                    Back
                  </button>
                  <button
                    className={styles.rejectConfirmBtn}
                    onClick={() => run("rejected")}
                    disabled={isPending}
                    type="button"
                  >
                    {isPending
                      ? <span className={styles.miniSpinner} aria-hidden="true" />
                      : <Icon icon="mdi:close-circle-outline" width={15} height={15} />}
                    Reject
                  </button>
                </div>
              </div>
            ) : (
              STATUS_OPTIONS.map((opt) => {
                const meta = APPLICATION_STATUS_META[opt.status]
                const isCurrent = currentStatus === opt.status
                return (
                  <button
                    key={opt.status}
                    className={`${styles.statusOption} ${isCurrent ? styles.statusOptionCurrent : ""}`}
                    onClick={() => {
                      if (isCurrent) return
                      if (opt.status === "rejected") setRejectConfirm(true)
                      else run(opt.status)
                    }}
                    disabled={isCurrent || isPending}
                    role="option"
                    aria-selected={isCurrent}
                    type="button"
                  >
                    <span className={`${styles.optionIcon} ${styles[meta.colorClass]}`}>
                      <Icon icon={meta.icon} width={18} height={18} />
                    </span>
                    <span className={styles.optionText}>
                      <span className={styles.optionLabel}>{opt.label}</span>
                      <span className={styles.optionDesc}>{opt.description}</span>
                    </span>
                    {isCurrent && (
                      <Icon icon="mdi:check" width={16} height={16} className={styles.optionCheck} />
                    )}
                  </button>
                )
              })
            )}
          </div>
        )}
      </div>
    </section>
  )
}

function AnswerBlock({ answer }: { answer: ApplicationAnswer }) {
  const hasOptions = answer.selected_options.length > 0
  const hasText = answer.answer_text.trim().length > 0
  return (
    <div className={styles.answerBlock}>
      <p className={styles.answerQuestion}>{answer.question}</p>
      {hasOptions ? (
        <div className={styles.chips}>
          {answer.selected_options.map((value, i) => (
            <span key={i} className={styles.answerChip}>{value}</span>
          ))}
        </div>
      ) : hasText ? (
        <p className={styles.answerText}>{answer.answer_text}</p>
      ) : (
        <p className={styles.answerEmpty}>No answer</p>
      )}
    </div>
  )
}

interface ApplicantDetailDrawerProps {
  applicationId: string
  recruitmentId: string
  onClose: () => void
}

export default function ApplicantDetailDrawer({ applicationId, recruitmentId, onClose }: ApplicantDetailDrawerProps) {
  const { toProfile } = useNavigation()
  const { data, isLoading, isError } = useApplicationDetail(applicationId)

  // Scroll lock + Escape to close.
  useEffect(() => {
    const orig = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = orig
      window.removeEventListener("keydown", onKey)
    }
  }, [onClose])

  const applicant = data?.applicant

  // Portal to <body> so the fixed backdrop/drawer escapes any ancestor
  // containing block (transformed wrappers) and covers the full viewport.
  if (typeof document === "undefined") return null

  return createPortal(
    <div
      className={styles.backdrop}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label="Applicant details"
    >
      <div className={styles.panel}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <Avatar
              src={applicant?.avatar}
              initials={(data?.shared_name || applicant?.name)?.slice(0, 2).toUpperCase()}
              size="md"
            />
            <div className={styles.headerText}>
              <span className={styles.headerName}>{data?.shared_name || applicant?.name || "Applicant"}</span>
              {applicant?.username && <span className={styles.headerUsername}>@{applicant.username}</span>}
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} type="button" aria-label="Close">
            <Icon icon="mdi:close" width={20} height={20} />
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {isLoading ? (
            <div className={styles.loadingState}>
              <span className={styles.spinner} aria-hidden="true" />
              <span>Loading application…</span>
            </div>
          ) : isError || !data ? (
            <div className={styles.errorState}>
              <Icon icon="mdi:alert-circle-outline" width={28} height={28} />
              <p>Failed to load this application.</p>
            </div>
          ) : (
            <>
              {/* Status + applied time */}
              <div className={styles.statusRow}>
                <StatusBadge status={data.status} />
                <span className={styles.appliedAt}>
                  <Icon icon="mdi:clock-outline" width={13} height={13} />
                  Applied {dayjs(data.applied_at).fromNow()}
                </span>
              </div>

              {/* Shared contact */}
              <section className={styles.section}>
                <p className={styles.sectionTitle}>Contact shared</p>
                <div className={styles.contactList}>
                  <div className={styles.contactRow}>
                    <Icon icon="mdi:account-outline" width={16} height={16} className={styles.contactIcon} />
                    <span className={styles.contactValue}>{data.shared_name}</span>
                  </div>
                  {data.shared_email ? (
                    <a className={styles.contactRow} href={`mailto:${data.shared_email}`}>
                      <Icon icon="mdi:email-outline" width={16} height={16} className={styles.contactIcon} />
                      <span className={styles.contactLink}>{data.shared_email}</span>
                    </a>
                  ) : null}
                  {data.shared_phone ? (
                    <a className={styles.contactRow} href={`tel:${data.shared_phone}`}>
                      <Icon icon="mdi:phone-outline" width={16} height={16} className={styles.contactIcon} />
                      <span className={styles.contactLink}>{data.shared_phone}</span>
                    </a>
                  ) : null}
                </div>
              </section>

              {/* Answers */}
              {data.answers.length > 0 && (
                <section className={styles.section}>
                  <p className={styles.sectionTitle}>Application answers</p>
                  <div className={styles.answerList}>
                    {data.answers.map((answer, i) => (
                      <AnswerBlock key={i} answer={answer} />
                    ))}
                  </div>
                </section>
              )}

              {/* Status controls — hidden entirely once withdrawn */}
              {data.status === "withdrawn" ? (
                <p className={styles.withdrawnNote}>
                  <Icon icon="mdi:undo-variant" width={15} height={15} />
                  This applicant withdrew their application.
                </p>
              ) : (
                <SetStatusSection
                  applicationId={applicationId}
                  recruitmentId={recruitmentId}
                  currentStatus={data.status}
                />
              )}

              {/* Public profile link */}
              {applicant?.username && (
                <Link
                  href={toProfile(applicant.username, "user")}
                  className={styles.profileLink}
                >
                  <Icon icon="mdi:account-circle-outline" width={17} height={17} />
                  View public profile
                  <Icon icon="mdi:arrow-right" width={15} height={15} className={styles.profileArrow} />
                </Link>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
